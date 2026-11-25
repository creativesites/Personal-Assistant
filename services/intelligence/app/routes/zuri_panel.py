"""Zuri panel (Inbox side panel) — the "Now" tab's catch-up card.

One small JSON call per chat: what happened since the user last looked
(digest) plus a one-line plain-language read of where things stand. The
API caches the result per (conversation, latest message), so this runs at
most once per new message the user actually opens.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..ai.client import get_ai_client
from ..database import get_pool

router = APIRouter(prefix='/internal/zuri-panel', tags=['zuri-panel'])

_MEDIA_LABEL = {
    'image': '[photo]', 'video': '[video]', 'audio': '[voice note]', 'sticker': '[sticker]',
    'document': '[document]', 'location': '[location]', 'contact_card': '[contact card]',
}

CATCH_UP_PROMPT = """You help someone keep up with their own WhatsApp chats.
Read the transcript and return JSON:
{
  "digest": ["..."],   // what happened in the NEW messages only, max 3 short bullets, most important first. [] if there are no new messages.
  "read": "..."        // one plain sentence on where this chat stands right now (mood, what's pending). Max 18 words.
}
Rules:
- Write like a thoughtful friend, not an analyst. No jargon, no scores, no "sentiment".
- Only state what the messages show. Never invent plans, feelings or facts.
- Refer to the other person by name; refer to the user as "you".
- Voice notes may include a transcript in brackets — use it."""


class CatchUpRequest(BaseModel):
    user_id: str
    since: Optional[datetime] = None


@router.post('/{conversation_id}/catch-up')
async def catch_up(conversation_id: str, body: CatchUpRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT m.sender_type, m.message_type, m.body, m.transcription, m.whatsapp_timestamp,
                      m.sender_display_name, co.custom_name, co.display_name, co.is_group
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts co ON co.id = c.contact_id
               WHERE m.conversation_id = $1 AND c.user_id = $2 AND m.is_deleted = false
               ORDER BY m.whatsapp_timestamp DESC
               LIMIT 60""",
            conversation_id, body.user_id,
        )
    if not rows:
        raise HTTPException(status_code=404, detail='No messages found')
    rows = list(reversed(rows))
    name = rows[0]['custom_name'] or rows[0]['display_name'] or 'them'
    is_group = bool(rows[0]['is_group'])

    def line(r) -> str:
        who = 'You' if r['sender_type'] == 'user' else (r['sender_display_name'] if is_group and r['sender_display_name'] else name)
        text = r['body'] or ''
        if r['message_type'] in _MEDIA_LABEL:
            text = f"{_MEDIA_LABEL[r['message_type']]} {text}".strip()
            if r['transcription'] and r['transcription'] != '[Audio voice message]':
                text += f" [transcript: {r['transcription']}]"
        return f"{who}: {text}"

    since = body.since
    older = [line(r) for r in rows if since and r['whatsapp_timestamp'] <= since]
    newer = [line(r) for r in rows if not since or r['whatsapp_timestamp'] > since]
    if since is None:
        older, newer = newer, []  # first look: no digest, just the read

    transcript = ''
    if older:
        transcript += 'EARLIER MESSAGES (context):\n' + '\n'.join(older[-40:]) + '\n\n'
    transcript += 'NEW MESSAGES SINCE YOU LAST LOOKED:\n' + ('\n'.join(newer) if newer else '(none)')

    ai = get_ai_client()
    result = await ai.complete_json(
        [
            {'role': 'system', 'content': CATCH_UP_PROMPT},
            {'role': 'user', 'content': f'Chat with {name}{" (group)" if is_group else ""}.\n\n{transcript}'},
        ],
        service='intelligence', feature='zuri_panel_catch_up', user_id=body.user_id, timeout_sec=30,
    )
    digest = [str(d).strip() for d in (result.get('digest') or []) if str(d).strip()][:3] if newer else []
    read = str(result.get('read') or '').strip()
    return {'digest': digest, 'read': read, 'newCount': len(newer)}
