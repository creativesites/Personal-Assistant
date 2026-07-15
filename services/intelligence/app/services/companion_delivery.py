"""Shared helper for the Advisor Companion Plan Phase 4.5 proactive crons
(gossip is excluded — it delivers via gossip_worthy_events, not a chat
message). interest_companion.py/spiritual_companion.py/
motivational_detector.py all need to resolve "the one global Advisor
session to write a proactively-initiated message into" and bump the same
counters a normal turn does — this is that shared piece, not new Advisor
business logic.
"""
import json
from ..database import get_pool


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


async def deliver_initiated_message(user_id: str, content: str, metadata: dict) -> str:
    """Writes the proactive message as an `advisor_messages` row
    (`initiated = true`, §6.1) into the resolved global session, bumping
    session counters the same way a normal turn does. Returns the
    session_id so the caller can log its own delivery record
    (`proactive_interest_chats`) against it."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        session_id = await _get_or_create_global_session(conn, user_id)
        await conn.execute(
            """INSERT INTO advisor_messages (session_id, role, content, metadata, initiated)
               VALUES ($1, 'assistant', $2, $3::jsonb, true)""",
            session_id, content, json.dumps(metadata),
        )
        await conn.execute(
            """UPDATE advisor_sessions SET message_count = message_count + 1, updated_at = NOW()
               WHERE id = $1""",
            session_id,
        )
    return session_id
