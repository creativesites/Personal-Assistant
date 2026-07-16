"""The Zuri Reality Engine (Phase 1) — see docs/REALITY_ENGINE_PLAN.md. Keeps
Zuri's own AI-generated artifacts (proactive_queue nudges, business_events)
synchronized with reality across three cadences: Layer 1 event-driven
(`resolve_relationship_nudges`, called live from message_worker.py — see
Hook B in reality-engine.ts for the Node-side invoice-gap counterpart),
Layer 2 hourly contradiction detection (`run_hourly_sweep`), and Layer 3
daily stale-row expiry (`run_daily_sweep`).

Deliberately reuses `business_events` (migration 0076) as its own log rather
than a new generic table — new event_type values only. No new LLM calls
anywhere in this file: every check here is a plain SQL comparison between
two already-observed facts, same "deterministic insights" discipline as
project_progress.py/business_manager.py. Contradictions are detected and
logged only — never auto-mutated (see plan §2's safety boundary): the
Reality Engine only ever changes rows it created itself
(proactive_queue/business_events), never a user's own business record.
"""
import json
import structlog

from ..database import get_pool
from ..queue import publish_event
from .business_events import BusinessEventService

log = structlog.get_logger()

_business_events = BusinessEventService()

_STALE_NUDGE_DAYS = 14
_STALE_BUNDLE_DAYS = 7


class RealityEngineService:
    async def resolve_relationship_nudges(self, user_id: str, contact_id: str, reason: str) -> int:
        """Layer 1 — a live outbound reply makes a pending check-in/follow-up/
        reconnect nudge for that contact moot."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """UPDATE proactive_queue
                     SET status = 'auto_resolved', resolved_reason = $1, updated_at = NOW()
                   WHERE user_id = $2 AND contact_id = $3 AND status = 'pending'
                     AND suggestion_type IN ('check_in', 'follow_up', 'reconnect')
                     AND NOT EXISTS (
                       SELECT 1 FROM advisor_user_profiles aup
                       WHERE aup.user_id = $2 AND aup.reality_engine_paused = TRUE
                     )
                   RETURNING id""",
                reason, user_id, contact_id,
            )
        if not rows:
            return 0
        await _business_events.record(
            user_id, 'nudge_auto_resolved', contact_id=contact_id,
            confidence=1.0, evidence=[reason],
            payload={'resolvedCount': len(rows), 'proactiveQueueIds': [str(r['id']) for r in rows]},
        )
        await publish_event(
            f'reality.resolved:{user_id}',
            json.dumps({'contactId': contact_id, 'count': len(rows), 'reason': reason}),
        )
        log.info('reality_engine_resolved_relationship_nudges', user_id=user_id, contact_id=contact_id, count=len(rows))
        return len(rows)

    async def run_hourly_sweep(self) -> int:
        """Layer 2 — deterministic contradiction detection, no LLM call.
        Detect-and-surface only; never mutates the underlying business row."""
        pool = await get_pool()
        found = 0

        async with pool.acquire() as conn:
            invoice_deal_mismatches = await conn.fetch(
                """
                SELECT DISTINCT d.user_id, d.contact_id, doc.id AS document_id, dl.id AS deal_id,
                       doc.document_number, dl.title AS deal_title
                FROM documents doc
                JOIN deals dl ON dl.id = doc.deal_id
                JOIN contacts d ON d.id = doc.contact_id
                WHERE doc.document_type = 'invoice' AND doc.status = 'paid'
                  AND dl.stage NOT IN ('closed_won', 'closed_lost')
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.event_type = 'contradiction_invoice_paid_deal_open'
                      AND be.payload->>'dealId' = dl.id::text AND be.payload->>'documentId' = doc.id::text
                  )
                """
            )
            for row in invoice_deal_mismatches:
                evidence = [
                    f"Invoice {row['document_number'] or row['document_id']} is paid",
                    f"Deal \"{row['deal_title']}\" is still open",
                ]
                await _business_events.record(
                    str(row['user_id']), 'contradiction_invoice_paid_deal_open', contact_id=str(row['contact_id']),
                    confidence=1.0, evidence=evidence,
                    payload={'dealId': str(row['deal_id']), 'documentId': str(row['document_id'])},
                )
                found += 1

            negative_inventory = await conn.fetch(
                """
                SELECT p.id AS product_id, p.user_id, p.name
                FROM products p
                WHERE p.track_inventory AND p.available < 0 AND p.incoming = 0
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.event_type = 'contradiction_negative_inventory'
                      AND be.payload->>'productId' = p.id::text
                      AND be.created_at >= NOW() - INTERVAL '7 days'
                  )
                """
            )
            for row in negative_inventory:
                await _business_events.record(
                    str(row['user_id']), 'contradiction_negative_inventory',
                    confidence=1.0,
                    evidence=[f"\"{row['name']}\" shows negative available stock with nothing incoming"],
                    payload={'productId': str(row['product_id'])},
                )
                found += 1

            projects_incomplete = await conn.fetch(
                """
                SELECT p.id AS project_id, p.user_id, p.title,
                       COUNT(pt.id) AS task_count,
                       COUNT(pt.id) FILTER (WHERE pt.status = 'done') AS done_task_count
                FROM projects p
                JOIN project_tasks pt ON pt.project_id = p.id
                WHERE p.status = 'completed'
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.event_type = 'contradiction_project_complete_tasks_incomplete'
                      AND be.payload->>'projectId' = p.id::text
                  )
                GROUP BY p.id, p.user_id, p.title
                HAVING COUNT(pt.id) > 0
                   AND COUNT(pt.id) FILTER (WHERE pt.status = 'done')::float / COUNT(pt.id) < 1.0
                """
            )
            for row in projects_incomplete:
                pct = round(row['done_task_count'] / row['task_count'] * 100)
                await _business_events.record(
                    str(row['user_id']), 'contradiction_project_complete_tasks_incomplete',
                    confidence=1.0,
                    evidence=[f"Project \"{row['title']}\" is marked completed but only {pct}% of tasks are done"],
                    payload={'projectId': str(row['project_id'])},
                )
                found += 1

        log.info('reality_engine_hourly_sweep', contradictions_found=found)
        return found

    async def run_daily_sweep(self) -> int:
        """Layer 3 — cognitive garbage collection: finally write to the
        already-declared-but-dead 'expired'/'auto_resolved' terminal states."""
        pool = await get_pool()
        expired = 0

        async with pool.acquire() as conn:
            nudge_rows = await conn.fetch(
                """UPDATE proactive_queue SET status = 'auto_resolved',
                     resolved_reason = 'No longer relevant after 14 days', updated_at = NOW()
                   WHERE status = 'pending' AND created_at < NOW() - INTERVAL '14 days'
                   RETURNING id, user_id"""
            )
            expired += len(nudge_rows)

            bundle_rows = await conn.fetch(
                """UPDATE action_bundles SET status = 'expired', resolved_at = NOW()
                   WHERE status = 'pending' AND detected_at < NOW() - INTERVAL '7 days'
                   RETURNING id, user_id"""
            )
            expired += len(bundle_rows)

            event_rows = await conn.fetch(
                """UPDATE business_events SET status = 'expired'
                   WHERE status = 'pending' AND created_at < NOW() - INTERVAL '14 days'
                   RETURNING id, user_id"""
            )
            expired += len(event_rows)

            gossip_rows = await conn.fetch(
                """UPDATE gossip_worthy_events SET status = 'expired'
                   WHERE status = 'pending' AND created_at < NOW() - INTERVAL '14 days'
                   RETURNING id, user_id"""
            )
            expired += len(gossip_rows)

            by_user: dict[str, int] = {}
            for row in [*nudge_rows, *bundle_rows, *event_rows, *gossip_rows]:
                uid = str(row['user_id'])
                by_user[uid] = by_user.get(uid, 0) + 1
            for user_id, count in by_user.items():
                await _business_events.record(
                    user_id, 'nudge_auto_resolved', confidence=1.0,
                    evidence=[f"Daily sweep expired {count} stale item(s) untouched for 14+ days"],
                    payload={'sweptCount': count},
                )

        log.info('reality_engine_daily_sweep', expired=expired)
        return expired
