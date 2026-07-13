from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_PROACTIVE_SUGGESTION
from ..database import get_pool
from ..memory import retrieval_service as memory

router = APIRouter(prefix='/internal/proactive', tags=['proactive'])

_VALID_TYPES = {
    'check_in', 'birthday_message', 'follow_up', 'congratulate',
    'condolence', 'reconnect', 'respond_to_event', 'relationship_maintenance',
}


class RegenerateRequest(BaseModel):
    user_id: str
    instruction: Optional[str] = None


@router.post('/{suggestion_id}/regenerate')
async def regenerate_suggestion(suggestion_id: str, body: RegenerateRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT
                 pq.contact_id,
                 COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                 COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
                 COALESCE(r.importance_tier, 3) AS importance_tier,
                 COALESCE(r.health_score, 50) AS health_score,
                 COALESCE(r.health_trend, 'stable') AS health_trend,
                 r.last_interaction_at,
                 u.full_name AS user_full_name, u.email AS user_email
               FROM proactive_queue pq
               JOIN contacts co ON co.id = pq.contact_id
               JOIN users u ON u.id = pq.user_id
               LEFT JOIN relationships r ON r.contact_id = pq.contact_id AND r.user_id = pq.user_id
               WHERE pq.id = $1 AND pq.user_id = $2""",
            suggestion_id, body.user_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail='Suggestion not found')

    contact_id = str(row['contact_id'])
    user_name = row['user_full_name'] or row['user_email'] or 'User'

    days_silent = None
    if row['last_interaction_at']:
        delta = datetime.now(tz=timezone.utc) - row['last_interaction_at'].replace(tzinfo=timezone.utc)
        days_silent = delta.days
    last_interaction = f"{days_silent} days ago" if days_silent is not None else 'unknown'

    async with pool.acquire() as conn:
        upcoming_rows = await conn.fetch(
            """SELECT title, event_date FROM events
               WHERE user_id = $1 AND contact_id = $2
                 AND (event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
                      OR (is_recurring = true AND
                          DATE_PART('doy', event_date) BETWEEN
                          DATE_PART('doy', CURRENT_DATE) AND
                          DATE_PART('doy', CURRENT_DATE) + 14))
               ORDER BY event_date ASC""",
            body.user_id, contact_id,
        )
    upcoming = [f"{e['title']} on {e['event_date']}" for e in upcoming_rows]

    contact_summary_data = await memory.get_contact_summary(body.user_id, contact_id)
    rel_mem_text = memory.format_relationship_memory(
        await memory.get_relationship_memory(body.user_id, contact_id)
    )
    context_parts = [
        contact_summary_data['personality_summary'] or '',
        contact_summary_data['current_life_context'] or '',
        rel_mem_text,
    ]
    context = '\n'.join(p for p in context_parts if p) or 'No recent context available'

    prompt = GENERATE_PROACTIVE_SUGGESTION.format(
        user_name=user_name,
        contact_name=row['contact_name'],
        relationship_type=row['relationship_type'],
        importance_tier=str(row['importance_tier']),
        health_score=row['health_score'],
        health_trend=row['health_trend'],
        last_interaction=last_interaction,
        upcoming_events=', '.join(upcoming) or 'none',
        context=context[:500],
    )
    if body.instruction and body.instruction.strip():
        prompt += f"\n\nThe user gave this specific instruction for this draft — follow it closely: \"{body.instruction.strip()}\""

    client = get_ai_client()
    raw = await client.complete_json([{'role': 'user', 'content': prompt}])

    stype = raw.get('suggestion_type', 'check_in')
    if stype not in _VALID_TYPES:
        stype = 'check_in'
    priority = max(1, min(5, int(raw.get('priority', 3))))
    title = raw.get('title', 'Check in')
    suggestion_body = raw.get('body', '')
    draft_message = raw.get('draft_message')

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE proactive_queue
               SET suggestion_type = $1::suggestion_type, title = $2, body = $3,
                   draft_message = $4, priority = $5, updated_at = NOW()
               WHERE id = $6 AND user_id = $7""",
            stype, title, suggestion_body, draft_message, priority,
            suggestion_id, body.user_id,
        )

    return {
        'id': suggestion_id,
        'suggestionType': stype,
        'title': title,
        'body': suggestion_body,
        'draftMessage': draft_message,
        'priority': priority,
    }
