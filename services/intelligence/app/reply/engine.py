"""Reply engine: compose → save as suggestions → (maybe) auto-send.

Live incoming messages are debounced: each contact message schedules a
compose job ~20s later; a job whose message is no longer the newest from the
contact steps aside, so a burst of messages gets ONE reply covering all of it.
"""
from __future__ import annotations

import json

import httpx
import structlog
from bullmq import Queue

from ..config import settings
from ..database import get_pool
from ..queue import publish_event, redis_conn_opts
from ..services.auto_response import AutoResponseService
from ..services.scoped_automation import get_scoped_automation
from .composer import ComposeResult, compose
from .context import ChatContext, build_chat_context
from .summary import ensure_chat_summary

log = structlog.get_logger()

COMPOSE_QUEUE = 'replies.compose'
DEBOUNCE_MS = 20_000

_auto_response = AutoResponseService()
_compose_queue: Queue | None = None


def compose_queue() -> Queue:
    global _compose_queue
    if _compose_queue is None:
        _compose_queue = Queue(COMPOSE_QUEUE, {'connection': redis_conn_opts()})
    return _compose_queue


async def schedule_compose(user_id: str, conversation_id: str, message_id: str) -> None:
    """Called for every live incoming contact message."""
    await compose_queue().add(
        'compose',
        {'userId': user_id, 'conversationId': conversation_id, 'messageId': message_id},
        {'delay': DEBOUNCE_MS, 'jobId': f'compose-{message_id}', 'removeOnComplete': True, 'removeOnFail': 50},
    )


def _serialise(ctx: ChatContext, result: ComposeResult) -> dict:
    by_index = {i.index: i for i in ctx.unanswered}
    return {
        'noReplyNeeded': result.no_reply_needed,
        'needsOwner': result.needs_owner,
        'needsOwnerReason': result.needs_owner_reason,
        'rejected': result.rejected,
        'unanswered': [{'index': i.index, 'text': i.text} for i in ctx.unanswered],
        'options': [
            {
                'tone': o.tone, 'why': o.why,
                'messages': [
                    {'text': p.text, 'replyTo': p.reply_to,
                     'quoting': by_index[p.reply_to].text if p.reply_to in by_index else None}
                    for p in o.parts
                ],
            }
            for o in result.options
        ],
    }


async def run_compose(
    user_id: str,
    conversation_id: str,
    *,
    trigger_message_id: str | None = None,
    mode: str = 'live',          # live | regenerate | dry_run
) -> dict:
    if mode == 'live' and trigger_message_id and await _superseded(conversation_id, trigger_message_id):
        return {'skipped': 'newer_message_will_handle_it'}

    await ensure_chat_summary(user_id, conversation_id)
    await _transcribe_unanswered_voice_notes(user_id, conversation_id)
    ctx = await build_chat_context(user_id, conversation_id)
    if ctx is None:
        return {'skipped': 'conversation_not_found'}
    if ctx.is_group and mode == 'live':
        return {'skipped': 'group_chat'}
    if not ctx.unanswered:
        return {'skipped': 'nothing_unanswered'}
    if mode == 'live' and all(i.requires_response is False for i in ctx.unanswered):
        return {'skipped': 'no_response_needed'}

    result = await compose(ctx)
    out = _serialise(ctx, result)
    if mode == 'dry_run':
        out['transcriptTail'] = ctx.transcript[-1500:]
        return out
    if result.no_reply_needed or not result.options:
        return out

    suggestion_ids = await _save(ctx, result)
    out['suggestionIds'] = suggestion_ids
    anchor = ctx.unanswered[-1]
    await publish_event(f'suggestion:ready:{user_id}', json.dumps({
        'messageId': anchor.message_id, 'conversationId': conversation_id, 'count': len(suggestion_ids),
    }))
    if mode == 'live' and not result.needs_owner:
        out['autoSend'] = await _maybe_auto_send(ctx, result, suggestion_ids[0])
    return out


async def _superseded(conversation_id: str, message_id: str) -> bool:
    """A newer contact message exists — its own compose job covers this one too."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return bool(await conn.fetchval(
            """SELECT EXISTS (
                 SELECT 1 FROM messages later, messages m
                 WHERE m.id = $2 AND later.conversation_id = $1 AND later.sender_type = 'contact'
                   AND later.whatsapp_timestamp > m.whatsapp_timestamp)""",
            conversation_id, message_id,
        ))


async def _save(ctx: ChatContext, result: ComposeResult) -> list[str]:
    anchor = ctx.unanswered[-1]
    by_index = {i.index: i for i in ctx.unanswered}
    ids: list[str] = []
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Older drafts for this stretch of the chat are now stale.
            await conn.execute(
                """UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW()
                   WHERE status = 'pending' AND message_id = ANY($1::uuid[])""",
                [i.message_id for i in ctx.unanswered],
            )
            for opt in result.options:
                parts = []
                for p in opt.parts:
                    quote = by_index.get(p.reply_to) if p.reply_to else None
                    # Quoting the very last message in a one-message reply is just noise.
                    if quote and len(opt.parts) == 1 and quote.index == anchor.index:
                        quote = None
                    parts.append({'text': p.text, 'quoteMessageId': quote.message_id if quote else None})
                sid = await conn.fetchval(
                    """INSERT INTO suggested_replies
                         (message_id, suggestion_text, tone, reasoning, parts, needs_owner, needs_owner_reason)
                       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING id""",
                    anchor.message_id, opt.text, (opt.tone or 'casual')[:30], opt.why[:500],
                    json.dumps(parts), result.needs_owner, result.needs_owner_reason[:300] or None,
                )
                ids.append(str(sid))
    return ids


async def _maybe_auto_send(ctx: ChatContext, result: ComposeResult, suggestion_id: str) -> dict:
    anchor = ctx.unanswered[-1]
    body = '\n'.join(i.text for i in ctx.unanswered)
    eligibility = await _auto_response.check_eligibility(
        user_id=ctx.user_id, conversation_id=ctx.conversation_id,
        contact_id=ctx.contact_id, message_body=body,
    )
    if not eligibility.should_send or not eligibility.recipient_jid:
        return {'sent': False, 'reason': eligibility.reason}
    best = result.options[0]
    allowed = eligibility.approval_mode == 'auto'
    if not allowed:
        grant = await get_scoped_automation().find_active_grant(ctx.conversation_id)
        if grant:
            allowed, _ = await get_scoped_automation().check_reply_in_scope(grant, body, best.text)
    if not allowed:
        return {'sent': False, 'reason': f'approval_mode_{eligibility.approval_mode}'}
    if ctx.is_business:
        from ..neural.policy_enforcer import PolicyEnforcer
        policy = await PolicyEnforcer().evaluate_reply(ctx.user_id, best.text, ctx.contact_id)
        if not policy.get('is_compliant', True):
            return {'sent': False, 'reason': 'business_policy'}

    by_id = {i.message_id: i for i in ctx.unanswered}
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT parts FROM suggested_replies WHERE id = $1', suggestion_id)
        parts = json.loads(row['parts']) if isinstance(row['parts'], str) else row['parts']
        await conn.execute(
            """UPDATE suggested_replies
               SET status = 'approved', scheduled_send_at = NOW() + make_interval(secs => $2::int), updated_at = NOW()
               WHERE id = $1 AND status = 'pending'""",
            suggestion_id, int(eligibility.delay_seconds or 0),
        )
        # Other options for the same messages are no longer needed.
        await conn.execute(
            """UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW()
               WHERE message_id = $1 AND status = 'pending' AND id <> $2""",
            anchor.message_id, suggestion_id,
        )
    send_parts = []
    for p in parts:
        q = by_id.get(p.get('quoteMessageId') or '')
        send_parts.append({
            'text': p['text'],
            **({'quotedWaMessageId': q.whatsapp_message_id, 'quotedBody': q.text[:200]} if q and q.whatsapp_message_id else {}),
        })
    await _auto_response.enqueue_send(
        user_id=ctx.user_id, message_id=anchor.message_id, suggested_reply_id=suggestion_id,
        recipient_jid=eligibility.recipient_jid, text=best.text,
        delay_seconds=eligibility.delay_seconds, job_name='compose_auto_send', parts=send_parts,
    )
    log.info('reply_auto_send_scheduled', conversation_id=ctx.conversation_id,
             suggestion_id=suggestion_id, delay_seconds=eligibility.delay_seconds, parts=len(send_parts))
    return {'sent': True, 'delaySeconds': eligibility.delay_seconds}


async def _transcribe_unanswered_voice_notes(user_id: str, conversation_id: str) -> None:
    """A reply to a voice note needs to know what was said in it."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        ids = await conn.fetch(
            """SELECT m.id FROM messages m
               WHERE m.conversation_id = $1 AND m.sender_type = 'contact' AND m.message_type = 'audio'
                 AND m.media_url IS NOT NULL
                 AND (m.transcription IS NULL OR m.transcription = '[Audio voice message]')
                 AND m.whatsapp_timestamp > COALESCE(
                   (SELECT MAX(whatsapp_timestamp) FROM messages WHERE conversation_id = $1 AND sender_type = 'user'),
                   'epoch'::timestamptz)
               ORDER BY m.whatsapp_timestamp DESC LIMIT 4""",
            conversation_id,
        )
    if not ids:
        return
    async with httpx.AsyncClient(timeout=90.0) as client:
        for r in ids:
            try:
                res = await client.post(
                    f'{settings.api_url}/api/internal/messages/{r["id"]}/transcribe',
                    json={'userId': user_id},
                    headers={'x-internal-secret': settings.internal_api_secret},
                )
                if res.status_code >= 400:
                    log.warning('voice_note_transcribe_failed', message_id=str(r['id']), status=res.status_code, body=res.text[:200])
            except httpx.HTTPError as exc:
                log.warning('voice_note_transcribe_failed', message_id=str(r['id']), error=str(exc)[:200])
