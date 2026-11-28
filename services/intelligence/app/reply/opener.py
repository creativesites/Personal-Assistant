"""Keep-warm openers for Networking (docs/ZURI_AI_PLAN.md Part C).

Drafts a message the owner can send to restart a conversation with a contact
on their warm list: same context and voice as the reply engine, with the
nudge's reason as the steer. If the contact is waiting on a reply, it drafts
that reply instead.
"""
from __future__ import annotations

from ..ai.router import AllModelsFailed
from ..database import get_pool
from .composer import compose
from .context import build_chat_context
from .summary import refresh_chat_summary_soon


async def draft_opener(user_id: str, contact_id: str, reason: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT c.id, c.ai_enabled, co.is_group FROM conversations c JOIN contacts co ON co.id = c.contact_id
               WHERE c.user_id = $1 AND c.contact_id = $2 ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1""",
            user_id, contact_id,
        )
    if not conv:
        return {'skipped': 'no_chat'}
    if conv['is_group']:
        return {'skipped': 'group_chat'}
    if not conv['ai_enabled']:
        return {'skipped': 'ai_off'}
    refresh_chat_summary_soon(user_id, str(conv['id']))
    ctx = await build_chat_context(user_id, str(conv['id']))
    if ctx is None:
        return {'skipped': 'no_chat'}
    try:
        result = await compose(ctx, job='networking_coach', instruction=f'Reason to reach out: {reason}', initiate=True)
    except AllModelsFailed as exc:
        return {'error': 'all_models_failed', 'detail': str(exc)[:300]}
    if not result.options:
        return {'skipped': 'no_draft', 'rejected': result.rejected}
    best = result.options[0]
    return {
        'conversationId': str(conv['id']),
        'messages': [p.text for p in best.parts],
        'alternatives': [[p.text for p in o.parts] for o in result.options[1:]],
        'model': result.model,
        'replying': bool(ctx.unanswered),
    }
