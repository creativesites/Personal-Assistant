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


GIFT_PROMPT = """You help someone pick a thoughtful gift and a message for a person in their life.
Return JSON:
{
  "ideas": [{"idea": "...", "why": "...", "price": "..."}],   // 4 ideas, specific and buyable
  "message": "..."                                            // a short WhatsApp message for the occasion, in the user's voice
}
Rules:
- Ground every idea in the facts given (interests, life situation, relationship). The "why" must point to a specific fact.
  If the facts are thin, say so in "why" and suggest something safe for the relationship type.
- Respect the budget if given. "price" is a rough range in the budget's currency (or the user's local currency, Zambian Kwacha K, if none).
- Practical for the user's location (Zambia) — things that can actually be bought or arranged there or online.
- The message: warm, natural, 1-3 sentences, no hashtags, at most one emoji. Match the relationship (spouse vs colleague)."""


class GiftRequest(BaseModel):
    user_id: str
    occasion: Optional[str] = None
    budget: Optional[str] = None


@router.post('/contacts/{contact_id}/gift-ideas')
async def gift_ideas(contact_id: str, body: GiftRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        person = await conn.fetchrow(
            """SELECT COALESCE(c.custom_name, c.display_name, 'them') AS name, r.relationship_type,
                      cp.personality_summary, cp.current_life_context, cp.preferences, cp.goals
               FROM contacts c
               LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = $2
               LEFT JOIN contact_profiles cp ON cp.contact_id = c.id AND cp.user_id = $2
               WHERE c.id = $1 AND c.user_id = $2""",
            contact_id, body.user_id,
        )
        if not person:
            raise HTTPException(status_code=404, detail='Contact not found')
        facts = await conn.fetch(
            """SELECT insight_key, insight_value FROM contact_insights
               WHERE contact_id = $1 AND user_id = $2 AND is_active = TRUE
               ORDER BY (insight_key = 'remember') DESC, confidence DESC NULLS LAST LIMIT 20""",
            contact_id, body.user_id,
        )
        events = await conn.fetch(
            """SELECT title FROM contact_life_events WHERE contact_id = $1 AND user_id = $2
               ORDER BY created_at DESC LIMIT 8""",
            contact_id, body.user_id,
        )

    lines = [f"Name: {person['name']}", f"Relationship to the user: {person['relationship_type'] or 'unknown'}"]
    for label, key in (('Personality', 'personality_summary'), ('Life right now', 'current_life_context'),
                       ('Preferences', 'preferences'), ('Goals', 'goals')):
        if person[key]:
            lines.append(f'{label}: {person[key]}')
    if facts:
        lines.append('Known facts:\n' + '\n'.join(f"- {f['insight_value']}" for f in facts if f['insight_value']))
    if events:
        lines.append('Recent life events:\n' + '\n'.join(f"- {e['title']}" for e in events))
    lines.append(f"Occasion: {body.occasion or 'no particular occasion — just to show I care'}")
    if body.budget:
        lines.append(f'Budget: {body.budget}')

    ai = get_ai_client()
    result = await ai.complete_json(
        [{'role': 'system', 'content': GIFT_PROMPT}, {'role': 'user', 'content': '\n'.join(lines)}],
        service='intelligence', feature='zuri_panel_gift_ideas', user_id=body.user_id, timeout_sec=45,
    )
    ideas = [
        {'idea': str(i.get('idea', '')).strip(), 'why': str(i.get('why', '')).strip(), 'price': str(i.get('price', '')).strip()}
        for i in (result.get('ideas') or []) if isinstance(i, dict) and i.get('idea')
    ][:5]
    return {'ideas': ideas, 'message': str(result.get('message') or '').strip(), 'factCount': len(facts)}
