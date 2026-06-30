"""
Conversation intelligence routes.
Prefix: /internal/conversations
"""

import json
import structlog
import litellm
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..config import settings
from ..database import get_pool

logger = structlog.get_logger()

router = APIRouter(prefix='/internal/conversations', tags=['conversations'])


# ─── Request models ────────────────────────────────────────────────────────────

class ConversationRequest(BaseModel):
    user_id: str
    conversation_id: str


class FollowUpRequest(BaseModel):
    user_id: str
    conversation_id: str
    tone: Optional[str] = None  # e.g. 'warm', 'professional', 'casual'


class SearchRequest(BaseModel):
    user_id: str
    conversation_id: str
    query: str
    limit: int = 20


class DraftAnalysisRequest(BaseModel):
    user_id: str
    conversation_id: str
    contact_id: str
    draft_text: str


class ProposalRequest(BaseModel):
    user_id: str
    conversation_id: str
    context_hint: Optional[str] = None  # additional context from user


class QuoteRequest(BaseModel):
    user_id: str
    conversation_id: str
    currency: str = 'USD'


class AskAIRequest(BaseModel):
    user_id: str
    conversation_id: str
    question: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _fetch_messages(conversation_id: str, user_id: str, limit: int = 50) -> list[dict]:
    """Fetch the most recent `limit` messages for a conversation."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.id, m.body, m.direction, m.sent_at, m.sender_name
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.conversation_id = $1
              AND c.user_id = $2
            ORDER BY m.sent_at DESC
            LIMIT $3
            """,
            conversation_id, user_id, limit,
        )
    # Return in chronological order
    return [dict(r) for r in reversed(rows)]


def _format_transcript(messages: list[dict]) -> str:
    """Format messages as a readable transcript string."""
    lines = []
    for m in messages:
        direction = 'Me' if m['direction'] == 'outgoing' else (m.get('sender_name') or 'Contact')
        body = (m['body'] or '').strip()
        if body:
            lines.append(f"{direction}: {body}")
    return '\n'.join(lines)


async def _fetch_contact_profile(contact_id: str, user_id: str) -> dict:
    """Fetch basic contact info and profile summary."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT c.name, c.phone_number, c.job_title, c.company_name,
                   cp.personality_summary, cp.communication_style, cp.current_life_context
            FROM contacts c
            LEFT JOIN contact_profiles cp ON cp.contact_id = c.id
            WHERE c.id = $1 AND c.user_id = $2
            """,
            contact_id, user_id,
        )
    return dict(row) if row else {}


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post('/summarize')
async def summarize_conversation(req: ConversationRequest):
    """Summarise the last 50 messages; return summary, key_points, open_items."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            return {'summary': '', 'key_points': [], 'open_items': []}

        transcript = _format_transcript(messages)

        prompt = (
            'You are a concise conversation analyst.\n\n'
            'Read the following WhatsApp conversation transcript and return a JSON object with:\n'
            '- "summary": a 2-4 sentence plain-English overview of what was discussed\n'
            '- "key_points": list of up to 5 short bullet strings capturing the most important facts\n'
            '- "open_items": list of unresolved questions, requests, or next steps still pending\n\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'summary': result.get('summary', ''),
            'key_points': result.get('key_points', []),
            'open_items': result.get('open_items', []),
        }
    except Exception as exc:
        logger.error('summarize_conversation_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/follow-up')
async def generate_follow_up(req: FollowUpRequest):
    """Generate a follow-up message based on conversation context and contact profile."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=30)
        if not messages:
            raise HTTPException(status_code=404, detail='No messages found for conversation')

        transcript = _format_transcript(messages)
        tone_hint = f' Use a {req.tone} tone.' if req.tone else ''

        # Try to get contact_id from the conversation
        pool = await get_pool()
        async with pool.acquire() as conn:
            conv_row = await conn.fetchrow(
                'SELECT contact_id FROM conversations WHERE id = $1 AND user_id = $2',
                req.conversation_id, req.user_id,
            )
        contact_profile: dict = {}
        if conv_row and conv_row['contact_id']:
            contact_profile = await _fetch_contact_profile(str(conv_row['contact_id']), req.user_id)

        profile_context = ''
        if contact_profile.get('personality_summary'):
            profile_context = f"\nContact profile: {contact_profile['personality_summary']}"

        prompt = (
            'You are a relationship-savvy communication advisor.\n\n'
            'Based on the conversation transcript below, craft a short, natural follow-up message '
            'that continues the dialogue, shows genuine interest, or nudges towards the next step.'
            f'{tone_hint}{profile_context}\n\n'
            'Return a JSON object with:\n'
            '- "text": the follow-up message text\n'
            '- "tone": the tone you used (e.g. warm, professional, casual)\n'
            '- "reasoning": one sentence explaining why this follow-up makes sense now\n\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'text': result.get('text', ''),
            'tone': result.get('tone', ''),
            'reasoning': result.get('reasoning', ''),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error('generate_follow_up_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/search')
async def search_conversation(req: SearchRequest):
    """
    Semantic search over message embeddings in this conversation.
    Falls back to ILIKE text search if no embeddings exist.
    Returns results sorted by relevance score descending.
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Attempt vector search via message_analyses embeddings
            vector_rows = await conn.fetch(
                """
                SELECT m.id AS message_id, m.body, m.sent_at,
                       1 - (ma.embedding <=> ma.embedding) AS score
                FROM messages m
                JOIN message_analyses ma ON ma.message_id = m.id
                WHERE m.conversation_id = $1
                  AND ma.embedding IS NOT NULL
                ORDER BY ma.embedding <=> (
                    SELECT embedding FROM message_analyses ma2
                    JOIN messages m2 ON m2.id = ma2.message_id
                    WHERE m2.conversation_id = $1
                    LIMIT 1
                )
                LIMIT $2
                """,
                req.conversation_id, req.limit,
            )

            if vector_rows:
                # We have embeddings — do a proper cosine similarity search
                # Generate query embedding via LiteLLM embeddings
                embed_resp = await litellm.aembedding(
                    model=settings.embedding_model,
                    input=[req.query],
                )
                query_vector = embed_resp.data[0]['embedding']

                rows = await conn.fetch(
                    """
                    SELECT m.id AS message_id, m.body, m.sent_at,
                           (1 - (ma.embedding <=> $3::vector)) AS score
                    FROM messages m
                    JOIN message_analyses ma ON ma.message_id = m.id
                    WHERE m.conversation_id = $1
                      AND ma.embedding IS NOT NULL
                    ORDER BY ma.embedding <=> $3::vector
                    LIMIT $2
                    """,
                    req.conversation_id, req.limit, query_vector,
                )
            else:
                # Fallback: text ILIKE search
                rows = await conn.fetch(
                    """
                    SELECT m.id AS message_id, m.body, m.sent_at,
                           1.0 AS score
                    FROM messages m
                    WHERE m.conversation_id = $1
                      AND m.body ILIKE $2
                    ORDER BY m.sent_at DESC
                    LIMIT $3
                    """,
                    req.conversation_id, f'%{req.query}%', req.limit,
                )

        results = [
            {
                'message_id': str(r['message_id']),
                'body': r['body'],
                'sent_at': r['sent_at'].isoformat() if r['sent_at'] else None,
                'score': float(r['score']) if r['score'] is not None else 0.0,
            }
            for r in rows
        ]
        return {'results': results}
    except Exception as exc:
        logger.error('search_conversation_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/extract-tasks')
async def extract_tasks(req: ConversationRequest):
    """Parse conversation messages for action items / tasks."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            return {'tasks': []}

        transcript = _format_transcript(messages)

        prompt = (
            'You are a task extraction assistant.\n\n'
            'Read the following WhatsApp conversation and identify all action items, to-dos, '
            'and things that need to be done by either party.\n\n'
            'Return a JSON object with:\n'
            '- "tasks": array of objects, each with:\n'
            '    - "title": short task title (max 80 chars)\n'
            '    - "description": optional longer description\n'
            '    - "due_date": ISO date string if a deadline was mentioned, else null\n'
            '    - "made_by": "user" if the current user must do it, "contact" if the contact must do it\n\n'
            'If no tasks are found return {"tasks": []}.\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {'tasks': result.get('tasks', [])}
    except Exception as exc:
        logger.error('extract_tasks_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/extract-promises')
async def extract_promises(req: ConversationRequest):
    """Parse messages for commitments / promises made by either party."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            return {'promises': []}

        transcript = _format_transcript(messages)

        prompt = (
            'You are a commitment-tracking assistant.\n\n'
            'Read the following WhatsApp conversation and identify all explicit or implicit '
            'promises and commitments — things one party said they would do for the other.\n\n'
            'Return a JSON object with:\n'
            '- "promises": array of objects, each with:\n'
            '    - "body": the promise in plain English (e.g. "Will send the invoice by Friday")\n'
            '    - "made_by": "user" if the current user made the promise, "contact" if the contact made it\n'
            '    - "due_date": ISO date string if a deadline was mentioned or implied, else null\n\n'
            'If no promises are found return {"promises": []}.\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {'promises': result.get('promises', [])}
    except Exception as exc:
        logger.error('extract_promises_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/draft-analysis')
async def analyse_draft(req: DraftAnalysisRequest):
    """Analyse tone, empathy, and clarity of a draft message; suggest improvements."""
    try:
        contact_profile = await _fetch_contact_profile(req.contact_id, req.user_id)
        profile_context = ''
        if contact_profile.get('communication_style'):
            profile_context = (
                f"\nThe recipient's communication style: {contact_profile['communication_style']}"
            )

        prompt = (
            'You are an expert communication coach specialising in interpersonal messaging.\n\n'
            f'Analyse this draft WhatsApp message:{profile_context}\n\n'
            f'Draft:\n"""\n{req.draft_text}\n"""\n\n'
            'Return a JSON object with:\n'
            '- "tone": detected tone (e.g. assertive, passive, warm, cold, neutral)\n'
            '- "empathy_score": float 0.0–1.0 (1 = highly empathetic)\n'
            '- "clarity_score": float 0.0–1.0 (1 = crystal clear)\n'
            '- "suggestions": array of objects, each with:\n'
            '    - "type": "tone" | "empathy" | "clarity" | "length" | "other"\n'
            '    - "original": the specific phrase or sentence to improve (or null)\n'
            '    - "improved": a better alternative phrasing\n'
            '    - "reason": one sentence explaining why this change helps\n\n'
            'If the draft is already excellent, return an empty suggestions array.\n'
            'Respond ONLY with valid JSON.'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.4,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'tone': result.get('tone', ''),
            'empathy_score': result.get('empathy_score', 0.0),
            'clarity_score': result.get('clarity_score', 0.0),
            'suggestions': result.get('suggestions', []),
        }
    except Exception as exc:
        logger.error('analyse_draft_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/generate-proposal')
async def generate_proposal(req: ProposalRequest):
    """Generate a structured business proposal from conversation context."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            raise HTTPException(status_code=404, detail='No messages found for conversation')

        transcript = _format_transcript(messages)
        extra = f'\n\nAdditional context: {req.context_hint}' if req.context_hint else ''

        prompt = (
            'You are a professional business proposal writer.\n\n'
            'Based on the conversation below, generate a structured business proposal.\n'
            f'{extra}\n\n'
            'Return a JSON object with:\n'
            '- "title": proposal title\n'
            '- "sections": array of objects, each with:\n'
            '    - "heading": section heading\n'
            '    - "content": section body text (plain prose, 1-3 paragraphs)\n\n'
            'Typical sections: Executive Summary, Problem Statement, Proposed Solution, '
            'Deliverables, Timeline, Investment, Next Steps.\n'
            'Only include sections relevant to the conversation.\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.5,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'title': result.get('title', ''),
            'sections': result.get('sections', []),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error('generate_proposal_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/generate-quote')
async def generate_quote(req: QuoteRequest):
    """Generate a short price quote / estimate from conversation context."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            raise HTTPException(status_code=404, detail='No messages found for conversation')

        transcript = _format_transcript(messages)

        prompt = (
            'You are a pricing assistant.\n\n'
            'Based on the conversation below, generate a concise price quote or estimate.\n\n'
            f'Currency: {req.currency}\n\n'
            'Return a JSON object with:\n'
            '- "text": a 1-2 sentence natural-language summary of the quote\n'
            '- "items": array of objects, each with:\n'
            '    - "description": line item description\n'
            '    - "amount": numeric amount (no currency symbol)\n'
            '- "total": total numeric amount\n'
            f'- "currency": "{req.currency}"\n\n'
            'If insufficient pricing information is available, return a best-effort estimate '
            'with a note in "text" that it is indicative.\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'text': result.get('text', ''),
            'items': result.get('items', []),
            'total': result.get('total', 0),
            'currency': result.get('currency', req.currency),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error('generate_quote_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/crm-notes')
async def generate_crm_notes(req: ConversationRequest):
    """Generate structured CRM notes from conversation history."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=50)
        if not messages:
            return {
                'contact_updates': {},
                'deal_status': None,
                'next_steps': [],
                'key_facts': [],
            }

        transcript = _format_transcript(messages)

        prompt = (
            'You are a CRM specialist.\n\n'
            'Analyse this WhatsApp conversation and produce structured CRM notes.\n\n'
            'Return a JSON object with:\n'
            '- "contact_updates": object of field → value pairs to update on the contact record '
            '(e.g. {"job_title": "CEO", "company_name": "Acme Inc"}); only include fields '
            'explicitly mentioned in the conversation\n'
            '- "deal_status": short string describing the current deal/relationship stage, or null\n'
            '- "next_steps": array of short strings describing agreed next actions\n'
            '- "key_facts": array of important facts learned about the contact or opportunity\n\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Transcript:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'contact_updates': result.get('contact_updates', {}),
            'deal_status': result.get('deal_status'),
            'next_steps': result.get('next_steps', []),
            'key_facts': result.get('key_facts', []),
        }
    except Exception as exc:
        logger.error('generate_crm_notes_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/ask-ai')
async def ask_ai(req: AskAIRequest):
    """Free-form question about the conversation; returns answer and source message IDs."""
    try:
        messages = await _fetch_messages(req.conversation_id, req.user_id, limit=100)
        if not messages:
            return {'answer': 'No messages found in this conversation.', 'sources': []}

        # Build transcript with message IDs for source attribution
        lines = []
        for m in messages:
            direction = 'Me' if m['direction'] == 'outgoing' else (m.get('sender_name') or 'Contact')
            body = (m['body'] or '').strip()
            if body:
                lines.append(f"[{m['id']}] {direction}: {body}")
        transcript = '\n'.join(lines)

        prompt = (
            'You are a knowledgeable assistant with access to a WhatsApp conversation.\n\n'
            'Each message is prefixed with its ID in square brackets, e.g. [uuid] Me: hello.\n\n'
            'Answer the following question accurately and concisely based solely on the '
            'conversation content. At the end of your answer, list the message IDs that '
            'directly support your answer.\n\n'
            'Return a JSON object with:\n'
            '- "answer": your answer as plain text\n'
            '- "sources": array of message ID strings that support the answer\n\n'
            'Respond ONLY with valid JSON.\n\n'
            f'Question: {req.question}\n\n'
            f'Conversation:\n{transcript}'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        return {
            'answer': result.get('answer', ''),
            'sources': result.get('sources', []),
        }
    except Exception as exc:
        logger.error('ask_ai_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))
