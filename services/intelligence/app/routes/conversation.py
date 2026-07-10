from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bullmq import Queue
from ..database import get_pool
from ..ai.client import get_ai_client
from ..queue import redis_conn_opts

router = APIRouter(prefix='/internal/conversations', tags=['conversations'])

advisor_router = APIRouter(prefix='/internal/advisor', tags=['advisor'])


class AskRequest(BaseModel):
    user_id: str
    question: str
    session_id: Optional[str] = None


async def _get_recent_messages(conversation_id: str, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''SELECT m.sender_type, m.body, m.whatsapp_timestamp,
                      co.custom_name, co.display_name
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts co ON co.id = c.contact_id
               WHERE m.conversation_id = $1
                 AND m.is_deleted = false
                 AND m.body IS NOT NULL
                 AND m.message_type = 'text'
               ORDER BY m.whatsapp_timestamp DESC
               LIMIT $2''',
            conversation_id,
            limit,
        )
    return [dict(r) for r in reversed(rows)]


def _format_transcript(messages: list[dict], contact_name: str = 'Contact') -> str:
    lines = []
    for m in messages:
        speaker = 'You' if m['sender_type'] == 'user' else contact_name
        lines.append(f'{speaker}: {m["body"]}')
    return '\n'.join(lines)


@router.post('/{conversation_id}/summarize')
async def summarize_conversation(conversation_id: str, user_id: str):
    messages = await _get_recent_messages(conversation_id, limit=60)
    if not messages:
        raise HTTPException(status_code=404, detail='No messages found')

    contact_name = (
        messages[0].get('custom_name')
        or messages[0].get('display_name')
        or 'Contact'
    )
    transcript = _format_transcript(messages, contact_name)

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                'You are a business intelligence assistant. Summarize this WhatsApp '
                'conversation concisely. Cover: key topics discussed, current state, '
                'open items, and clear next steps. Use short bullet points. '
                'Max 150 words.'
            ),
        },
        {'role': 'user', 'content': f'Summarize this conversation:\n\n{transcript}'},
    ])

    return {'summary': result}


@router.post('/{conversation_id}/followup')
async def generate_followup(conversation_id: str, user_id: str):
    messages = await _get_recent_messages(conversation_id, limit=20)
    if not messages:
        raise HTTPException(status_code=404, detail='No messages found')

    contact_name = (
        messages[0].get('custom_name')
        or messages[0].get('display_name')
        or 'this person'
    )
    transcript = _format_transcript(messages, contact_name)

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                f'You are a WhatsApp messaging assistant. Write a natural, friendly '
                f'follow-up message to {contact_name} that picks up from where the '
                f'conversation left off. Be concise (1-3 sentences). '
                f'No formal salutations. No quotation marks. Return only the message text.'
            ),
        },
        {
            'role': 'user',
            'content': f'Generate a follow-up message based on this conversation:\n\n{transcript}',
        },
    ])

    return {'followup': result.strip().strip('"').strip("'")}


@router.post('/{conversation_id}/ask')
async def ask_ai(conversation_id: str, body: AskRequest):
    messages = await _get_recent_messages(conversation_id, limit=30)
    if not messages:
        raise HTTPException(status_code=404, detail='No messages found')

    contact_name = (
        messages[0].get('custom_name')
        or messages[0].get('display_name')
        or 'Contact'
    )
    transcript = _format_transcript(messages, contact_name)

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                'You are an AI assistant helping analyse a WhatsApp conversation. '
                'Answer the user\'s question concisely and directly based on the '
                'conversation context. Be specific and actionable.'
            ),
        },
        {
            'role': 'user',
            'content': f'Conversation:\n{transcript}\n\nQuestion: {body.question}',
        },
    ])

    return {'answer': result}


class AnalyseHistoryRequest(BaseModel):
    user_id: str
    contact_id: str
    recent_count: int = 30


@router.post('/{conversation_id}/analyse-history')
async def analyse_history(conversation_id: str, body: AnalyseHistoryRequest):
    """
    Called by the WhatsApp service after historical sync for one chat.
    Queues a contact profile rebuild and health recalculation based on
    the most recent messages — no per-message AI calls needed.
    """
    profile_queue = Queue('analysis.contact_profile', {'connection': redis_conn_opts()})
    temporal_queue = Queue('temporal.clock_check', {'connection': redis_conn_opts()})

    await profile_queue.add('historical_profile', {
        'contactId': body.contact_id,
        'userId': body.user_id,
        'conversationId': conversation_id,
        'recentCount': body.recent_count,
        'isHistorical': True,
    })
    await temporal_queue.add('cadence', {
        'contactId': body.contact_id,
        'userId': body.user_id,
    })

    return {'queued': True, 'conversationId': conversation_id}


class AdvisorAskRequest(BaseModel):
    user_id: str
    question: str
    session_id: Optional[str] = None


@advisor_router.post('/ask')
async def advisor_ask(body: AdvisorAskRequest):
    """Global advisor — answers questions about the user's full contact network."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''SELECT co.display_name, c.last_message_preview, c.unread_count,
                      COALESCE(r.health_score, 50) AS health_score,
                      c.last_message_at
               FROM conversations c
               JOIN contacts co ON co.id = c.contact_id
               LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
               WHERE c.user_id = $1 AND c.is_archived = false
               ORDER BY c.last_message_at DESC NULLS LAST
               LIMIT 20''',
            body.user_id,
        )

    context_lines = []
    for row in rows:
        preview = (row['last_message_preview'] or '')[:100]
        context_lines.append(
            f"- {row['display_name']}: health={row['health_score']}%, "
            f"unread={row['unread_count']}, last: \"{preview}\""
        )
    context = '\n'.join(context_lines) or 'No recent conversations found.'

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                'You are Zuri, an AI relationship intelligence assistant. '
                'You have deep knowledge of the user\'s WhatsApp contacts and conversations. '
                'Answer questions concisely and be specific. Reference contacts by name. '
                'When drafting a message, write it naturally as a WhatsApp message — '
                'no formal salutations, no quotation marks. Return only the draft text when asked to draft.'
            ),
        },
        {
            'role': 'user',
            'content': f'Recent contacts context:\n{context}\n\nQuestion: {body.question}',
        },
    ])

    return {'answer': result}
