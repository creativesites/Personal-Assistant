"""CV Studio — Rewrite-Only AI Assistant (see docs/CV_STUDIO_PLAN.md §6).
Every operation here is rewrite/reorganise/classify — never generate-from-
nothing. `CV_STUDIO_NEVER_INVENT_POLICY` is prepended to every call.

Deliberately a thin, stateless service — it doesn't read or write
career_profiles/career_cvs itself. The wizard (frontend) sends the current
field text, gets back a rewritten version or a clarifying question, and the
user decides whether to accept it — same "AI drafts, human approves" posture
as every other AI-touches-a-record feature in this codebase.
"""
from ..ai.client import get_ai_client
from ..ai.prompts import (
    CV_STUDIO_NEVER_INVENT_POLICY,
    REWRITE_CV_TEXT,
    SUGGEST_METRIC_PROMPT,
    SUGGEST_SKILL_GROUPING,
    REWRITE_OPERATION_INSTRUCTIONS,
)

_REWRITE_OPERATIONS = set(REWRITE_OPERATION_INSTRUCTIONS.keys()) | {'rewrite_for_industry'}


async def rewrite_text(user_id: str, text: str, operation: str, industry: str | None = None) -> str:
    if operation == 'rewrite_for_industry':
        instruction = f"Reframe the emphasis and vocabulary of this text for a {industry or 'general'} audience — do not change the underlying facts."
    else:
        instruction = REWRITE_OPERATION_INSTRUCTIONS.get(operation)
    if not instruction:
        raise ValueError(f'Unknown rewrite operation: {operation}')

    ai = get_ai_client()
    raw = await ai.complete_json([{
        'role': 'user',
        'content': REWRITE_CV_TEXT.format(policy=CV_STUDIO_NEVER_INVENT_POLICY, operation_instruction=instruction, text=text[:4000]),
    }], service='career', feature=f'cv_rewrite_{operation}', user_id=user_id)
    return raw.get('rewritten') or text


async def suggest_metric_prompt(user_id: str, text: str) -> str:
    ai = get_ai_client()
    raw = await ai.complete_json([{
        'role': 'user',
        'content': SUGGEST_METRIC_PROMPT.format(policy=CV_STUDIO_NEVER_INVENT_POLICY, text=text[:2000]),
    }], service='career', feature='cv_suggest_metric', user_id=user_id)
    return raw.get('question') or 'What specific number or scope would make this stronger?'


async def suggest_skill_grouping(user_id: str, skills: list[str]) -> list[dict]:
    if not skills:
        return []
    ai = get_ai_client()
    raw = await ai.complete_json([{
        'role': 'user',
        'content': SUGGEST_SKILL_GROUPING.format(policy=CV_STUDIO_NEVER_INVENT_POLICY, skills=', '.join(skills)),
    }], service='career', feature='cv_suggest_skill_grouping', user_id=user_id)
    groups = raw.get('groups') or []
    # Never trust the model to preserve every input skill — drop any group
    # entry that introduces a skill not in the original list.
    allowed = {s.lower() for s in skills}
    cleaned = []
    for g in groups:
        group_name = g.get('groupName')
        group_skills = [s for s in (g.get('skills') or []) if s.lower() in allowed]
        if group_name and group_skills:
            cleaned.append({'groupName': group_name, 'skills': group_skills})
    return cleaned
