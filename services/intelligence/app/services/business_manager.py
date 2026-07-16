"""Business Manager Assistant (docs/BUSINESS_EVENTS_PLAN.md Part E) — a
proactive, toggleable nudge layer that lives throughout the system,
encouraging a user to formalize their business (e.g. draft an invoice even
when they don't strictly need to send it) rather than only reacting when
asked. Reuses existing mechanisms end-to-end: `proactive_queue` for the
approvable draft (same dock as document_followups.py/project_progress.py)
and `business_events` (Part A) both as the audit trail and as this cron's
own dedup marker.

Gated on `advisor_user_profiles.business_manager_paused = false` — same
"paused=false means on by default, honest kill switch" precedent as
`companion_features_paused`. A user with no profile row yet is treated as
un-paused (COALESCE ... false) so the feature really is on by default, not
only after some other flow happens to create a profile row first.

Phase 1 ships one concrete behavior, deliberately narrow — "completed
work, no invoice": a project crossing the same >=75% task-completion
threshold project_progress.py already tracks, OR a deal reaching
stage='closed_won', with NO invoice/quotation document linked to that
contact in the last N days. Deliberately not an AI call — same reasoning
as project_progress.py/document_followups.py: this is a plain comparison,
not something an LLM needs to determine honestly. Every other Business
Manager behavior from the wider brainstorm (stale supplier comparisons,
"customer became a top client," overdue follow-ups) is documented as a
same-shaped follow-on cron in docs/BUSINESS_EVENTS_PLAN.md §9 Part G, not
built in this pass.
"""
import structlog

from ..database import get_pool
from .business_events import BusinessEventService
from .credits import try_consume_credit

log = structlog.get_logger()

_PROGRESS_THRESHOLD = 0.75
_RECENT_INVOICE_WINDOW_DAYS = 30

_business_events = BusinessEventService()


class BusinessManagerService:
    async def generate_for_all_users(self) -> int:
        pool = await get_pool()
        created = 0

        async with pool.acquire() as conn:
            projects_without_invoice = await conn.fetch(
                """
                SELECT p.id AS project_id, p.user_id, p.contact_id, p.title,
                       COUNT(pt.id) AS task_count,
                       COUNT(pt.id) FILTER (WHERE pt.status = 'done') AS done_task_count,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM projects p
                JOIN contacts c ON c.id = p.contact_id
                JOIN project_tasks pt ON pt.project_id = p.id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = p.user_id
                WHERE p.status = 'active'
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM documents d
                    WHERE d.user_id = p.user_id AND d.contact_id = p.contact_id
                      AND d.document_type IN ('invoice', 'quotation')
                      AND d.created_at >= NOW() - make_interval(days => $1)
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = p.user_id AND be.event_type = 'invoice_gap'
                      AND be.payload->>'projectId' = p.id::text
                  )
                GROUP BY p.id, p.user_id, p.contact_id, p.title, c.custom_name, c.display_name, c.phone_number
                HAVING COUNT(pt.id) > 0
                   AND COUNT(pt.id) FILTER (WHERE pt.status = 'done')::float / COUNT(pt.id) >= $2
                """,
                _RECENT_INVOICE_WINDOW_DAYS, _PROGRESS_THRESHOLD,
            )

            deals_without_invoice = await conn.fetch(
                """
                SELECT dl.id AS deal_id, dl.user_id, dl.contact_id, dl.title,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM deals dl
                JOIN contacts c ON c.id = dl.contact_id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = dl.user_id
                WHERE dl.stage = 'closed_won'
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM documents doc
                    WHERE doc.user_id = dl.user_id AND doc.contact_id = dl.contact_id
                      AND doc.document_type IN ('invoice', 'quotation')
                      AND doc.created_at >= dl.updated_at - INTERVAL '2 days'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = dl.user_id AND be.event_type = 'invoice_gap'
                      AND be.payload->>'dealId' = dl.id::text
                  )
                """
            )

            for row in projects_without_invoice:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('business_manager_skipped_no_credits', project_id=row['project_id'])
                    continue
                pct = round(row['done_task_count'] / row['task_count'] * 100)
                evidence = f"Project \"{row['title']}\" is {pct}% complete with no invoice or quotation on file"
                title = f"No invoice yet: {row['title']}"
                body = (
                    f"{row['contact_name']}'s project \"{row['title']}\" is {pct}% complete with no "
                    f"invoice or quotation on file — want Zuri to draft one for your records?"
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, priority, status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, 3, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body,
                )
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='invoice_gap', contact_id=str(row['contact_id']),
                    confidence=0.8, evidence=[evidence], payload={'projectId': str(row['project_id'])},
                )
                log.info('business_manager_invoice_gap', kind='project', event_id=event_id)
                created += 1

            for row in deals_without_invoice:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('business_manager_skipped_no_credits', deal_id=row['deal_id'])
                    continue
                evidence = f"Deal \"{row['title']}\" closed won with no invoice or quotation on file"
                title = f"No invoice yet: {row['title']}"
                body = (
                    f"{row['contact_name']}'s deal \"{row['title']}\" closed won with no invoice or "
                    f"quotation on file — want Zuri to draft one for your records?"
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, priority, status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, 3, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body,
                )
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='invoice_gap', contact_id=str(row['contact_id']),
                    confidence=0.8, evidence=[evidence], payload={'dealId': str(row['deal_id'])},
                )
                log.info('business_manager_invoice_gap', kind='deal', event_id=event_id)
                created += 1

        log.info('business_manager_generated', count=created)
        return created
