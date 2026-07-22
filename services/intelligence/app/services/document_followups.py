"""Expiring-quotation / overdue-invoice follow-ups (plan §15 Phase 3) —
surfaced through the existing proactive_queue, not a new feed. Deliberately
template-based, not an AI call: whether a quotation's validUntil has
passed is a plain date comparison, and the nudge text doesn't need an LLM
to write "this quotation expired" — same reasoning already applied to the
business-stage derivation (§5) staying rule-based.
"""
import structlog

from ..database import get_pool
from .credits import try_consume_credit

log = structlog.get_logger()


class DocumentFollowupService:
    async def generate_for_all_users(self) -> int:
        pool = await get_pool()
        created = 0

        async with pool.acquire() as conn:
            expired_quotations = await conn.fetch(
                """
                SELECT d.id, d.user_id, d.contact_id, d.document_number, d.title,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                       (d.structured_data->>'validUntil')::date AS valid_until
                FROM documents d
                JOIN contacts c ON c.id = d.contact_id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = d.user_id
                WHERE d.document_type = 'quotation'
                  AND d.status NOT IN ('accepted', 'rejected', 'paid', 'archived', 'expired')
                  AND d.structured_data->>'validUntil' IS NOT NULL
                  AND (d.structured_data->>'validUntil')::date < CURRENT_DATE
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM document_events de
                    WHERE de.document_id = d.id AND de.event_type = 'follow_up_suggested'
                  )
                """
            )

            overdue_invoices = await conn.fetch(
                """
                SELECT d.id, d.user_id, d.contact_id, d.document_number, d.title,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                       (d.structured_data->>'dueDate')::date AS due_date
                FROM documents d
                JOIN contacts c ON c.id = d.contact_id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = d.user_id
                WHERE d.document_type = 'invoice'
                  AND d.status NOT IN ('paid', 'archived')
                  AND d.structured_data->>'dueDate' IS NOT NULL
                  AND (d.structured_data->>'dueDate')::date < CURRENT_DATE
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM document_events de
                    WHERE de.document_id = d.id AND de.event_type = 'follow_up_suggested'
                  )
                """
            )

            for row in expired_quotations:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('document_followup_skipped_no_credits', document_id=row['id'])
                    continue
                days_expired = (await conn.fetchval('SELECT CURRENT_DATE - $1::date', row['valid_until']))
                title = f"Quotation {row['document_number']} expired"
                body = f"{row['contact_name']}'s quotation expired {days_expired} day(s) ago without a response."
                draft = (
                    f"Hi {row['contact_name']}, just checking in — the quotation I sent "
                    f"({row['document_number']}) has expired. Let me know if you'd still like to go ahead, "
                    f"or if you need an updated one."
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, $5, 3, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body, draft,
                )
                await conn.execute(
                    "UPDATE documents SET status = 'expired', updated_at = NOW() WHERE id = $1", row['id'],
                )
                await conn.execute(
                    "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'expired', '{}'::jsonb), ($1, 'follow_up_suggested', '{}'::jsonb)",
                    row['id'],
                )
                created += 1

            # Multi-Stage Invoice Dunning Sequence (T-3 days, Due Date, T+3 Overdue, T+7 Overdue)
            invoice_dunning = await conn.fetch(
                """
                SELECT d.id, d.user_id, d.contact_id, d.document_number, d.title, d.currency, d.total_cents,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                       (d.structured_data->>'dueDate')::date AS due_date,
                       CURRENT_DATE - (d.structured_data->>'dueDate')::date AS days_diff
                FROM documents d
                JOIN contacts c ON c.id = d.contact_id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = d.user_id
                WHERE d.document_type = 'invoice'
                  AND d.status NOT IN ('paid', 'archived')
                  AND d.structured_data->>'dueDate' IS NOT NULL
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND (
                    (CURRENT_DATE - (d.structured_data->>'dueDate')::date = -3 AND NOT EXISTS (
                      SELECT 1 FROM document_events de WHERE de.document_id = d.id AND de.event_type = 'dunning_remind_3d_before'
                    ))
                    OR (CURRENT_DATE = (d.structured_data->>'dueDate')::date AND NOT EXISTS (
                      SELECT 1 FROM document_events de WHERE de.document_id = d.id AND de.event_type = 'dunning_remind_due_today'
                    ))
                    OR (CURRENT_DATE - (d.structured_data->>'dueDate')::date = 3 AND NOT EXISTS (
                      SELECT 1 FROM document_events de WHERE de.document_id = d.id AND de.event_type = 'dunning_remind_3d_overdue'
                    ))
                    OR (CURRENT_DATE - (d.structured_data->>'dueDate')::date >= 7 AND NOT EXISTS (
                      SELECT 1 FROM document_events de WHERE de.document_id = d.id AND de.event_type = 'dunning_remind_7d_overdue'
                    ))
                  )
                """
            )

            for row in invoice_dunning:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    continue
                
                days_diff = row['days_diff']
                amount_fmt = f"{row['currency'] or 'USD'} {(float(row['total_cents'] or 0)/100):.2f}"
                
                if days_diff == -3:
                    event_type = 'dunning_remind_3d_before'
                    title = f"Upcoming Invoice {row['document_number']}"
                    body = f"Invoice {row['document_number']} for {row['contact_name']} is due in 3 days."
                    draft = f"Hi {row['contact_name']}, just a quick heads up that Invoice {row['document_number']} ({amount_fmt}) is due in 3 days."
                elif days_diff == 0:
                    event_type = 'dunning_remind_due_today'
                    title = f"Invoice {row['document_number']} Due Today"
                    body = f"Invoice {row['document_number']} for {row['contact_name']} is due today."
                    draft = f"Hi {row['contact_name']}, friendly reminder that Invoice {row['document_number']} ({amount_fmt}) is due today."
                elif days_diff == 3:
                    event_type = 'dunning_remind_3d_overdue'
                    title = f"Invoice {row['document_number']} Overdue (3 Days)"
                    body = f"Invoice {row['document_number']} for {row['contact_name']} is 3 days overdue."
                    draft = f"Hi {row['contact_name']}, checking in on Invoice {row['document_number']} ({amount_fmt}), which was due 3 days ago. Please let us know if you need assistance."
                else:
                    event_type = 'dunning_remind_7d_overdue'
                    title = f"Invoice {row['document_number']} Overdue ({days_diff} Days) + Statement"
                    body = f"Invoice {row['document_number']} is {days_diff} days overdue. Auto-attaching Client Account Statement."
                    draft = f"Hi {row['contact_name']}, Invoice {row['document_number']} ({amount_fmt}) is now {days_diff} days overdue. Here is a summary of your account statement."

                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, $5, 2, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body, draft,
                )
                await conn.execute(
                    "UPDATE documents SET status = 'overdue', updated_at = NOW() WHERE id = $1 AND status != 'overdue'",
                    row['id'],
                )
                await conn.execute(
                    f"INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, '{event_type}', '{{}}'::jsonb)",
                    row['id'],
                )
                created += 1

        log.info('document_followups_generated', count=created)
        return created
