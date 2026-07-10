from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog

from ..database import get_pool
from ..queue import get_queue

log = structlog.get_logger()


@dataclass(frozen=True)
class AutoResponseDecision:
    should_send: bool
    reason: str
    approval_mode: str = 'manual'
    delay_seconds: int = 0
    recipient_jid: str | None = None


class AutoResponseService:
    async def evaluate(
        self,
        *,
        user_id: str,
        conversation_id: str,
        contact_id: str,
        message_body: str,
        require_auto_mode: bool = True,
    ) -> AutoResponseDecision:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                  ars.enabled, ars.business_hours_start, ars.business_hours_end,
                  ars.timezone, ars.active_days, ars.send_delay_seconds,
                  ars.approval_mode, ars.respond_to_leads, ars.respond_to_customers,
                  ars.respond_to_new_contacts, ars.skip_groups, ars.skip_broadcasts,
                  ars.escalation_keywords,
                  c.whatsapp_chat_id,
                  co.whatsapp_jid, co.customer_status AS contact_status,
                  (
                    SELECT COUNT(*)
                    FROM messages m
                    WHERE m.conversation_id = c.id
                      AND m.sender_type = 'contact'
                  ) AS inbound_message_count
                FROM conversations c
                JOIN contacts co ON co.id = c.contact_id
                LEFT JOIN auto_response_settings ars ON ars.user_id = c.user_id
                WHERE c.id = $1 AND c.user_id = $2 AND c.contact_id = $3
                """,
                conversation_id,
                user_id,
                contact_id,
            )

        if not row:
            return AutoResponseDecision(False, 'conversation_not_found')

        if not row['enabled']:
            return AutoResponseDecision(False, 'auto_response_disabled')

        approval_mode = row['approval_mode'] or 'preview'
        if require_auto_mode and approval_mode != 'auto':
            return AutoResponseDecision(False, f'approval_mode_{approval_mode}', approval_mode)

        whatsapp_chat_id = row['whatsapp_chat_id'] or ''
        recipient_jid = row['whatsapp_jid']
        if not recipient_jid:
            return AutoResponseDecision(False, 'missing_recipient_jid', approval_mode)

        if row['skip_groups'] and whatsapp_chat_id.endswith('@g.us'):
            return AutoResponseDecision(False, 'group_chat_skipped', approval_mode)

        if row['skip_broadcasts'] and (
            whatsapp_chat_id == 'status@broadcast' or whatsapp_chat_id.endswith('@broadcast')
        ):
            return AutoResponseDecision(False, 'broadcast_skipped', approval_mode)

        contact_status = row['contact_status'] or 'contact'
        if contact_status == 'lead' and not row['respond_to_leads']:
            return AutoResponseDecision(False, 'lead_responses_disabled', approval_mode)
        if contact_status == 'customer' and not row['respond_to_customers']:
            return AutoResponseDecision(False, 'customer_responses_disabled', approval_mode)
        inbound_message_count = int(row['inbound_message_count'] or 0)
        if contact_status in ('new', 'contact') and inbound_message_count <= 1 and not row['respond_to_new_contacts']:
            return AutoResponseDecision(False, 'new_contact_responses_disabled', approval_mode)

        lowered_body = (message_body or '').lower()
        for keyword in row['escalation_keywords'] or []:
            keyword_text = str(keyword).strip().lower()
            if keyword_text and keyword_text in lowered_body:
                return AutoResponseDecision(False, 'escalation_keyword_matched', approval_mode)

        if not self._is_inside_active_window(
            timezone_name=row['timezone'] or 'UTC',
            active_days=row['active_days'] or [],
            starts_at=self._coerce_time(row['business_hours_start']),
            ends_at=self._coerce_time(row['business_hours_end']),
        ):
            return AutoResponseDecision(False, 'outside_business_hours', approval_mode)

        delay_seconds = max(0, int(row['send_delay_seconds'] or 0))
        return AutoResponseDecision(
            True,
            'eligible',
            approval_mode,
            delay_seconds,
            recipient_jid,
        )

    async def enqueue_send(
        self,
        *,
        user_id: str,
        message_id: str,
        recipient_jid: str,
        text: str,
        suggested_reply_id: str | None = None,
        delay_seconds: int = 0,
        job_name: str = 'auto_send',
    ) -> None:
        send_queue = get_queue('send.reply')
        payload = {
            'userId': user_id,
            'messageId': message_id,
            'suggestedReplyId': suggested_reply_id,
            'recipientJid': recipient_jid,
            'text': text,
        }
        delay_ms = max(0, delay_seconds) * 1000
        if delay_ms:
            await send_queue.add(job_name, payload, {'delay': delay_ms})
        else:
            await send_queue.add(job_name, payload)

    @staticmethod
    def _is_inside_active_window(
        *,
        timezone_name: str,
        active_days: list[int],
        starts_at: time,
        ends_at: time,
    ) -> bool:
        try:
            tz = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            log.warning('auto_response_invalid_timezone', timezone=timezone_name)
            tz = ZoneInfo('UTC')

        now = datetime.now(tz)
        js_day = now.isoweekday() % 7
        if js_day not in active_days:
            return False

        current_time = now.time().replace(tzinfo=None)
        if starts_at <= ends_at:
            return starts_at <= current_time <= ends_at
        return current_time >= starts_at or current_time <= ends_at

    @staticmethod
    def _coerce_time(value: time | str) -> time:
        if isinstance(value, time):
            return value
        return time.fromisoformat(str(value))
