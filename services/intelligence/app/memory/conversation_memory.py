"""
Conversation Memory — short-term, rolling working-memory object per
conversation. Lives in Redis (TTL'd, "hours or days" by design, not a
permanent record) and is updated after every live message's analysis.
Reply generation reads it directly instead of re-deriving "what's going on
in this conversation" from the last N raw messages on every call.
"""

import json
import structlog
import redis.asyncio as aioredis
from ..config import settings
from ..models import MessageAnalysis

log = structlog.get_logger()

_TTL_SECONDS = 3 * 24 * 3600  # 3 days
_MAX_LIST_ITEMS = 10

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _key(conversation_id: str) -> str:
    return f'memory:conversation:{conversation_id}'


def _default_state() -> dict:
    return {
        'current_topic': None,
        'unanswered_questions': [],
        'pending_promises': [],
        'latest_sentiment': None,
        'recent_decisions': [],
    }


async def get_conversation_memory(conversation_id: str) -> dict:
    r = await _get_redis()
    raw = await r.get(_key(conversation_id))
    if not raw:
        return _default_state()
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return _default_state()


async def update_conversation_memory(
    conversation_id: str, *, sender_type: str, body: str, analysis: MessageAnalysis,
) -> dict:
    state = await get_conversation_memory(conversation_id)

    if analysis.topics:
        state['current_topic'] = analysis.topics[0]

    state['latest_sentiment'] = analysis.sentiment

    if analysis.intent.primary == 'question' and sender_type == 'contact':
        state['unanswered_questions'] = (
            (state.get('unanswered_questions') or [])[-(_MAX_LIST_ITEMS - 1):] + [body[:280]]
        )
    elif sender_type == 'user' and state.get('unanswered_questions'):
        # A reply from the user is assumed to address the oldest open question.
        state['unanswered_questions'] = state['unanswered_questions'][1:]

    for promise in analysis.promises_detected:
        state['pending_promises'] = (state.get('pending_promises') or [])[-(_MAX_LIST_ITEMS - 1):] + [
            {'text': promise.text, 'type': promise.type, 'made_by': sender_type}
        ]

    if analysis.intent.primary in ('statement', 'acknowledgment') and analysis.importance_score >= 0.6:
        state['recent_decisions'] = (state.get('recent_decisions') or [])[-(_MAX_LIST_ITEMS - 1):] + [body[:280]]

    r = await _get_redis()
    await r.set(_key(conversation_id), json.dumps(state), ex=_TTL_SECONDS)
    return state
