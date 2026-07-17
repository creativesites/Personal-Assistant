"""CV Studio — Job Matching + Tailored CVs (see docs/CV_STUDIO_PLAN.md §8, §11).

Job Matching (§11) reuses the exact cosine-similarity mechanism
resume_studio.py's match_resume_to_opportunities()/match_opportunity_to_resumes()
already established for the older whole-document Resume Studio flow, applied
here to a CV Studio career_cvs render instead of a `documents` row. Node
already owns every table career_cvs content lives in and already assembles
it (buildCvRenderData()/buildCvPlainText()) for the PDF render and CV Health
checks, so it passes the live CV text/skills in rather than this service
re-querying career_cvs/the nine entry tables itself.

Tailoring Suggestions (§8) is a rewrite-only sibling to cv_assistant.py:
CV_STUDIO_NEVER_INVENT_POLICY still applies — a suggestion may only propose
reordering/emphasising text already present in cv_text, never inventing a
new achievement or skill to close a gap.
"""
import numpy as np

from ..ai.client import get_ai_client
from ..ai.prompts import (
    CV_STUDIO_NEVER_INVENT_POLICY,
    EXTRACT_JOB_REQUIREMENTS,
    SUGGEST_CV_TAILORING,
)
from ..database import get_pool


async def _get_opportunity(user_id: str, opportunity_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        opportunity = await conn.fetchrow(
            'SELECT id, title, company_or_org, description FROM career_opportunities WHERE id = $1 AND user_id = $2',
            opportunity_id, user_id,
        )
    if not opportunity:
        raise ValueError('Opportunity not found')
    return dict(opportunity)


def _opportunity_text(opportunity: dict) -> str:
    return f"{opportunity['title']} at {opportunity['company_or_org'] or ''}: {opportunity['description'] or ''}"


async def compute_cv_opportunity_match(user_id: str, cv_text: str, cv_skills: list[str], opportunity_id: str) -> dict:
    opportunity = await _get_opportunity(user_id, opportunity_id)
    opp_text = _opportunity_text(opportunity)

    ai = get_ai_client()
    cv_vec = await ai.embed(cv_text[:2000], service='career', feature='cv_embedding', user_id=user_id)
    opp_vec = await ai.embed(opp_text[:2000], service='career', feature='opportunity_embedding', user_id=user_id)
    if cv_vec is None or opp_vec is None:
        raise ValueError('Could not compute an embedding — try again shortly')
    cv_vec = np.array(cv_vec, dtype=np.float32)
    opp_vec = np.array(opp_vec, dtype=np.float32)
    denom = (np.linalg.norm(cv_vec) * np.linalg.norm(opp_vec)) or 1.0
    cosine = float(np.dot(cv_vec, opp_vec) / denom)
    match_score = round(max(0.0, min(1.0, cosine)) * 100)

    raw = await ai.complete_json([{
        'role': 'user',
        'content': EXTRACT_JOB_REQUIREMENTS.format(description=opp_text[:3000]),
    }], service='career', feature='cv_match_extract_requirements', user_id=user_id)
    required_skills = [s for s in (raw.get('requiredSkills') or []) if isinstance(s, str)]

    cv_skills_lower = [s.lower() for s in cv_skills if isinstance(s, str)]
    missing_skills = [
        s for s in required_skills
        if not any(s.lower() in cs or cs in s.lower() for cs in cv_skills_lower)
    ]

    return {'matchScore': match_score, 'requiredSkills': required_skills, 'missingSkills': missing_skills}


async def generate_tailoring_suggestions(user_id: str, cv_text: str, opportunity_id: str) -> dict:
    opportunity = await _get_opportunity(user_id, opportunity_id)
    opp_text = _opportunity_text(opportunity)

    ai = get_ai_client()
    raw = await ai.complete_json([{
        'role': 'user',
        'content': SUGGEST_CV_TAILORING.format(
            policy=CV_STUDIO_NEVER_INVENT_POLICY, cv_text=cv_text[:4000], opportunity_text=opp_text[:2000],
        ),
    }], service='career', feature='cv_tailoring_suggestions', user_id=user_id)
    suggestions = raw.get('suggestions') or []
    return {'suggestions': [s for s in suggestions if isinstance(s, dict) and s.get('detail')]}
