"""Shared helper for the Advisor Companion Plan Phase 4.5 proactive crons
(gossip is excluded — it delivers via gossip_worthy_events, not a chat
message). interest_companion.py/spiritual_companion.py/
motivational_detector.py all need to resolve "the one global Advisor
session to write a proactively-initiated message into" and bump the same
counters a normal turn does — this is that shared piece, not new Advisor
business logic.
"""
import structlog

from ..database import get_pool
from .credits import try_consume_credit

log = structlog.get_logger()


async def _get_or_create_global_session(conn, user_id: str) -> str:
    session = await conn.fetchrow(
        """SELECT id FROM advisor_sessions
           WHERE user_id = $1 AND session_category = 'relationship' AND contact_id IS NULL
           ORDER BY updated_at DESC LIMIT 1""",
        user_id,
    )
    if session:
        return str(session['id'])
    created = await conn.fetchrow(
        """INSERT INTO advisor_sessions (user_id, title, session_category)
           VALUES ($1, 'Zuri', 'relationship') RETURNING id""",
        user_id,
    )
    return str(created['id'])


async def engagement_rate(user_id: str, content_type: str, days: int = 14) -> tuple[float, int]:
    """Advisor Companion Plan Phase 5 (§6.5/§9) — the engagement-based
    frequency-tuning input for `interest_companion.py`/
    `motivational_detector.py`: what fraction of this content_type's
    recent deliveries did the user actually engage with (§3.8/§3.10's
    "if the user dismisses these, frequency drops rather than the message
    getting louder")? Returns (rate, sample_size) — callers should ignore
    the rate until sample_size is large enough to mean anything."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE user_engaged) AS engaged
               FROM proactive_interest_chats
               WHERE user_id = $1 AND content_type = $2
                 AND delivered_at > NOW() - make_interval(days => $3)""",
            user_id, content_type, days,
        )
    total = int(row['total']) if row else 0
    if total == 0:
        return 1.0, 0  # no history yet — don't throttle a cold start
    return int(row['engaged']) / total, total


async def deliver_initiated_message(user_id: str, content: str, metadata: dict) -> str | None:
    """Writes the proactive message as an `advisor_messages` row
    (`initiated = true`, §6.1) into the resolved global session, bumping
    session counters the same way a normal turn does. Returns the
    session_id so the caller can log its own delivery record
    (`proactive_interest_chats`) against it, or None if the user's daily
    nudge credits (docs/PRICING_PAYMENTS_PLAN.md §7) are exhausted — every
    caller here is the single funnel point for
    motivational_detector/interest_companion/spiritual_companion/
    curiosity_engine's proactive deliveries, so gating here covers all of
    them at once."""
    if not await try_consume_credit(user_id, 'nudge'):
        log.info('initiated_message_skipped_no_credits', user_id=user_id)
        return None
    pool = await get_pool()
    async with pool.acquire() as conn:
        session_id = await _get_or_create_global_session(conn, user_id)
        await conn.execute(
            """INSERT INTO advisor_messages (session_id, role, content, metadata, initiated)
               VALUES ($1, 'assistant', $2, $3::jsonb, true)""",
            session_id, content, metadata,
        )
        await conn.execute(
            """UPDATE advisor_sessions SET message_count = message_count + 1, updated_at = NOW()
               WHERE id = $1""",
            session_id,
        )
    return session_id
