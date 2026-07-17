"""The Zuri Reality Engine (Phase 1) — see docs/REALITY_ENGINE_PLAN.md. Keeps
Zuri's own AI-generated artifacts (proactive_queue nudges, business_events)
synchronized with reality across three cadences: Layer 1 event-driven
(`resolve_relationship_nudges`, called live from message_worker.py — see
Hook B in reality-engine.ts for the Node-side invoice-gap counterpart),
Layer 2 hourly contradiction detection (`run_hourly_sweep`), and Layer 3
daily stale-row expiry (`run_daily_sweep`). Platform Polish Phase 0 (see
docs/PLATFORM_POLISH_PLAN.md §2) extended Layer 3 to also close
`opportunities` rows past their own `expires_at`/recovered `churn_risk`
rows, and to decay weak `business_facts`/`contact_insights` confidence —
the same "nothing goes stale" mandate, applied to two tables that
previously only ever wrote forward.

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
from .business_memory_maintenance import get_business_memory_maintenance

log = structlog.get_logger()

_business_events = BusinessEventService()
_memory_maintenance = get_business_memory_maintenance()

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

            # Career & Growth Engine Phase 7 (docs/CAREER_GROWTH_ENGINE_PLAN.md
            # §14) — same detect-and-surface-only shape: an application
            # sitting in 'applied' with no movement past a threshold.
            stalled_applications = await conn.fetch(
                """
                SELECT co.id AS opportunity_id, co.user_id, co.title, co.company_or_org
                FROM career_opportunities co
                WHERE co.status = 'applied' AND co.updated_at < NOW() - INTERVAL '21 days'
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.event_type = 'contradiction_stalled_application'
                      AND be.payload->>'opportunityId' = co.id::text
                      AND be.created_at >= NOW() - INTERVAL '21 days'
                  )
                """
            )
            for row in stalled_applications:
                await _business_events.record(
                    str(row['user_id']), 'contradiction_stalled_application',
                    confidence=1.0,
                    evidence=[f"\"{row['title']}\"" + (f" at {row['company_or_org']}" if row['company_or_org'] else '') + " has been in 'applied' status for 21+ days with no movement"],
                    payload={'opportunityId': str(row['opportunity_id'])},
                )
                found += 1

            # An interview past its scheduled date with no outcome recorded.
            overdue_interviews = await conn.fetch(
                """
                SELECT ci.id AS interview_id, ci.user_id, ci.scheduled_at, co.title, co.company_or_org
                FROM career_interviews ci JOIN career_opportunities co ON co.id = ci.career_opportunity_id
                WHERE ci.outcome = 'pending' AND ci.scheduled_at IS NOT NULL
                  AND ci.scheduled_at < NOW() - INTERVAL '2 days'
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.event_type = 'contradiction_interview_overdue_outcome'
                      AND be.payload->>'interviewId' = ci.id::text
                  )
                """
            )
            for row in overdue_interviews:
                await _business_events.record(
                    str(row['user_id']), 'contradiction_interview_overdue_outcome',
                    confidence=1.0,
                    evidence=[f"Interview for \"{row['title']}\"" + (f" at {row['company_or_org']}" if row['company_or_org'] else '') + f" was scheduled {row['scheduled_at']} with no outcome logged yet"],
                    payload={'interviewId': str(row['interview_id'])},
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

            # Platform Polish Phase 0 §2.3 — opportunities.expires_at is
            # advisory-only today; nothing else ever closes a row past it.
            expired_opportunity_rows = await conn.fetch(
                """UPDATE opportunities SET status = 'expired', resolved_at = NOW()
                   WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < NOW()
                   RETURNING id, user_id"""
            )
            expired += len(expired_opportunity_rows)

            # A churn_risk flag raised while health was declining should
            # close itself once the relationship has since recovered —
            # otherwise it just sits 'open' forever even after the thing
            # it warned about stopped being true.
            recovered_churn_rows = await conn.fetch(
                """UPDATE opportunities o SET status = 'expired', resolved_at = NOW()
                   FROM relationships r
                   WHERE o.contact_id = r.contact_id AND o.status = 'open'
                     AND o.opportunity_type = 'churn_risk' AND r.health_trend = 'improving'
                   RETURNING o.id, o.user_id"""
            )
            expired += len(recovered_churn_rows)

            by_user: dict[str, int] = {}
            for row in [
                *nudge_rows, *bundle_rows, *event_rows, *gossip_rows,
                *expired_opportunity_rows, *recovered_churn_rows,
            ]:
                uid = str(row['user_id'])
                by_user[uid] = by_user.get(uid, 0) + 1
            for user_id, count in by_user.items():
                await _business_events.record(
                    user_id, 'nudge_auto_resolved', confidence=1.0,
                    evidence=[f"Daily sweep expired {count} stale item(s) untouched for 14+ days"],
                    payload={'sweptCount': count},
                )

        # §2.2 — same "cognitive garbage collection" job, a different table:
        # weak, unreinforced business_facts/contact_insights rows decay the
        # same way advisor_memories already does.
        expired += await _memory_maintenance.deactivate_weak_facts()

        log.info('reality_engine_daily_sweep', expired=expired)
        return expired
