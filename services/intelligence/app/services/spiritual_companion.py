"""Advisor Companion Plan Phase 4.5 — Spiritual Companion daily devotional
(docs/ADVISOR_COMPANION_PLAN.md §3.9/§6.11/§9). Entirely gated on
`advisor_user_profiles.spiritual_preferences.tradition` being explicitly
set — never active by default, never inferred, and independent of
`personal_mode_enabled` (§3.9's hard consent gate that personal mode
cannot bypass). `companion_features_paused` still applies since that's
the honest platform-wide kill switch (§7.8), not a consent question.

Context-sensitive verse offering and prayer mode are NOT here — those are
real-time companion behaviors folded inline into
`AdvisorCompanionService` (the orchestrator already owns the emotional-
state check and the `spiritual` intent), not a cron. See
`advisor_companion.py`'s `emotional_context_line` construction and its
`spiritual` intent handling.
"""
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_DEVOTIONAL
from ..database import get_pool
from .companion_delivery import deliver_initiated_message

log = structlog.get_logger()

_DEDUP_WINDOW_HOURS = 20


class SpiritualCompanionService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT user_id, spiritual_preferences FROM advisor_user_profiles
                   WHERE companion_features_paused = false
                     AND spiritual_preferences ? 'tradition'
                     AND spiritual_preferences->>'tradition' IS NOT NULL
                     AND spiritual_preferences->>'tradition' != ''""",
            )
        count = 0
        for u in users:
            if await self.send_devotional(str(u['user_id']), dict(u['spiritual_preferences'])):
                count += 1
        return count

    async def send_devotional(self, user_id: str, prefs: dict) -> bool:
        tradition = prefs.get('tradition')
        if not tradition:
            return False
        translation = prefs.get('translation') or 'NIV'

        pool = await get_pool()
        async with pool.acquire() as conn:
            already_recent = await conn.fetchval(
                """SELECT COUNT(*) FROM proactive_interest_chats
                   WHERE user_id = $1 AND content_type = 'devotional'
                     AND delivered_at > NOW() - make_interval(hours => $2)""",
                user_id, _DEDUP_WINDOW_HOURS,
            )
        if already_recent and int(already_recent) > 0:
            return False

        ai = get_ai_client()
        try:
            devotional = await ai.complete_json([{
                'role': 'user',
                'content': GENERATE_DEVOTIONAL.format(tradition=tradition, translation=translation),
            }], service='advisor', feature='spiritual_devotional', user_id=user_id)
        except Exception as exc:
            log.warning('devotional_generation_failed', user_id=user_id, error=str(exc))
            return False

        message_text = devotional.get('message', '')
        if not message_text:
            return False

        session_id = await deliver_initiated_message(user_id, message_text, {'type': 'devotional'})
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO proactive_interest_chats
                     (user_id, session_id, interest_topic, trigger_event, content_type)
                   VALUES ($1, $2, 'devotional', $3, 'devotional')""",
                user_id, session_id, tradition,
            )
        return True


_instance: SpiritualCompanionService | None = None


def get_spiritual_companion() -> SpiritualCompanionService:
    global _instance
    if _instance is None:
        _instance = SpiritualCompanionService()
    return _instance
