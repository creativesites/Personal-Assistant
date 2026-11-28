"""Chat context for the reply engine (v3, docs/ZURI_AI_PLAN.md Part B).

Everything the composer needs to write the owner's next message in one chat,
built the same way for suggestions, auto-replies and regenerate:

- who is who (the owner writes; the contact is the other person),
- the chat verbatim: up to TRANSCRIPT_MESSAGES messages (the whole chat for
  almost every contact) with times, day breaks, gaps, media and quotes; the
  unanswered messages are numbered so a reply can quote them,
- a durable rolling summary of anything older than that,
- what Zuri knows about the contact (profile, facts, dates, promises),
- the owner's voice in THIS chat: real examples plus a measured fingerprint
  (length, message bursts, casing, punctuation, emoji, laughter, slang),
- a language policy (English base; sparing Bemba/Nyanja; Shona only where
  the chat already uses it, or with the owner's partner),
- the owner's own corrections of earlier drafts,
- business knowledge only for business chats.
"""
from __future__ import annotations

import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..database import get_pool
from ..memory import retrieval_service as memory

TRANSCRIPT_MESSAGES = 1500
MESSAGE_CLIP = 1200            # one very long message (a pasted document) stays readable
OWNER_EXAMPLES = 16
CROSS_CHAT_EXAMPLES = 16       # when this chat has too few of the owner's own messages
MIN_OWN_EXAMPLES = 8
BURST_GAP = timedelta(minutes=3)
BUSINESS_RELATIONSHIPS = {'client', 'customer', 'business_contact', 'supplier', 'vendor', 'lead', 'prospect'}
FAILED_TRANSCRIPT = '[Audio voice message]'

_MEDIA = {
    'image': 'photo', 'video': 'video', 'audio': 'voice note', 'sticker': 'sticker',
    'document': 'document', 'location': 'location', 'contact_card': 'contact card',
}

# Distinctive everyday words, used only to notice which languages a chat
# already uses. The model decides what to actually write.
LEXICON: dict[str, set[str]] = {
    'Bemba': {'mwashibukeni', 'mwapoleni', 'natotela', 'shani', 'mukwai', 'nomba', 'cisuma', 'chisuma',
              'ndekutemwa', 'nalitemwa', 'nshaishibe', 'ulifye', 'eya', 'awe', 'mailo', 'lelo', 'bushe',
              'mulishani', 'ndifye', 'kwena', 'naishiba', 'mune'},
    'Nyanja': {'zikomo', 'bwanji', 'chabwino', 'kodi', 'ndili', 'ndikukonda', 'iyayi', 'inde', 'pepani',
               'mwadzuka', 'ndine', 'ndiwe', 'mawa', 'lero', 'sindikudziwa', 'tiyeni', 'nanga'},
    'Shona': {'makadini', 'ndiripo', 'mangwanani', 'masikati', 'manheru', 'maswera', 'ndatenda',
              'ndinotenda', 'zvakanaka', 'mudiwa', 'ndinokuda', 'hongu', 'aiwa', 'zvino', 'nhasi',
              'ndakakusuwa', 'pamusoroi', 'mangwana', 'rudo', 'murisei', 'ndirikufara'},
}
_SLANG = {'u', 'ur', 'nd', 'wat', 'cz', 'coz', 'cos', 'plz', 'pls', 'thx', 'gud', 'gd', 'bt', 'n', 'k', 'kk',
          'ok', 'okay', 'oky', 'yh', 'ya', 'yeah', 'yep', 'nah', 'idk', 'imma', 'gonna', 'wanna', 'bro', 'sis',
          'mate', 'lol', 'lmao', 'haha', 'hahaha', 'hehe', 'mmm', 'hmm', 'aah', 'eish', 'sha', 'sure', 'nyc'}
_ADDRESS = {'bro', 'brother', 'bruv', 'wangu', 'dear', 'babe', 'baby', 'sis', 'sister', 'mate', 'boss', 'tate', 'ba',
            'mukwai', 'shar', 'fazh', 'doc', 'dr', 'chief', 'mudiwa', 'love', 'sweetheart', 'honey', 'gorgeous',
            'bae', 'madam', 'sir', 'mum', 'mom', 'dad', 'baba', 'mama', 'uncle', 'auntie', 'aunty', 'cuz', 'buddy',
            'man', 'guy', 'mfana', 'mzala', 'blaz', 'mukwasha', 'amai', 'mhamha', 'princess', 'queen'}
_LAUGH = re.compile(r'\b(ha(ha)+|he(he)+|lo+l|lmao|lmfao)\b|😂|🤣|😅|😆', re.I)
_EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿❤️]')


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
    ai_enabled: bool = True
    is_partner: bool = False
    fingerprint: str = ''
    language_policy: str = ''
    examples_from_other_chats: bool = False
    corrections: list[tuple[str, str]] = field(default_factory=list)   # (draft, what the owner sent)
    message_count: int = 0
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


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def languages_used(texts: list[str]) -> dict[str, int]:
    counts: Counter = Counter()
    for t in texts:
        toks = set(_tokens(t))
        for lang, words in LEXICON.items():
            if toks & words:
                counts[lang] += 1
    return dict(counts)


def owner_fingerprint(rows: list) -> str:
    """How the owner writes in this chat, measured rather than guessed.
    `rows` are transcript rows, oldest first (both senders)."""
    texts = [(r['body'] or '').strip() for r in rows
             if r['sender_type'] == 'user' and (r['message_type'] or 'text') == 'text' and (r['body'] or '').strip()]
    if len(texts) < 5:
        return ''
    lengths = [len(t) for t in texts]
    # Turns: consecutive owner messages, each within BURST_GAP of the previous one.
    turns: list[list] = []
    prev = None
    for r in rows:
        if r['sender_type'] != 'user':
            prev = None
            continue
        if prev is not None and r['whatsapp_timestamp'] - prev['whatsapp_timestamp'] <= BURST_GAP:
            turns[-1].append(r)
        else:
            turns.append([r])
        prev = r
    multi = sum(1 for t in turns if len(t) > 1)
    n = len(texts)
    lower_start = sum(1 for t in texts if t[0].isalpha() and t[0].islower()) / n
    ends_period = sum(1 for t in texts if t.endswith('.')) / n
    ends_none = sum(1 for t in texts if t[-1].isalnum()) / n
    with_emoji = [t for t in texts if _EMOJI.search(t)]
    top_emoji = Counter(e for t in with_emoji for e in _EMOJI.findall(t) if e != '️').most_common(6)
    laughs = Counter(m.group(0).lower() for t in texts for m in _LAUGH.finditer(t)).most_common(3)
    slang = Counter(w for t in texts for w in _tokens(t) if w in _SLANG).most_common(8)
    ellipsis = sum(1 for t in texts if re.search(r'\.{3,}', t)) / n
    i_words = [w for t in texts for w in re.findall(r"\b[iI]\b(?!')", t)]
    lower_i = (sum(1 for w in i_words if w == 'i') / len(i_words)) if len(i_words) >= 4 else None
    apologises = sum(1 for t in texts if re.search(r'\b(sorry|apologi[sz]e)\b', t, re.I))
    all_caps = sum(1 for t in texts if len(t) > 3 and t.isupper()) / n

    median = int(statistics.median(lengths))
    p90 = sorted(lengths)[int(0.9 * (n - 1))]
    multi_ratio = multi / max(1, len(turns))
    emoji_rate = len(with_emoji) / n
    lines = [
        f'- Length: median {median} characters, 90% of messages under {p90}.',
        f'- Sends {multi} of {len(turns)} turns as several quick messages in a row.',
        f'- Starts with a lowercase letter {round(lower_start * 100)}% of the time; '
        f'ends with a full stop {round(ends_period * 100)}%, with no punctuation at all {round(ends_none * 100)}%.',
        f'- Emoji in {round(emoji_rate * 100)}% of messages'
        + (': ' + ' '.join(f'{e} ({c})' for e, c in top_emoji) if top_emoji else '') + '.',
    ]
    if laughs:
        lines.append('- Laughs as: ' + ', '.join(f'"{w}"' for w, _ in laughs) + '.')
    if slang:
        lines.append('- Short forms and fillers used: ' + ', '.join(f'"{w}"' for w, _ in slang) + '.')
    if all_caps >= 0.05:
        lines.append(f'- Writes in ALL CAPS {round(all_caps * 100)}% of the time.')
    address = Counter(w for t in texts for w in _tokens(t) if w in _ADDRESS).most_common(4)
    # Plain directives the model can't misread.
    lines.append(f'=> Aim for about {median} characters in total; never more than {max(40, int(p90 * 1.3))}.')
    lines.append('=> Send ONE message.' if multi_ratio < 0.3
                 else '=> Two short messages in a row is natural here; one is fine too.')
    if address:
        lines.append('=> Address this person only as ' + ' / '.join(f'"{w}"' for w, _ in address)
                     + ' (or no name at all) — no other pet names or "bro"-type words.')
    else:
        lines.append('=> No pet names or "bro"-type words: none are used in this chat.')
    if emoji_rate < 0.08:
        lines.append('=> No emoji.')
    elif emoji_rate < 0.3:
        lines.append('=> At most one emoji, and only if it really fits'
                     + (f' — only ones used here: {" ".join(e for e, _ in top_emoji)}.' if top_emoji else '.'))
    elif top_emoji:
        lines.append(f'=> Emoji only from the ones used here: {" ".join(e for e, _ in top_emoji)}.')
    if ellipsis >= 0.08:
        lines.append(f'=> Uses "..." / "...." between thoughts ({round(ellipsis * 100)}% of messages) — do the same now and then.')
    if lower_i is not None and lower_i >= 0.5:
        lines.append('=> Writes "i" in lowercase.')
    if apologises <= 1:
        lines.append('=> Never apologise for replying late — not done in this chat.')
    if lower_start >= 0.6:
        lines.append('=> Start with a lowercase letter.')
    elif lower_start <= 0.2:
        lines.append('=> Start with a capital letter.')
    if ends_none >= 0.6:
        lines.append('=> No full stop at the end.')
    elif ends_period >= 0.5:
        lines.append('=> End sentences with a full stop.')
    return '\n'.join(lines)


def language_policy(owner: str, contact: str, own: dict[str, int], theirs: dict[str, int],
                    is_partner: bool, zambian: bool | None, is_business: bool, own_total: int = 0) -> str:
    used = {k for k, v in own.items() if v} | {k for k, v in theirs.items() if v}
    lines: list[str] = []
    main = max(own.items(), key=lambda kv: kv[1], default=(None, 0))
    share = (main[1] / own_total) if own_total else 0
    if main[0] and share >= 0.3:
        lines.append(f'- {owner} writes to {contact} mostly in {main[0]} mixed with English ({round(share * 100)}% of '
                     f'messages use {main[0]}). Write the same way: {main[0]} where {owner} would use it, '
                     'in the same spelling and slang.')
    else:
        lines.append('- Write mainly in English (or whatever language this chat mostly uses).')
        local_here = used & {'Bemba', 'Nyanja'}
        if local_here:
            lines.append(f'- This chat already uses {" and ".join(sorted(local_here))}. Now and then (about one reply '
                         'in three) work in a word or short phrase of it — prefer words that already appear here.')
        elif zambian and not is_business:
            lines.append(f'- {owner} is learning Bemba and Nyanja and likes using them for fun. Very occasionally '
                         '(about one reply in six) add ONE common Bemba or Nyanja word or greeting where it feels '
                         'playful and natural.')
        elif zambian and is_business:
            lines.append('- At most a single friendly Bemba or Nyanja greeting, rarely, and only when the mood is relaxed.')
        else:
            lines.append(f"- Don't use Bemba or Nyanja unless {contact} does.")
    if main[0] != 'Shona':
        if 'Shona' in used or is_partner:
            lines.append('- Shona is fine here now and then (a word or phrase)'
                         + (f" — {contact} is {owner}'s partner." if is_partner else ', since this chat already uses it.'))
        else:
            lines.append('- Never use Shona in this chat.')
    lines.append('- Only use local-language words you are certain are correct and natural. Never invent phrases.')
    return '\n'.join(lines)


async def build_chat_context(user_id: str, conversation_id: str, until: datetime | None = None) -> ChatContext | None:
    """`until` rewinds the chat to that moment (evaluation: reply as of a past message)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT c.id, c.contact_id, c.chat_summary, c.ai_enabled,
                      COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'them') AS contact_name,
                      co.is_group, co.is_business, co.customer_status, co.company, co.is_partner,
                      co.phone_number,
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
               ORDER BY m.whatsapp_timestamp DESC, m.ingest_seq DESC
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
        # Drafts Zuri wrote that went out (as-is or edited) are not the owner's
        # own voice; leave them out of the examples.
        zuri_sent = {
            r['t'] for r in await conn.fetch(
                """SELECT COALESCE(sr.edited_text, sr.suggestion_text) AS t FROM suggested_replies sr
                   JOIN messages src ON src.id = sr.message_id
                   WHERE src.conversation_id = $1 AND sr.status IN ('sent', 'approved', 'used')""",
                conversation_id,
            ) if r['t']
        }
        corrections = await conn.fetch(
            """SELECT sr.suggestion_text, sr.edited_text FROM suggested_replies sr
               JOIN messages src ON src.id = sr.message_id
               WHERE src.conversation_id = $1 AND sr.status = 'edited_and_sent'
                 AND sr.edited_text IS NOT NULL AND sr.edited_text <> sr.suggestion_text
               ORDER BY sr.updated_at DESC LIMIT 8""",
            conversation_id,
        )
        upcoming = await conn.fetch(
            """SELECT title, event_date, event_type::text AS event_type FROM events
               WHERE contact_id = $1 AND user_id = $2 AND event_date IS NOT NULL
                 AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
               ORDER BY event_date LIMIT 4""",
            conv['contact_id'], user_id,
        )
        message_count = await conn.fetchval('SELECT COUNT(*) FROM messages WHERE conversation_id = $1', conversation_id)

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
    today = now.astimezone(tz).date()
    for i, r in enumerate(rows):
        ts = r['whatsapp_timestamp']
        local = ts.astimezone(tz)
        day = local.date()
        if day != last_day:
            if day == today:
                label = 'Today'
            elif day == today - timedelta(days=1):
                label = 'Yesterday'
            else:
                label = local.strftime('%A %d %B %Y') if day.year != today.year else local.strftime('%A %d %B')
            lines.append(f'— {label} —')
            last_day = day
        elif prev_ts and ts - prev_ts > timedelta(hours=3):
            gap_h = (ts - prev_ts).total_seconds() / 3600
            lines.append(f'— {round(gap_h)} hours later —')
        prev_ts = ts

        text = _clip(describe(r), MESSAGE_CLIP) if len(describe(r)) > MESSAGE_CLIP else describe(r)
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
    owner_texts = [
        (r['body'] or '').strip() for r in reversed(rows)
        if r['sender_type'] == 'user' and (r['message_type'] or 'text') == 'text'
        and (r['body'] or '').strip() and not (r['body'] or '').startswith('http')
        and (r['body'] or '').strip() not in zuri_sent
    ]
    examples = [t for t in owner_texts if len(t) <= 220][:OWNER_EXAMPLES]
    from_other_chats = False
    if len(examples) < MIN_OWN_EXAMPLES:
        extra = await _examples_from_other_chats(user_id, conversation_id, conv['relationship_type'])
        if extra:
            examples = examples + [e for e in extra if e not in examples][:CROSS_CHAT_EXAMPLES]
            from_other_chats = True
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
    if conv['is_partner']:
        about.append(f'{contact_name} is {owner}\'s partner (girlfriend).')
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
    phone = (conv['phone_number'] or '').lstrip('+')
    zambian = phone.startswith('260') if phone else None
    own_langs = languages_used(owner_texts)
    their_langs = languages_used(contact_recent)

    return ChatContext(
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=str(conv['contact_id']),
        owner_name=owner,
        contact_name=contact_name,
        relationship_type=conv['relationship_type'],
        is_group=is_group,
        is_business=is_business,
        now_local=now.astimezone(tz).strftime('%A %d %B %Y, %H:%M'),
        transcript='\n'.join(lines),
        unanswered=unanswered,
        hours_since_owner_spoke=hours_since_owner,
        owner_voice=voice_summary,
        owner_examples=examples,
        owner_typical_chars=max(20, typical),
        about_contact='\n'.join(about),
        chat_summary='' if until else (conv['chat_summary'] or ''),
        ai_enabled=bool(conv['ai_enabled']),
        is_partner=bool(conv['is_partner']),
        fingerprint=owner_fingerprint(rows),
        language_policy=language_policy(owner, first_contact, own_langs, their_langs,
                                        bool(conv['is_partner']), zambian, is_business, len(owner_texts)),
        examples_from_other_chats=from_other_chats,
        corrections=[(c['suggestion_text'], c['edited_text']) for c in corrections],
        message_count=int(message_count or 0),
        contact_recent_texts=contact_recent[-20:],
    )


async def _examples_from_other_chats(user_id: str, conversation_id: str, relationship_type: str) -> list[str]:
    """The owner's recent messages in other 1:1 chats of the same kind, for a
    chat that has too little of his own writing yet."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT m.body FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts co ON co.id = c.contact_id
               LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
               WHERE c.user_id = $1 AND c.id <> $2 AND NOT co.is_group
                 AND COALESCE(r.relationship_type, 'acquaintance') = $3
                 AND m.sender_type = 'user' AND m.message_type = 'text' AND COALESCE(m.is_ai_generated, FALSE) = FALSE
                 AND m.body IS NOT NULL AND length(m.body) BETWEEN 2 AND 220 AND m.body NOT LIKE 'http%'
               ORDER BY m.whatsapp_timestamp DESC LIMIT 40""",
            user_id, conversation_id, relationship_type,
        )
    return [r['body'].strip() for r in rows][:CROSS_CHAT_EXAMPLES]
