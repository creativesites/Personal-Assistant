from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..ai.client import get_ai_client
from ..ai.model_router import get_active_model
from ..ai.prompts import GENERATE_GOAL_NEXT_STEP
from ..config import settings
from ..database import get_pool
from ..memory import retrieval_service as memory

router = APIRouter(prefix='/internal/goals', tags=['goals'])


class NextStepRequest(BaseModel):
    goalId: str
    userId: str


@router.post('/next-step')
async def generate_next_step(body: NextStepRequest):
    """Regenerates relationship_goals.ai_next_step — the same
    proactive-suggestion LLM call used everywhere else, given an explicit
    goal as context instead of generic "maintain relationship" framing
    (see docs/RELATIONSHIP_OS_PLAN.md §5.12). Changes the prompt, not the
    pipeline: this reuses the same context-building pattern clock_engine.py
    already uses (contact summary + relationship memory)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        goal = await conn.fetchrow(
            """SELECT g.id, g.goal_type, g.custom_label, g.target_date, g.contact_id,
                      COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                      COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
                      COALESCE(r.health_score, 70) AS health_score,
                      COALESCE(r.health_trend, 'stable') AS health_trend
               FROM relationship_goals g
               JOIN contacts co ON co.id = g.contact_id
               LEFT JOIN relationships r ON r.contact_id = g.contact_id AND r.user_id = g.user_id
               WHERE g.id = $1 AND g.user_id = $2""",
            body.goalId, body.userId,
        )
        if not goal:
            raise HTTPException(status_code=404, detail='Goal not found')

        user = await conn.fetchrow(
            "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1", body.userId,
        )

    contact_summary = await memory.get_contact_summary(body.userId, str(goal['contact_id']))
    rel_mem_text = memory.format_relationship_memory(
        await memory.get_relationship_memory(body.userId, str(goal['contact_id']))
    )
    context_parts = [contact_summary.get('personality_summary') or '', rel_mem_text]
    context = ('\n'.join(p for p in context_parts if p) or 'No prior context')[:500]

    target_date_line = f"Target date: {goal['target_date']}" if goal['target_date'] else 'No target date set.'

    prompt = GENERATE_GOAL_NEXT_STEP.format(
        user_name=user['name'] if user else 'User',
        contact_name=goal['contact_name'],
        goal_label=goal['custom_label'] or goal['goal_type'].replace('_', ' '),
        target_date_line=target_date_line,
        relationship_type=goal['relationship_type'],
        health_score=goal['health_score'],
        health_trend=goal['health_trend'],
        context=context,
    )

    model = await get_active_model('text') or settings.default_ai_model
    ai = get_ai_client()
    result = await ai.complete_json(
        [{'role': 'user', 'content': prompt}], model=model,
        service='intelligence', feature='goal_generation', user_id=body.userId,
    )
    next_step = result.get('next_step')
    if not next_step:
        raise HTTPException(status_code=502, detail='Model did not return a next step')

    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE relationship_goals SET ai_next_step = $1, updated_at = NOW() WHERE id = $2',
            next_step, body.goalId,
        )

    return {'aiNextStep': next_step, 'model': model}
