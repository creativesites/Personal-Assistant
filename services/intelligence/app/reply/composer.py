"""Reply composer: writes the owner's next WhatsApp message(s) in one chat.

One structured call produces up to three reply options. Each option is 1-3
short WhatsApp messages; a message may quote one of the unanswered incoming
messages (#n) it answers. Deterministic guards then reject drafts that echo
the contact, address the owner by name, sound like an assistant, or run long.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import structlog

from ..ai.client import get_ai_client
from ..memory import retrieval_service as memory
from .context import ChatContext

log = structlog.get_logger()

MAX_OPTIONS = 3
MAX_PARTS = 3

SYSTEM_PROMPT = """You ghost-write WhatsApp messages for {owner}. You ARE {owner}: write in first person, as {owner}, to {contact}.
You are not an assistant and must never sound like one. {contact} must not be able to tell {owner} didn't type it.

WHO IS WHO
- Lines marked "{owner} (you)" were written by {owner} — that is you.
- Every other line was written by {contact}{group_note}. Their words, feelings and news are THEIRS — never repeat them back as if they were yours.
- Never address {owner} by name. You are talking TO {contact}.

HOW {owner_upper} WRITES
{voice}
Real messages {owner} sent to {contact} (match this voice, length, language mix, pet names and emoji habits — do not copy them):
{examples}
{owner} usually writes about {typical} characters per message here. Stay close to that; shorter is better than longer.

WHAT TO WRITE
- Reply to the unanswered messages (marked #1, #2…). Answer what they actually said or asked; skip filler ("ok", "alright") that needs nothing.
- Default to ONE message. Use 2 (rarely 3) only when they raised clearly separate things that read better answered apart.
- "reply_to" works like swiping to reply in WhatsApp: use it only when answering an earlier message out of order, or to make clear which of several things you're answering. Never quote the latest message in a one-message reply, and never quote the same # twice.
- Read the timestamps. A new day, or a long gap, means a fresh moment — greet accordingly and don't continue a finished thread.
- Be natural: casual, warm or brief as the relationship and moment call for. No formal sign-offs, no hashtags, no over-explaining, no questions just to fill space.
- NEVER invent facts about {owner} or his people: how he slept or feels, where he is, what he did, how his family is, plans, decisions, prices or availability.
- NEVER make commitments for {owner} (sending, adding, paying, meeting, being somewhere, "I'll do it now") unless the chat shows he already agreed to exactly that.
- If a good reply needs something only {owner} knows or must decide, set "needs_owner": true with a short reason, and still make every option safe: warm acknowledgement, answering only what you can, or a natural holding reply ("let me check" style) — never a made-up answer.
- If nothing needs a reply (an "ok", a thumbs-up, a goodbye already answered), set "no_reply_needed": true.
{business_rules}

Return ONLY JSON:
{{
  "no_reply_needed": false,
  "needs_owner": false,
  "needs_owner_reason": "",
  "options": [
    {{"tone": "warm|playful|casual|brief|supportive|practical", "why": "one line: what this answers",
      "messages": [{{"text": "...", "reply_to": 1}}]}}
  ]
}}
Give 3 options that differ in substance or tone (not just wording); option 1 is your best."""

BUSINESS_RULES = """- This is a business chat. Use the business knowledge below for prices, stock, policies and hours. If it doesn't answer a factual question, say you'll check and come back — never guess.
- Still write as {owner} personally (first person), never as "the team" or a support agent."""

USER_PROMPT = """Now: {now}
{summary_block}About {contact}:
{about}
{business_block}
CHAT (oldest first; #n = unanswered messages from {contact}):
{transcript}

Write {owner}'s reply to the unanswered messages."""

_ASSISTANT_SPEAK = re.compile(
    r"\b(as an ai|i'?m an ai|assistant|how (can|may) i (help|assist)|i'?m here to help|happy to help|"
    r"feel free to reach out|let me know if you (need|have) any|i am not able to get into)\b",
    re.I,
)


@dataclass
class ReplyPart:
    text: str
    reply_to: int | None = None          # 1-based index into ctx.unanswered


@dataclass
class ReplyOption:
    parts: list[ReplyPart]
    tone: str = ''
    why: str = ''

    @property
    def text(self) -> str:
        return '\n'.join(p.text for p in self.parts)


@dataclass
class ComposeResult:
    options: list[ReplyOption] = field(default_factory=list)
    no_reply_needed: bool = False
    needs_owner: bool = False
    needs_owner_reason: str = ''
    rejected: list[str] = field(default_factory=list)   # guard failures (for logs/eval)


def _words(text: str) -> set[str]:
    return {w for w in re.sub(r'[^\w\s]', ' ', text.lower()).split() if len(w) > 2}


_FIRST_PERSON = re.compile(r"\b(i|i'm|im|i've|ive|i'd|my|me|mine|myself)\b", re.I)


def _echoes(text: str, contact_texts: list[str]) -> bool:
    """Draft claims the contact's own experience as the owner's — e.g. they
    wrote "My night was not pleasant, my body was sweating" and the draft
    says "My night was not good, my body kept sweating". Sympathy that
    reuses their words ("sorry your night was rough") is fine."""
    if not _FIRST_PERSON.search(text):
        return False
    w = _words(text)
    if len(w) < 5:
        return False
    for c in contact_texts:
        cw = _words(c)
        if len(cw) < 5 or not _FIRST_PERSON.search(c):
            continue
        if len(w & cw) / min(len(w), len(cw)) >= 0.5:
            return True
    return False


def guard(option: ReplyOption, ctx: ChatContext) -> str | None:
    """Return why a draft is unsafe to use, or None if it's fine."""
    owner = ctx.owner_name.lower()
    contact_first = ctx.contact_name.split(' ')[0].lower()
    limit = max(240, ctx.owner_typical_chars * 4)
    for p in option.parts:
        t = p.text.strip()
        if not t:
            return 'empty message'
        low = t.lower()
        if owner and owner != contact_first and re.search(rf'(^|[\s,!(])(hi|hey|hello|dear|morning|evening)?\s*{re.escape(owner)}\b', low):
            return f'addresses {ctx.owner_name} by name'
        if _ASSISTANT_SPEAK.search(t):
            return 'sounds like an assistant'
        if _echoes(t, ctx.contact_recent_texts):
            return "repeats the contact's own words"
        if len(t) > limit:
            return f'too long ({len(t)} chars)'
        if p.reply_to is not None and not (1 <= p.reply_to <= len(ctx.unanswered)):
            p.reply_to = None
    return None


async def _business_block(ctx: ChatContext) -> str:
    if not ctx.is_business:
        return ''
    query = ' '.join(i.text for i in ctx.unanswered)[-500:]
    chunks: list[str] = []
    try:
        kb = await memory.get_kb_chunks(ctx.user_id, query, agent_id=None, limit=4)
        chunks += [f"- {c['content'][:400]}" for c in kb]
    except Exception:  # noqa: BLE001
        pass
    try:
        facts = memory.format_business_facts(await memory.get_business_facts(ctx.user_id))
        if facts:
            chunks.append(facts)
    except Exception:  # noqa: BLE001
        pass
    try:
        catalog = memory.format_catalog_items(await memory.get_relevant_catalog(ctx.user_id, limit=25))
        if catalog:
            chunks.append('Catalog:\n' + catalog)
    except Exception:  # noqa: BLE001
        pass
    return ('\nBUSINESS KNOWLEDGE:\n' + '\n'.join(chunks) + '\n') if chunks else ''


def _parse(raw: dict) -> ComposeResult:
    res = ComposeResult(
        no_reply_needed=bool(raw.get('no_reply_needed')),
        needs_owner=bool(raw.get('needs_owner')),
        needs_owner_reason=str(raw.get('needs_owner_reason') or '').strip(),
    )
    for o in (raw.get('options') or [])[:MAX_OPTIONS]:
        if not isinstance(o, dict):
            continue
        parts = []
        for m in (o.get('messages') or [])[:MAX_PARTS]:
            if isinstance(m, dict) and str(m.get('text') or '').strip():
                rt = m.get('reply_to')
                parts.append(ReplyPart(text=str(m['text']).strip(), reply_to=int(rt) if isinstance(rt, (int, float)) else None))
        seen_quotes: set[int] = set()
        for p in parts:
            if p.reply_to is not None:
                if p.reply_to in seen_quotes:
                    p.reply_to = None
                else:
                    seen_quotes.add(p.reply_to)
        if parts:
            res.options.append(ReplyOption(parts=parts, tone=str(o.get('tone') or ''), why=str(o.get('why') or '')))
    return res


async def compose(ctx: ChatContext) -> ComposeResult:
    owner, contact = ctx.owner_name, ctx.contact_name.split(' ')[0]
    examples = '\n'.join(f'- {e}' for e in ctx.owner_examples) or '- (no earlier messages to this person yet)'
    system = SYSTEM_PROMPT.format(
        owner=owner, owner_upper=owner.upper(), contact=contact,
        group_note=' (a group — each line names who wrote it)' if ctx.is_group else '',
        voice=ctx.owner_voice or f'{owner} writes casually and briefly.',
        examples=examples, typical=ctx.owner_typical_chars,
        business_rules=BUSINESS_RULES.format(owner=owner) if ctx.is_business else '',
    )
    business = await _business_block(ctx)
    user = USER_PROMPT.format(
        now=ctx.now_local,
        summary_block=f'Earlier in this chat (summary):\n{ctx.chat_summary}\n\n' if ctx.chat_summary else '',
        contact=contact, about=ctx.about_contact, business_block=business,
        transcript=ctx.transcript, owner=owner,
    )
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
    client = get_ai_client()

    result = ComposeResult()
    for attempt in range(2):
        raw = await client.complete_json(
            messages, model='sonnet', service='intelligence', feature='reply_compose',
            user_id=ctx.user_id, timeout_sec=60,
        )
        result = _parse(raw)
        if result.no_reply_needed:
            return result
        good, rejected = [], []
        for opt in result.options:
            why = guard(opt, ctx)
            (rejected if why else good).append(why or opt)
        result.rejected += [r for r in rejected if isinstance(r, str)]
        if good:
            result.options = good
            return result
        # Every option failed a guard: say exactly why and try once more.
        messages = messages + [
            {'role': 'assistant', 'content': json.dumps(raw)[:4000]},
            {'role': 'user', 'content': 'Those drafts are unusable: ' + '; '.join(result.rejected)
             + f'. Remember you ARE {owner} writing to {contact}. Try again, same JSON format.'},
        ]
    log.warning('reply_compose_all_rejected', conversation_id=ctx.conversation_id, reasons=result.rejected)
    result.options = []
    return result
