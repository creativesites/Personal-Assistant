"""Job Search OS §15.14 — Company Intelligence. Before applying, Zuri
researches a company via the same `web_search.py` (Tavily/SERP) client
every other Job Search OS piece already uses — no new search integration.
One synthesis call over the fetched results, explicitly instructed to
decline any claim it has zero evidence for (see `SYNTHESIZE_COMPANY_INTELLIGENCE`
in `ai/prompts.py`) rather than inventing a plausible-sounding culture/
process claim.

The "ghosting" signal (§15.13) is computed here too, but deliberately as
plain SQL over the user's own `career_opportunities`/`career_interviews`
history for this company — not an AI call, and not a claim about the
company in general, only about this user's own experience with it. Feeds
directly into the existing interview-patterns lookup
(`GET /api/career/interview-patterns`, Career & Growth Engine Phase 4) —
the Node route merges both into one response rather than the frontend
making two separate calls.
"""
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import SYNTHESIZE_COMPANY_INTELLIGENCE
from ..database import get_pool
from .web_search import get_web_search

log = structlog.get_logger()

_GHOSTING_STALL_DAYS = 21


async def _compute_ghosting_signal(user_id: str, company_name: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT status, updated_at,
                      EXISTS (SELECT 1 FROM career_interviews ci WHERE ci.career_opportunity_id = co.id) AS has_interview
               FROM career_opportunities co
               WHERE co.user_id = $1 AND co.company_or_org ILIKE $2""",
            user_id, f'%{company_name}%',
        )
    total = len(rows)
    if total == 0:
        return {'hasHistory': False, 'applicationCount': 0, 'likelyGhoster': False, 'note': None}

    stalled_no_interview = [
        r for r in rows
        if r['status'] == 'applied' and not r['has_interview']
    ]
    likely_ghoster = len(stalled_no_interview) > 0 and len(stalled_no_interview) == total
    note = None
    if likely_ghoster:
        note = f"Your {total} application(s) to this company have sat in 'applied' with no interview logged."
    elif total > 0:
        note = f"You've applied to this company {total} time(s) before."
    return {
        'hasHistory': True, 'applicationCount': total,
        'likelyGhoster': likely_ghoster, 'note': note,
    }


async def generate_company_intelligence(user_id: str, company_name: str) -> dict:
    web_search = get_web_search()
    ghosting = await _compute_ghosting_signal(user_id, company_name)

    queries = [
        f'{company_name} company culture reviews',
        f'{company_name} recent news',
        f'{company_name} interview process',
    ]
    result_blocks: list[str] = []
    for q in queries:
        try:
            results = await web_search.search(q, max_results=3)
        except Exception as exc:
            log.warning('company_intelligence_search_failed', query=q[:80], error=str(exc))
            continue
        for r in results:
            result_blocks.append(f'- {r.title}: {r.snippet}')

    if not result_blocks:
        return {
            'companyName': company_name, 'cultureNotes': None, 'recentNews': None,
            'interviewProcessNotes': None, 'sourceCount': 0, 'ghosting': ghosting,
        }

    ai = get_ai_client()
    try:
        synthesis = await ai.complete_json([{
            'role': 'user',
            'content': SYNTHESIZE_COMPANY_INTELLIGENCE.format(
                company_name=company_name, search_results='\n'.join(result_blocks[:20]),
            ),
        }], service='career', feature='company_intelligence', user_id=user_id)
    except Exception as exc:
        log.warning('company_intelligence_synthesis_failed', company=company_name, error=str(exc))
        synthesis = {}

    return {
        'companyName': company_name,
        'cultureNotes': synthesis.get('cultureNotes'),
        'recentNews': synthesis.get('recentNews'),
        'interviewProcessNotes': synthesis.get('interviewProcessNotes'),
        'sourceCount': synthesis.get('sourceCount') or 0,
        'ghosting': ghosting,
    }
