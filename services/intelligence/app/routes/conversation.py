from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..database import get_pool
from ..ai.client import get_ai_client

router = APIRouter(prefix='/internal/conversations', tags=['conversations'])


class AskRequest(BaseModel):
    user_id: str
    question: str


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
