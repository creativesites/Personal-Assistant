"""Durable rolling summary of a chat's older history.

The composer reads the last TRANSCRIPT_MESSAGES messages verbatim. Everything
before that window is folded, incrementally, into conversations.chat_summary
so long-running chats keep their history without sending hundreds of
messages to the model on every reply.
"""
from __future__ import annotations

import structlog

from ..ai.router import AllModelsFailed, complete_routed
from ..database import get_pool
from .context import TRANSCRIPT_MESSAGES, describe

log = structlog.get_logger()

MIN_NEW_TO_FOLD = 25      # don't re-summarise for a handful of messages
MAX_FOLD = 400            # messages per summarising call
MAX_ROUNDS = 12           # calls per run (first run on a very long chat)

SUMMARY_PROMPT = """You keep a running memory of one WhatsApp chat between {owner} (the account owner) and {contact}.
Update the summary with the new older messages below. Keep what still matters, drop what no longer does.

Write at most 400 words, plain sentences, covering:
- what the relationship is like and how they talk to each other,
- ongoing topics, plans, arrangements and anything either person promised,
- important events in either person's life mentioned in the chat,
- anything left unresolved.
Be precise about WHO said or did what ({owner} vs {contact}). Never invent anything.

Current summary:
{current}

Older messages being added (oldest first):
{messages}

Return only the updated summary text."""


_running: set[str] = set()


def refresh_chat_summary_soon(user_id: str, conversation_id: str) -> None:
    """Catch the summary up in the background: a draft never waits for it.
    One run per conversation at a time (per process)."""
    import asyncio
    if conversation_id in _running:
        return
    _running.add(conversation_id)

    async def _run():
        try:
            await ensure_chat_summary(user_id, conversation_id)
        except Exception as exc:  # noqa: BLE001
            log.warning('chat_summary_background_failed', conversation_id=conversation_id, error=str(exc)[:200])
        finally:
            _running.discard(conversation_id)

    asyncio.get_running_loop().create_task(_run())


async def ensure_chat_summary(user_id: str, conversation_id: str) -> None:
    """Fold everything older than the verbatim window into the summary,
    oldest first, until it is caught up (or MAX_ROUNDS calls)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        meta = await conn.fetchrow(
            """SELECT c.chat_summary, c.chat_summary_through,
                      COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), 'them') AS contact_name,
                      COALESCE(u.full_name, 'the user') AS owner_name
               FROM conversations c JOIN contacts co ON co.id = c.contact_id JOIN users u ON u.id = c.user_id
               WHERE c.id = $1 AND c.user_id = $2""",
            conversation_id, user_id,
        )
        if not meta:
            return
        # Oldest message in the verbatim window: everything before it is "older".
        window_start = await conn.fetchval(
            """SELECT MIN(whatsapp_timestamp) FROM (
                 SELECT whatsapp_timestamp FROM messages WHERE conversation_id = $1
                 ORDER BY whatsapp_timestamp DESC LIMIT $2) w""",
            conversation_id, TRANSCRIPT_MESSAGES,
        )
    if not window_start:
        return
    owner = meta['owner_name'].split(' ')[0]
    contact = meta['contact_name']
    current = meta['chat_summary']
    through = meta['chat_summary_through']
    for _ in range(MAX_ROUNDS):
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT sender_type, message_type, body, transcription, is_deleted, whatsapp_timestamp
                   FROM messages
                   WHERE conversation_id = $1 AND whatsapp_timestamp < $2
                     AND ($3::timestamptz IS NULL OR whatsapp_timestamp > $3::timestamptz)
                   ORDER BY whatsapp_timestamp ASC LIMIT $4""",
                conversation_id, window_start, through, MAX_FOLD,
            )
        if not rows or (len(rows) < MIN_NEW_TO_FOLD and current):
            return
        lines = [
            f"[{r['whatsapp_timestamp']:%d %b %Y}] {owner if r['sender_type'] == 'user' else contact}: {describe(r)}"
            for r in rows if describe(r)
        ]
        try:
            result = await complete_routed(
                'chat_summary',
                [{'role': 'user', 'content': SUMMARY_PROMPT.format(
                    owner=owner, contact=contact, current=current or '(none yet)',
                    messages='\n'.join(lines)[-40000:],
                )}],
                user_id=user_id, max_tokens=1200, timeout_sec=90,
            )
        except AllModelsFailed as exc:  # the composer works without a summary
            log.warning('chat_summary_failed', conversation_id=conversation_id, error=str(exc)[:300])
            return
        current = (result.text or '').strip()[:4000]
        through = rows[-1]['whatsapp_timestamp']
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE conversations SET chat_summary = $2, chat_summary_through = $3 WHERE id = $1',
                conversation_id, current, through,
            )
        log.info('chat_summary_updated', conversation_id=conversation_id, folded=len(rows), model=result.model)
        if len(rows) < MAX_FOLD:
            return
