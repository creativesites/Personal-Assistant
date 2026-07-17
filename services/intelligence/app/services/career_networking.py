"""Career & Growth Engine Phase 6 — Relationship-to-Opportunity Bridge
(docs/CAREER_GROWTH_ENGINE_PLAN.md §7). The path-finding itself
(shortestIntroductionPath) lives in services/api/src/lib/knowledge-graph.ts
— it's a plain SQL BFS over tables Node already owns. This file is only
the one genuinely new AI call the bridge needs: drafting the introduction
request message itself, once Node has already worked out who to ask.
Deliberately read/suggest-only — Zuri never sends this on the user's
behalf.
"""
from ..ai.client import get_ai_client
from ..ai.prompts import DRAFT_INTRODUCTION_REQUEST
from ..database import get_pool


async def generate_introduction_draft(
    user_id: str, intermediary_name: str, target_name: str,
    opportunity_title: str, company_or_org: str | None,
) -> str:
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', user_id)

    prompt = DRAFT_INTRODUCTION_REQUEST.format(
        user_name=user['user_name'] if user else 'User',
        intermediary_name=intermediary_name,
        target_name=target_name,
        opportunity_title=opportunity_title,
        company_line=f' at {company_or_org}' if company_or_org else '',
    )
    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='career', feature='introduction_draft', user_id=user_id,
    )
    return raw.get('draft') or ''
