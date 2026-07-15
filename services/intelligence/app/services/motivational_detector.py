"""Advisor Companion Plan Phase 4.5 — Motivational & Accountability
Partner (docs/ADVISOR_COMPANION_PLAN.md §3.10/§6.12/§9). Plain SQL
aggregation over signals that already exist — no new detection pass, same
discipline as pricing_benchmarks.py/document_followups.py — reaching for
an LLM call only to word the nudge, never to detect the signals
themselves. Gated on personal_mode_enabled, same as the other Phase 4.5
crons.
"""
import json
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_MOTIVATIONAL_NUDGE
from ..database import get_pool
from .companion_delivery import deliver_initiated_message, engagement_rate

log = structlog.get_logger()

_MIN_SIGNALS = 2
_DEDUP_WINDOW_HOURS = 20
_MIN_ENGAGEMENT_SAMPLES = 5
_MIN_ENGAGEMENT_RATE = 0.15


class MotivationalDetectorService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT user_id, motivational_style FROM advisor_user_profiles
                   WHERE personal_mode_enabled = true AND companion_features_paused = false""",
            )
        count = 0
        for u in users:
            if await self.check_and_nudge(str(u['user_id']), dict(u['motivational_style'] or {})):
                count += 1
        return count

    async def check_and_nudge(self, user_id: str, style: dict | None = None) -> bool:
        # Advisor Companion Plan Phase 5 (§6.5/§9) — §3.10's own promise:
        # "if the user dismisses these, frequency drops rather than the
        # message getting louder."
        rate, samples = await engagement_rate(user_id, 'motivational')
        if samples >= _MIN_ENGAGEMENT_SAMPLES and rate < _MIN_ENGAGEMENT_RATE:
            log.info('motivational_nudge_throttled', user_id=user_id, rate=round(rate, 2), samples=samples)
            return False

        pool = await get_pool()
        async with pool.acquire() as conn:
            already_recent = await conn.fetchval(
                """SELECT COUNT(*) FROM proactive_interest_chats
                   WHERE user_id = $1 AND content_type = 'motivational'
                     AND delivered_at > NOW() - make_interval(hours => $2)""",
                user_id, _DEDUP_WINDOW_HOURS,
            )
            if already_recent and int(already_recent) > 0:
                return False

            stale_contacts = await conn.fetch(
                """SELECT COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM conversations conv
                   JOIN contacts c ON c.id = conv.contact_id
                   JOIN LATERAL (
                     SELECT sender_type, whatsapp_timestamp FROM messages m
                     WHERE m.conversation_id = conv.id
                     ORDER BY m.whatsapp_timestamp DESC NULLS LAST LIMIT 1
                   ) last_msg ON true
                   WHERE conv.user_id = $1 AND c.is_group = false
                     AND last_msg.sender_type = 'contact'
                     AND last_msg.whatsapp_timestamp < NOW() - INTERVAL '48 hours'
                   LIMIT 5""",
                user_id,
            )
            unfulfilled_promises = await conn.fetchval(
                """SELECT COUNT(*) FROM message_analyses ma
                   JOIN messages m ON m.id = ma.message_id
                   JOIN conversations c ON c.id = m.conversation_id
                   WHERE c.user_id = $1 AND jsonb_array_length(ma.promises_detected) > 0
                     AND ma.analyzed_at < NOW() - INTERVAL '48 hours'
                     AND m.sender_type = 'contact'""",
                user_id,
            )
            stuck_deals = await conn.fetchval(
                """SELECT COUNT(*) FROM deals
                   WHERE user_id = $1 AND stage NOT IN ('closed_won', 'closed_lost')
                     AND entered_stage_at < NOW() - INTERVAL '7 days'""",
                user_id,
            )

        signals = []
        if stale_contacts:
            names = ', '.join(r['contact_name'] for r in stale_contacts[:3])
            signals.append(f"{len(stale_contacts)} contact(s) waiting on a reply for 48h+ ({names})")
        if unfulfilled_promises and int(unfulfilled_promises) > 0:
            signals.append(f"{unfulfilled_promises} promise(s) made to you that haven't been followed up on")
        if stuck_deals and int(stuck_deals) > 0:
            signals.append(f"{stuck_deals} deal(s) stuck in the same stage for a week+")

        if len(signals) < _MIN_SIGNALS:
            return False

        ai = get_ai_client()
        try:
            nudge = await ai.complete_json([{
                'role': 'user',
                'content': GENERATE_MOTIVATIONAL_NUDGE.format(
                    signals='\n'.join(f'- {s}' for s in signals),
                    style=json.dumps(style or {}),
                ),
            }])
        except Exception as exc:
            log.warning('motivational_nudge_generation_failed', user_id=user_id, error=str(exc))
            return False

        message_text = nudge.get('message', '')
        if not message_text:
            return False

        session_id = await deliver_initiated_message(user_id, message_text, {'type': 'motivational'})
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO proactive_interest_chats
                     (user_id, session_id, interest_topic, trigger_event, content_type)
                   VALUES ($1, $2, 'motivational', $3, 'motivational')""",
                user_id, session_id, '; '.join(signals),
            )
        return True


_instance: MotivationalDetectorService | None = None


def get_motivational_detector() -> MotivationalDetectorService:
    global _instance
    if _instance is None:
        _instance = MotivationalDetectorService()
    return _instance
