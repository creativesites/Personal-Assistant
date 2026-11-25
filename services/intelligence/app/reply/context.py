"""Chat context for the reply engine.

Everything the composer needs to write the owner's next message in one chat,
built the same way for suggestions, auto-replies and regenerate:

- who is who (the owner writes; the contact is the other person),
- a real transcript of the recent chat (times, day breaks, gaps, media,
  quotes), with the unanswered messages numbered so a reply can quote them,
- a durable rolling summary of older history,
- what Zuri knows about the contact (profile, facts, dates, promises),
- the owner's own voice in THIS chat (real examples, typical length),
- business knowledge only for business chats.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..database import get_pool
from ..memory import retrieval_service as memory

TRANSCRIPT_MESSAGES = 40
OWNER_EXAMPLES = 14
BUSINESS_RELATIONSHIPS = {'client', 'customer', 'business_contact', 'supplier', 'vendor', 'lead', 'prospect'}
FAILED_TRANSCRIPT = '[Audio voice message]'

_MEDIA = {
    'image': 'photo', 'video': 'video', 'audio': 'voice note', 'sticker': 'sticker',
    'document': 'document', 'location': 'location', 'contact_card': 'contact card',
}


@dataclass
class Incoming:
    """A message from the contact that the owner hasn't answered yet."""
    index: int                 # 1-based, as shown to the model ("#1")
    message_id: str
    whatsapp_message_id: str | None
    text: str                  # as shown in the transcript (media described)
    requires_response: bool | None


@dataclass
class ChatContext:
    user_id: str
    conversation_id: str
    contact_id: str
    owner_name: str            # first name, e.g. "Winston"
    contact_name: str
    relationship_type: str
    is_group: bool
    is_business: bool
    now_local: str
    transcript: str
    unanswered: list[Incoming]
    hours_since_owner_spoke: float | None
    owner_voice: str
    owner_examples: list[str]
    owner_typical_chars: int
    about_contact: str
    chat_summary: str
    business_context: str = ''
    contact_recent_texts: list[str] = field(default_factory=list)   # for echo guard


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or 'Africa/Lusaka')
    except ZoneInfoNotFoundError:
        return ZoneInfo('Africa/Lusaka')


def describe(row) -> str:
    """One message as readable text, media included."""
    mtype = row['message_type'] or 'text'
    body = (row['body'] or '').strip()
    if row.get('is_deleted'):
        return '[deleted message]'
    if mtype in _MEDIA:
        label = _MEDIA[mtype]
        if mtype == 'audio':
            t = (row['transcription'] or '').strip()
            return f'[voice note: "{t}"]' if t and t != FAILED_TRANSCRIPT else '[voice note, not transcribed]'
        if mtype == 'document':
            return f'[document: {body or "file"}]'
        return f'[{label}: {body}]' if body else f'[{label}]'
    return body


def _clip(text: str, n: int) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    return text if len(text) <= n else text[: n - 1] + '…'


async def build_chat_context(user_id: str, conversation_id: str, until: datetime | None = None) -> ChatContext | None:
    """`until` rewinds the chat to that moment (evaluation: reply as of a past message)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT c.id, c.contact_id, c.chat_summary,
                      COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'them') AS contact_name,
                      co.is_group, co.is_business, co.customer_status, co.company,
                      COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
                      COALESCE(u.full_name, 'the user') AS owner_full_name,
                      ars.timezone
               FROM conversations c
               JOIN contacts co ON co.id = c.contact_id
               JOIN users u ON u.id = c.user_id
               LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
               LEFT JOIN auto_response_settings ars ON ars.user_id = c.user_id
               WHERE c.id = $1 AND c.user_id = $2""",
            conversation_id, user_id,
        )
        if not conv:
            return None
        rows = await conn.fetch(
            """SELECT m.id, m.whatsapp_message_id, m.sender_type, m.message_type, m.body, m.transcription,
                      m.whatsapp_timestamp, m.quoted_message_id, m.sender_display_name, m.is_deleted,
                      ma.requires_response
               FROM messages m
               LEFT JOIN message_analyses ma ON ma.message_id = m.id
               WHERE m.conversation_id = $1 AND ($3::timestamptz IS NULL OR m.whatsapp_timestamp <= $3)
               ORDER BY m.whatsapp_timestamp DESC
               LIMIT $2""",
            conversation_id, TRANSCRIPT_MESSAGES, until,
        )
        rows = list(reversed(rows))
        quoted_ids = [r['quoted_message_id'] for r in rows if r['quoted_message_id']]
        quoted = {}
        if quoted_ids:
            for q in await conn.fetch(
                'SELECT id, sender_type, message_type, body, transcription, is_deleted FROM messages WHERE id = ANY($1::uuid[])',
                quoted_ids,
            ):
                quoted[q['id']] = q
        # The owner's own words in this chat — never ones Zuri sent for them.
        owner_rows = await conn.fetch(
            """SELECT m.body FROM messages m
               WHERE m.conversation_id = $1 AND m.sender_type = 'user' AND m.message_type = 'text'
                 AND m.body IS NOT NULL AND length(m.body) BETWEEN 1 AND 400
                 AND NOT EXISTS (
                   SELECT 1 FROM suggested_replies sr JOIN messages src ON src.id = sr.message_id
                   WHERE src.conversation_id = m.conversation_id AND sr.status IN ('sent', 'edited_and_sent', 'approved', 'used')
                     AND (sr.suggestion_text = m.body OR sr.edited_text = m.body))
                 AND ($2::timestamptz IS NULL OR m.whatsapp_timestamp <= $2)
               ORDER BY m.whatsapp_timestamp DESC LIMIT 60""",
            conversation_id, until,
        )
        upcoming = await conn.fetch(
            """SELECT title, event_date, event_type::text AS event_type FROM events
               WHERE contact_id = $1 AND user_id = $2 AND event_date IS NOT NULL
                 AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
               ORDER BY event_date LIMIT 4""",
            conv['contact_id'], user_id,
        )

    tz = _tz(conv['timezone'])
    now = (until + timedelta(minutes=2)) if until else datetime.now(timezone.utc)
    owner = (conv['owner_full_name'] or 'the user').split(' ')[0]
    contact_name = conv['contact_name']
    first_contact = contact_name.split(' ')[0]
    is_group = bool(conv['is_group'])

    # ── Transcript ──
    lines: list[str] = []
    last_day = None
    prev_ts = None
    last_owner_idx = max((i for i, r in enumerate(rows) if r['sender_type'] == 'user'), default=-1)
    unanswered: list[Incoming] = []
    contact_recent: list[str] = []
    for i, r in enumerate(rows):
        ts = r['whatsapp_timestamp']
        local = ts.astimezone(tz)
        day = local.date()
        if day != last_day:
            today = now.astimezone(tz).date()
            label = 'Today' if day == today else 'Yesterday' if day == today - timedelta(days=1) else local.strftime('%A %d %B')
            lines.append(f'— {label} —')
            last_day = day
        elif prev_ts and ts - prev_ts > timedelta(hours=3):
            gap_h = (ts - prev_ts).total_seconds() / 3600
            lines.append(f'— {round(gap_h)} hours later —')
        prev_ts = ts

        text = describe(r)
        if r['quoted_message_id'] and r['quoted_message_id'] in quoted:
            q = quoted[r['quoted_message_id']]
            who_q = owner if q['sender_type'] == 'user' else first_contact
            text = f'(replying to {who_q}: "{_clip(describe(q), 80)}") {text}'

        if r['sender_type'] == 'user':
            who = f'{owner} (you)'
        else:
            who = (r['sender_display_name'] or first_contact) if is_group else first_contact
            if r['body']:
                contact_recent.append(r['body'])
        marker = ''
        if r['sender_type'] != 'user' and i > last_owner_idx:
            inc = Incoming(
                index=len(unanswered) + 1, message_id=str(r['id']),
                whatsapp_message_id=r['whatsapp_message_id'], text=text,
                requires_response=r['requires_response'],
            )
            unanswered.append(inc)
            marker = f'#{inc.index} '
        lines.append(f'{marker}[{local.strftime("%H:%M")}] {who}: {text}')

    hours_since_owner = None
    if last_owner_idx >= 0:
        hours_since_owner = (now - rows[last_owner_idx]['whatsapp_timestamp']).total_seconds() / 3600

    # ── Owner's voice in this chat ──
    owner_texts = [r['body'].strip() for r in owner_rows if r['body'] and not r['body'].startswith('http')]
    examples = [t for t in owner_texts if len(t) <= 220][:OWNER_EXAMPLES]
    typical = int(statistics.median([len(t) for t in owner_texts])) if owner_texts else 60
    voice = await memory.get_user_voice(user_id)
    style = voice.get('writing_style')
    voice_summary = ''
    if isinstance(style, dict):
        voice_summary = ' '.join(str(style.get(k) or '') for k in ('voice_summary', 'vocabulary_style')).strip()
    elif style:
        voice_summary = str(style)

    # ── About the contact ──
    summary = await memory.get_contact_summary(user_id, str(conv['contact_id']))
    about: list[str] = [f'{contact_name} is {owner}\'s {conv["relationship_type"].replace("_", " ")}.']
    if summary.get('current_life_context'):
        about.append(f"What's going on for them: {summary['current_life_context']}")
    if summary.get('personality_summary'):
        about.append(f"Who they are: {_clip(summary['personality_summary'], 300)}")
    if summary.get('facts'):
        about.append('Things to remember: ' + '; '.join(_clip(f, 140) for f in summary['facts'][:8]))
    for e in upcoming:
        about.append(f"Coming up: {e['title']} on {e['event_date'].strftime('%A %d %B')}")
    try:
        rel = memory.format_relationship_memory(await memory.get_relationship_memory(user_id, str(conv['contact_id'])))
        if rel:
            about.append(rel)
    except Exception:  # noqa: BLE001 — optional context
        pass

    is_business = (
        conv['relationship_type'] in BUSINESS_RELATIONSHIPS or bool(conv['is_business'])
        or (conv['customer_status'] not in (None, 'contact')) or bool(conv['company'])
    )

    return ChatContext(
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=str(conv['contact_id']),
        owner_name=owner,
        contact_name=contact_name,
        relationship_type=conv['relationship_type'],
        is_group=is_group,
        is_business=is_business,
        now_local=now.astimezone(tz).strftime('%A %d %B, %H:%M'),
        transcript='\n'.join(lines),
        unanswered=unanswered,
        hours_since_owner_spoke=hours_since_owner,
        owner_voice=voice_summary,
        owner_examples=examples,
        owner_typical_chars=max(20, typical),
        about_contact='\n'.join(about),
        chat_summary='' if until else (conv['chat_summary'] or ''),
        contact_recent_texts=contact_recent[-20:],
    )
