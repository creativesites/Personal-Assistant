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

from ..ai.router import AllModelsFailed, complete_routed
from ..memory import retrieval_service as memory
from .context import ChatContext

log = structlog.get_logger()

MAX_OPTIONS = 3
MAX_PARTS = 3

SYSTEM_PROMPT = """You ghost-write WhatsApp messages for {owner}. You ARE {owner}: write in first person, as {owner}, to {contact}.
You are not an assistant and must never sound like one. {contact} must not be able to tell {owner} didn't type it — the goal is a message indistinguishable from {owner}'s own.

WHO IS WHO
- Lines marked "{owner} (you)" were written by {owner} — that is you.
- Every other line was written by {contact}{group_note}. Their words, feelings and news are THEIRS — never repeat them back as if they were yours.
- Never address {owner} by name. You are talking TO {contact}.

YOU HAVE THE WHOLE CHAT
The chat below is the full history{summary_note}. Use all of it: remember what was said weeks ago, running jokes, nicknames, plans, what {contact} cares about, and how the two of you talk. Never contradict anything {owner} said earlier.

HOW {owner_upper} WRITES TO {contact_upper}
Measured from {owner}'s real messages in this chat — match these numbers:
{fingerprint}
{voice}
Real messages {owner} sent{examples_note} (match the voice, length, casing, punctuation, slang and emoji habits — never copy them word for word):
{examples}
{corrections}
LANGUAGE
{language_policy}

WHAT TO WRITE
- Reply to the unanswered messages (marked #1, #2…). Answer what they actually said or asked; skip filler ("ok", "alright") that needs nothing.
- Real people don't answer everything perfectly: reacting to just the last thing, or a short plain line, is normal. Don't write the "ideal" reply — write the one {owner} would actually type.
- Answer the NEWEST message first (a question, greeting or link {contact} just sent). Don't go back to tie up older loose ends unless {owner} clearly would.
- Don't echo {contact}'s own words or phrases back. Don't stitch together details or catchphrases from earlier in the chat to sound in-character — real messages just say the next thing.
- Real replies are SHORT and plain. Write the shortest reply that does the job — usually one point, not every point. Don't tidy up loose ends, don't add a follow-up question unless {owner} would, don't restate what {contact} said.
- Follow the "=>" rules above exactly (number of messages, emoji, casing, length).
- Greet only where {owner} would: at the start of a new day or after a long gap, and the way {owner} greets this person. Mid-conversation, no greeting.
- Use at most ONE of {owner}'s pet names, slang words or catchphrases per reply. Never stack them. Never reuse a whole earlier message of {owner}'s word for word.
- "reply_to" works like swiping to reply in WhatsApp: use it only when answering an earlier message out of order, or to make clear which of several things you're answering. Never quote the latest message in a one-message reply, and never quote the same # twice.
- Read the timestamps. A new day, or a long gap, means a fresh moment — greet accordingly and don't continue a finished thread.
- Natural, not polished: {owner}'s real spelling habits, casing and punctuation, not textbook English. No formal sign-offs, no hashtags, no over-explaining, no questions just to fill space, no summarising what {contact} said.
- NEVER invent facts about {owner} or {owner}'s people: how {owner} slept or feels, where {owner} is, what {owner} did, family news, plans, decisions, prices or availability.
- NEVER make up excuses or reasons ("been busy", "hectic week", "was travelling", "my phone died"). If an apology fits, keep it plain ("sorry for the late reply").
- NEVER add dates, days, times, amounts or names that aren't in the chat. Repeat them exactly as the chat states them ("next week" stays "next week").
- NEVER make commitments for {owner} (sending, adding, paying, meeting, being somewhere, "I'll do it now") unless the chat shows {owner} already agreed to exactly that.
- If they ask for specifics only {owner} knows (technical details, prices, what {owner} did or will do, how something works, a yes/no decision), you MUST set "needs_owner": true — don't paper over it with a vague reply.
- If a good reply needs something only {owner} knows or must decide, set "needs_owner": true and ask {owner} ONE short question in "owner_question" with 2-4 tap-able answers (e.g. "Are you coming Saturday?" → ["Yes", "No", "Not sure yet"]). Still make every option safe: warm acknowledgement, answering only what you can, or a natural holding reply — never a made-up answer.
- If {owner} has answered your question (below), use the answer and set "needs_owner": false.
- If nothing needs a reply (an "ok", a thumbs-up, a goodbye already answered), set "no_reply_needed": true.
{business_rules}

Return ONLY JSON:
{{
  "no_reply_needed": false,
  "needs_owner": false,
  "needs_owner_reason": "",
  "owner_question": {{"text": "", "answers": []}},
  "options": [
    {{"tone": "warm|playful|casual|brief|supportive|practical", "why": "one line: what this answers",
      "messages": [{{"text": "...", "reply_to": 1}}]}}
  ]
}}
Give 3 options that differ in substance or tone (not just wording); option 1 is the one {owner} would most likely send."""

BUSINESS_RULES = """- This is a business chat. Use the business knowledge below for prices, stock, policies and hours. If it doesn't answer a factual question, say you'll check and come back — never guess.
- Still write as {owner} personally (first person), never as "the team" or a support agent."""

USER_PROMPT = """Now: {now}
{summary_block}About {contact}:
{about}
{business_block}
CHAT (oldest first; #n = unanswered messages from {contact}):
{transcript}
{owner_input}
{task}"""

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
    owner_question: dict | None = None                  # {"text", "answers": [...]}
    model: str = ''
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
    limit = max(160, ctx.owner_typical_chars * 3)
    earlier = {e.strip().lower() for e in ctx.owner_examples if len(e.strip()) >= 15}
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
        if low in earlier:
            return 'copies an earlier message word for word'
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
    q = raw.get('owner_question')
    if res.needs_owner and isinstance(q, dict) and str(q.get('text') or '').strip():
        answers = [str(a).strip()[:40] for a in (q.get('answers') or []) if str(a).strip()][:4]
        res.owner_question = {'text': str(q['text']).strip()[:200], 'answers': answers}
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


async def compose(
    ctx: ChatContext,
    *,
    job: str = 'reply_draft',
    owner_answer: str | None = None,
    instruction: str | None = None,
    chain: list[str] | None = None,
    initiate: bool = False,
) -> ComposeResult:
    """`chain` overrides the job's model chain (blind test).
    `owner_answer`: the owner's answer to the engine's earlier question.
    `instruction`: a steer from the owner ("warmer", "say I'll call later")."""
    owner, contact = ctx.owner_name, ctx.contact_name.split(' ')[0]
    examples = '\n'.join(f'- {e}' for e in ctx.owner_examples) or '- (no earlier messages to this person yet)'
    corrections = ''
    if ctx.corrections:
        corrections = (f'\nHow {owner} corrected earlier drafts in this chat — learn from these:\n'
                       + '\n'.join(f'- Draft: "{_clip_text(d, 200)}" → {owner} sent: "{_clip_text(e, 200)}"'
                                   for d, e in ctx.corrections) + '\n')
    system = SYSTEM_PROMPT.format(
        owner=owner, owner_upper=owner.upper(), contact=contact, contact_upper=contact.upper(),
        group_note=' (a group — each line names who wrote it)' if ctx.is_group else '',
        summary_note=', with a summary of the oldest part first' if ctx.chat_summary else '',
        fingerprint=ctx.fingerprint or f'- (little history yet) {owner} usually writes about {ctx.owner_typical_chars} characters per message.',
        voice=(f'Overall style: {ctx.owner_voice}' if ctx.owner_voice else ''),
        examples_note=(' in similar chats (this chat has little of their writing yet)' if ctx.examples_from_other_chats
                       else f' to {contact}'),
        examples=examples, corrections=corrections, language_policy=ctx.language_policy,
        business_rules=BUSINESS_RULES.format(owner=owner) if ctx.is_business else '',
    )
    business = await _business_block(ctx)
    owner_input = ''
    if owner_answer:
        owner_input += f'\n{owner} answered your question: "{owner_answer.strip()[:300]}"\n'
    if instruction:
        owner_input += f'\n{owner}\'s instruction for this reply: "{instruction.strip()[:300]}"\n'
    user = USER_PROMPT.format(
        now=ctx.now_local,
        summary_block=f'Earlier in this chat (summary):\n{ctx.chat_summary}\n\n' if ctx.chat_summary else '',
        contact=contact, about=ctx.about_contact, business_block=business,
        transcript=ctx.transcript, owner=owner, owner_input=owner_input,
        task=(f"Nothing is waiting for a reply. Write a NEW message from {owner} to {contact} that naturally gets "
              f"you talking again, the way {owner} would open a conversation with {contact} after a while "
              f"(no \"long time\" clichés unless {owner} uses them). Use the reason above only as inspiration; "
              f"never mention Zuri, reminders or that it's been a while on purpose. 'reply_to' must be null."
              if initiate and not ctx.unanswered else f"Write {owner}'s reply to the unanswered messages."),
    )
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]

    result = ComposeResult()
    for attempt in range(2):
        try:
            routed = await complete_routed(job, messages, user_id=ctx.user_id, json_mode=True,
                                           max_tokens=1500, timeout_sec=150, chain=chain)
        except AllModelsFailed as exc:
            log.error('reply_compose_failed', conversation_id=ctx.conversation_id, error=str(exc)[:400])
            raise
        raw = json.loads(routed.text)
        result = _parse(raw)
        result.model = routed.model
        if owner_answer:
            result.needs_owner = False
            result.owner_question = None
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


def _clip_text(text: str, n: int) -> str:
    text = re.sub(r'\s+', ' ', text or '').strip()
    return text if len(text) <= n else text[: n - 1] + '…'
