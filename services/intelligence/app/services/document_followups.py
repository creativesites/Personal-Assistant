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
                WHERE d.document_type = 'quotation'
                  AND d.status NOT IN ('accepted', 'rejected', 'paid', 'archived', 'expired')
                  AND d.structured_data->>'validUntil' IS NOT NULL
                  AND (d.structured_data->>'validUntil')::date < CURRENT_DATE
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
                WHERE d.document_type = 'invoice'
                  AND d.status NOT IN ('paid', 'archived')
                  AND d.structured_data->>'dueDate' IS NOT NULL
                  AND (d.structured_data->>'dueDate')::date < CURRENT_DATE
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

            for row in overdue_invoices:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('document_followup_skipped_no_credits', document_id=row['id'])
                    continue
                days_overdue = (await conn.fetchval('SELECT CURRENT_DATE - $1::date', row['due_date']))
                title = f"Invoice {row['document_number']} overdue"
                body = f"{row['contact_name']}'s invoice is {days_overdue} day(s) overdue."
                draft = (
                    f"Hi {row['contact_name']}, a friendly reminder that invoice {row['document_number']} "
                    f"is now {days_overdue} day(s) overdue. Please let me know if you have any questions."
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, $5, 2, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body, draft,
                )
                await conn.execute(
                    "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'follow_up_suggested', '{}'::jsonb)",
                    row['id'],
                )
                created += 1

        log.info('document_followups_generated', count=created)
        return created
