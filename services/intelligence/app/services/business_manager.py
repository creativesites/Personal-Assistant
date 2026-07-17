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

            # §5.5 — a wider net than the project/deal-scoped checks above:
            # any contact already marked a customer who has NEVER had a
            # single invoice or quotation generated, regardless of whether
            # they have an active project or a closed deal on file.
            customers_without_any_invoice = await conn.fetch(
                """
                SELECT c.id AS contact_id, c.user_id,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM contacts c
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = c.user_id
                WHERE c.customer_status = 'customer'
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM documents d
                    WHERE d.user_id = c.user_id AND d.contact_id = c.id
                      AND d.document_type IN ('invoice', 'quotation')
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = c.user_id AND be.event_type = 'invoice_gap'
                      AND be.payload->>'contactId' = c.id::text
                  )
                """
            )

            # §5.6 — dormant-customer win-back: a customer whose relationship
            # health is declining and who hasn't purchased (or been
            # invoiced) in 60+ days. Commercially framed, distinct from the
            # personal check_in/reconnect nudges clock_engine.py generates
            # for non-customer contacts.
            dormant_customers = await conn.fetch(
                """
                SELECT * FROM (
                  SELECT c.id AS contact_id, c.user_id,
                         COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                         GREATEST(
                           COALESCE(inv.last_invoice_at, '-infinity'::timestamptz),
                           COALESCE(cp.last_purchase_at, '-infinity'::timestamptz)
                         ) AS last_commercial_activity_at
                  FROM contacts c
                  JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
                  LEFT JOIN advisor_user_profiles aup ON aup.user_id = c.user_id
                  LEFT JOIN LATERAL (
                    SELECT MAX(created_at) AS last_invoice_at FROM documents
                    WHERE contact_id = c.id AND user_id = c.user_id AND document_type IN ('invoice', 'quotation')
                  ) inv ON true
                  LEFT JOIN LATERAL (
                    SELECT MAX(updated_at) AS last_purchase_at FROM contact_products
                    WHERE contact_id = c.id AND user_id = c.user_id AND relation_type = 'purchased'
                  ) cp ON true
                  WHERE c.customer_status = 'customer' AND r.health_trend = 'declining'
                    AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                    AND NOT EXISTS (
                      SELECT 1 FROM business_events be
                      WHERE be.user_id = c.user_id AND be.event_type = 'dormant_customer_alert'
                        AND be.contact_id = c.id AND be.created_at > NOW() - INTERVAL '30 days'
                    )
                ) x
                WHERE x.last_commercial_activity_at > '-infinity'::timestamptz
                  AND x.last_commercial_activity_at < NOW() - INTERVAL '60 days'
                """
            )

            for row in dormant_customers:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('business_manager_skipped_no_credits', contact_id=row['contact_id'])
                    continue
                days_dormant = (await conn.fetchval(
                    'SELECT EXTRACT(DAY FROM NOW() - $1::timestamptz)::int', row['last_commercial_activity_at'],
                ))
                evidence = f"\"{row['contact_name']}\" hasn't purchased or been invoiced in {days_dormant} days, and their relationship health is declining"
                title = f"Win back {row['contact_name']}?"
                body = (
                    f"{row['contact_name']} hasn't bought anything in {days_dormant} days and their "
                    f"relationship health is trending down — want Zuri to draft a check-in or a special offer?"
                )
                draft = f"Hi {row['contact_name']}, it's been a while — just checking in. Anything I can help with?"
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='dormant_customer_alert', contact_id=str(row['contact_id']),
                    confidence=0.7, evidence=[evidence], payload={'contactId': str(row['contact_id']), 'daysDormant': days_dormant},
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date, business_event_id)
                       VALUES ($1, $2, 'reconnect', $3, $4, $5, 3, 'pending', CURRENT_DATE, $6)""",
                    row['user_id'], row['contact_id'], title, body, draft, event_id,
                )
                log.info('business_manager_dormant_customer', event_id=event_id)
                created += 1

            for row in customers_without_any_invoice:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('business_manager_skipped_no_credits', contact_id=row['contact_id'])
                    continue
                evidence = f"\"{row['contact_name']}\" is marked as a customer but has never had an invoice or quotation on file"
                title = f"No invoice on file: {row['contact_name']}"
                body = (
                    f"{row['contact_name']} is marked as a customer but has never had an invoice or "
                    f"quotation generated — want Zuri to draft one?"
                )
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='invoice_gap', contact_id=str(row['contact_id']),
                    confidence=0.6, evidence=[evidence], payload={'contactId': str(row['contact_id'])},
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, priority, status, suggested_for_date, business_event_id)
                       VALUES ($1, $2, 'follow_up', $3, $4, 4, 'pending', CURRENT_DATE, $5)""",
                    row['user_id'], row['contact_id'], title, body, event_id,
                )
                log.info('business_manager_invoice_gap', kind='customer_never_invoiced', event_id=event_id)
                created += 1

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
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='invoice_gap', contact_id=str(row['contact_id']),
                    confidence=0.8, evidence=[evidence], payload={'projectId': str(row['project_id'])},
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, priority, status, suggested_for_date, business_event_id)
                       VALUES ($1, $2, 'follow_up', $3, $4, 3, 'pending', CURRENT_DATE, $5)""",
                    row['user_id'], row['contact_id'], title, body, event_id,
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
                event_id = await _business_events.record(
                    user_id=str(row['user_id']), event_type='invoice_gap', contact_id=str(row['contact_id']),
                    confidence=0.8, evidence=[evidence], payload={'dealId': str(row['deal_id'])},
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, priority, status, suggested_for_date, business_event_id)
                       VALUES ($1, $2, 'follow_up', $3, $4, 3, 'pending', CURRENT_DATE, $5)""",
                    row['user_id'], row['contact_id'], title, body, event_id,
                )
                log.info('business_manager_invoice_gap', kind='deal', event_id=event_id)
                created += 1

        log.info('business_manager_generated', count=created)
        return created
