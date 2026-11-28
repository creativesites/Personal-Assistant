"""Blind test for the reply engine (docs/ZURI_AI_PLAN.md Part B.8).

Picks real moments where the owner replied to a contact in a 1:1 chat,
rewinds the chat to just before that reply, drafts a reply with the engine,
and asks a judge model which of the two (shuffled) was written by the real
person. The score is how often the judge picks the real one: 50% means the
drafts can't be told apart; the target is <= 60%.

Nothing is saved to suggested_replies; results are returned (and logged).
"""
from __future__ import annotations

import asyncio
import json
import random
from datetime import timedelta

import structlog

from ..ai.router import AllModelsFailed, complete_routed
from ..database import get_pool
from .composer import compose
from .context import build_chat_context

log = structlog.get_logger()

JUDGE_CHAIN = ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5']
TURN_GAP = timedelta(minutes=3)

JUDGE_PROMPT = """Below is the end of a WhatsApp chat between {owner} and {contact}, then two candidate next replies from {owner}.
One was really written by {owner}. The other was written by an AI imitating {owner}.
Judge purely on how {owner} actually writes in this chat (length, casing, punctuation, slang, emoji, language mix, tone) and what fits the moment.

CHAT:
{tail}

REPLY A:
{a}

REPLY B:
{b}

Return ONLY JSON: {{"real": "A" or "B", "confidence": 0.5-1.0, "tell": "one short line: what gave the AI away (or 'nothing')"}}"""


async def _sample_moments(user_id: str, n: int) -> list[dict]:
    """Owner reply turns that answer a contact message, owner-typed, in 1:1 chats with history."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """WITH owner_msgs AS (
                 SELECT m.id, m.conversation_id, m.whatsapp_timestamp, m.body,
                        LAG(m.sender_type) OVER w AS prev_sender, LAG(m.id) OVER w AS prev_id
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                 JOIN contacts co ON co.id = c.contact_id
                 WHERE c.user_id = $1 AND NOT co.is_group AND c.ai_enabled
                 WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.whatsapp_timestamp, m.ingest_seq)
               )
               SELECT o.id, o.conversation_id, o.prev_id, o.whatsapp_timestamp
               FROM owner_msgs o
               JOIN messages m ON m.id = o.id
               WHERE m.sender_type = 'user' AND o.prev_sender = 'contact'
                 AND m.message_type = 'text' AND COALESCE(m.is_ai_generated, FALSE) = FALSE
                 AND length(m.body) BETWEEN 2 AND 300
                 AND NOT EXISTS (SELECT 1 FROM suggested_replies sr
                                 WHERE sr.status IN ('sent', 'edited_and_sent', 'approved', 'used')
                                   AND (sr.suggestion_text = m.body OR sr.edited_text = m.body))
                 AND (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = o.conversation_id
                        AND x.whatsapp_timestamp < o.whatsapp_timestamp) >= 20
               ORDER BY random() LIMIT $2""",
            user_id, n * 3,
        )
    # At most two moments per chat, so one chatty contact doesn't dominate.
    per_chat: dict[str, int] = {}
    picked = []
    for r in rows:
        k = str(r['conversation_id'])
        if per_chat.get(k, 0) >= 2:
            continue
        per_chat[k] = per_chat.get(k, 0) + 1
        picked.append(dict(r))
        if len(picked) >= n:
            break
    return picked


async def _real_turn(conversation_id: str, first_id: str) -> list[str]:
    """The owner's whole turn: the reply plus quick follow-ups."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT m.sender_type, m.body, m.whatsapp_timestamp FROM messages m
               WHERE m.conversation_id = $1
                 AND m.whatsapp_timestamp >= (SELECT whatsapp_timestamp FROM messages WHERE id = $2)
               ORDER BY m.whatsapp_timestamp, m.ingest_seq LIMIT 6""",
            conversation_id, first_id,
        )
    turn, prev = [], None
    for r in rows:
        if r['sender_type'] != 'user' or (prev and r['whatsapp_timestamp'] - prev > TURN_GAP):
            break
        if r['body']:
            turn.append(r['body'].strip())
        prev = r['whatsapp_timestamp']
    return turn


async def _one(user_id: str, moment: dict, chain: list[str] | None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        until = await conn.fetchval('SELECT whatsapp_timestamp FROM messages WHERE id = $1', moment['prev_id'])
    ctx = await build_chat_context(user_id, str(moment['conversation_id']), until=until)
    if ctx is None or not ctx.unanswered:
        return {'skipped': 'no_context'}
    real = await _real_turn(str(moment['conversation_id']), str(moment['id']))
    if not real:
        return {'skipped': 'no_real_turn'}
    try:
        result = await compose(ctx, job='reply_draft', chain=chain)
    except AllModelsFailed as exc:
        return {'skipped': 'compose_failed', 'error': str(exc)[:200]}
    if result.no_reply_needed or not result.options:
        return {'skipped': 'no_draft', 'noReplyNeeded': result.no_reply_needed}
    draft = [p.text for p in result.options[0].parts]
    real_first = random.random() < 0.5
    a, b = (real, draft) if real_first else (draft, real)
    tail = '\n'.join(ctx.transcript.split('\n')[-25:])
    contact = ctx.contact_name.split(' ')[0]
    try:
        judged = await complete_routed(
            'analysis',
            [{'role': 'user', 'content': JUDGE_PROMPT.format(
                owner=ctx.owner_name, contact=contact, tail=tail,
                a='\n'.join(a), b='\n'.join(b))}],
            user_id=user_id, json_mode=True, max_tokens=400, chain=JUDGE_CHAIN,
        )
        verdict = json.loads(judged.text)
    except Exception as exc:  # noqa: BLE001
        return {'skipped': 'judge_failed', 'error': str(exc)[:200]}
    picked_real = (verdict.get('real') == 'A') == real_first
    return {
        'pickedReal': picked_real,
        'confidence': verdict.get('confidence'),
        'tell': verdict.get('tell'),
        'model': result.model,
        'real': real,
        'draft': draft,
    }


async def run_blind_test(user_id: str, samples: int = 20, chain: list[str] | None = None,
                         include_texts: bool = False) -> dict:
    moments = await _sample_moments(user_id, samples)
    sem = asyncio.Semaphore(3)

    async def guarded(m):
        async with sem:
            return await _one(user_id, m, chain)

    results = await asyncio.gather(*(guarded(m) for m in moments))
    scored = [r for r in results if 'pickedReal' in r]
    rate = sum(1 for r in scored if r['pickedReal']) / len(scored) if scored else None
    out = {
        'samples': len(moments),
        'scored': len(scored),
        'judgePickedRealRate': round(rate, 3) if rate is not None else None,
        'target': 0.6,
        'models': sorted({r['model'] for r in scored}),
        'tells': [r['tell'] for r in scored if r['pickedReal'] and r.get('tell')],
        'skipped': [r.get('skipped') for r in results if 'skipped' in r],
    }
    if include_texts:
        out['results'] = scored
    log.info('reply_blind_test', **{k: v for k, v in out.items() if k != 'results'})
    return out
