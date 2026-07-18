import base64

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.resume_studio import (
    create_resume_document,
    generate_cover_letter_data,
    generate_resume_data,
    match_opportunity_to_resumes,
    match_resume_to_opportunities,
    score_and_store_upload,
    score_existing_resume,
    score_resume_text,
)
from ..services.career_networking import generate_introduction_draft
from ..services.company_intelligence import generate_company_intelligence
from ..services.cv_assistant import rewrite_text, suggest_metric_prompt, suggest_skill_grouping
from ..services.cv_matching import compute_cv_opportunity_match, generate_tailoring_suggestions
from ..services.job_discovery import get_job_discovery

# Career & Growth Engine Phase 3 — AI Resume Studio (docs/CAREER_GROWTH_ENGINE_PLAN.md
# §8). Mirrors routes/documents.py's internal-route shape exactly — Node
# calls these over HTTP the same way it calls /internal/documents/generate.
router = APIRouter(prefix='/internal/career', tags=['career'])


class GenerateResumeRequest(BaseModel):
    user_id: str
    instruction: str
    title: str | None = None
    source_document_id: str | None = None


@router.post('/resume/generate')
async def generate_resume(body: GenerateResumeRequest):
    generated = await generate_resume_data(body.user_id, body.instruction)
    document = await create_resume_document(
        body.user_id, 'resume', generated, ai_generated=True,
        title=body.title, source_document_id=body.source_document_id,
    )
    return {'document': document}


class GenerateCoverLetterRequest(BaseModel):
    user_id: str
    career_opportunity_id: str
    instruction: str
    title: str | None = None


@router.post('/cover-letter/generate')
async def generate_cover_letter(body: GenerateCoverLetterRequest):
    try:
        generated = await generate_cover_letter_data(body.user_id, body.career_opportunity_id, body.instruction)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    document = await create_resume_document(
        body.user_id, 'cover_letter', generated, ai_generated=True, title=body.title,
    )
    return {'document': document}


class ScoreResumeTextRequest(BaseModel):
    user_id: str
    resume_text: str


@router.post('/resume/score')
async def score_resume(body: ScoreResumeTextRequest):
    return await score_resume_text(body.user_id, body.resume_text)


class UploadResumeRequest(BaseModel):
    user_id: str
    file_base64: str
    mime_type: str
    title: str | None = None


@router.post('/resume/upload')
async def upload_resume(body: UploadResumeRequest):
    try:
        file_bytes = base64.b64decode(body.file_base64)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid file_base64')
    try:
        return await score_and_store_upload(body.user_id, file_bytes, body.mime_type, body.title)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


class ScoreExistingResumeRequest(BaseModel):
    user_id: str


@router.post('/resume/{document_id}/score')
async def score_existing_resume_route(document_id: str, body: ScoreExistingResumeRequest):
    try:
        return await score_existing_resume(body.user_id, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class RunJobDiscoveryRequest(BaseModel):
    user_id: str
    # Career OS Living Companion redesign — Node creates the
    # career_job_discovery_runs row up front (it owns the daily-cap
    # bookkeeping and needs a runId to return to the client immediately,
    # before this potentially multi-minute call even starts), and passes the
    # id through so run_for_user() updates that same row instead of creating
    # a second one.
    run_id: str | None = None
    is_manual: bool = True


@router.post('/job-discovery/run')
async def run_job_discovery(body: RunJobDiscoveryRequest):
    """Job Search OS manual trigger — the daily 05:00 UTC cron
    (daily_worker.py's run_job_discovery_scheduler) calls
    JobDiscoveryService.run_for_all_users() at a fixed hour; this lets a user
    ask for a fresh run right now instead of waiting for the next cron tick.
    Node (career-job-discovery.ts) owns the daily 3-successful-runs cap —
    this endpoint just runs the same underlying per-user logic and reports
    what it found, raising on a real failure so Node knows not to count it.
    """
    opportunities_found = await get_job_discovery().run_for_user(
        body.user_id, run_id=body.run_id, is_manual=body.is_manual,
    )
    return {'opportunitiesFound': opportunities_found}


class MatchResumeRequest(BaseModel):
    user_id: str
    limit: int = 5


@router.post('/resume/{document_id}/match')
async def match_resume(document_id: str, body: MatchResumeRequest):
    try:
        return {'matches': await match_resume_to_opportunities(body.user_id, document_id, body.limit)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class IntroductionDraftRequest(BaseModel):
    user_id: str
    intermediary_name: str
    target_name: str
    opportunity_title: str
    company_or_org: str | None = None


@router.post('/introduction-draft')
async def introduction_draft(body: IntroductionDraftRequest):
    draft = await generate_introduction_draft(
        body.user_id, body.intermediary_name, body.target_name,
        body.opportunity_title, body.company_or_org,
    )
    return {'draft': draft}


class ResumeMatchForOpportunityRequest(BaseModel):
    user_id: str


@router.post('/opportunities/{opportunity_id}/resume-match')
async def opportunity_resume_match(opportunity_id: str, body: ResumeMatchForOpportunityRequest):
    """Job Search OS §15.11 — Auto CV Matching (opportunity->resumes)."""
    try:
        return await match_opportunity_to_resumes(body.user_id, opportunity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class CompanyIntelligenceRequest(BaseModel):
    user_id: str
    company_name: str


@router.post('/company-intelligence')
async def company_intelligence(body: CompanyIntelligenceRequest):
    """Job Search OS §15.14 — Company Intelligence."""
    return await generate_company_intelligence(body.user_id, body.company_name)


class CvRewriteRequest(BaseModel):
    user_id: str
    text: str
    operation: str
    industry: str | None = None


@router.post('/cv-assistant/rewrite')
async def cv_rewrite(body: CvRewriteRequest):
    """CV Studio §6 — rewrite-only AI Assistant."""
    try:
        rewritten = await rewrite_text(body.user_id, body.text, body.operation, body.industry)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {'rewritten': rewritten}


class CvSuggestMetricRequest(BaseModel):
    user_id: str
    text: str


@router.post('/cv-assistant/suggest-metric')
async def cv_suggest_metric(body: CvSuggestMetricRequest):
    return {'question': await suggest_metric_prompt(body.user_id, body.text)}


class CvSuggestSkillGroupingRequest(BaseModel):
    user_id: str
    skills: list[str]


@router.post('/cv-assistant/suggest-skill-grouping')
async def cv_suggest_skill_grouping(body: CvSuggestSkillGroupingRequest):
    return {'groups': await suggest_skill_grouping(body.user_id, body.skills)}


class CvMatchRequest(BaseModel):
    user_id: str
    cv_text: str
    cv_skills: list[str] = []


@router.post('/opportunities/{opportunity_id}/cv-match')
async def opportunity_cv_match(opportunity_id: str, body: CvMatchRequest):
    """CV Studio §11 — Job Matching for a career_cvs row. Node assembles the
    CV's live text/skills (it already owns those tables); this only computes
    the embedding match + required-skills diff."""
    try:
        return await compute_cv_opportunity_match(body.user_id, body.cv_text, body.cv_skills, opportunity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class CvTailoringSuggestionsRequest(BaseModel):
    user_id: str
    cv_text: str


@router.post('/opportunities/{opportunity_id}/tailoring-suggestions')
async def opportunity_tailoring_suggestions(opportunity_id: str, body: CvTailoringSuggestionsRequest):
    """CV Studio §8 — Tailored CVs suggestion generation."""
    try:
        return await generate_tailoring_suggestions(body.user_id, body.cv_text, opportunity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# CV Studio Phase 9 (§12, §13) — save a user-composed (never AI-invented-
# from-scratch) letter or supporting document. One shared route for all six
# new document types rather than six near-identical ones — the shape
# differs only in structured_data, which Node already assembled from real
# career_references/projects/user-drafted text before calling this.
_SAVEABLE_DOCUMENT_TYPES = {
    'cover_letter', 'application_letter', 'expression_of_interest',
    'personal_statement', 'motivation_letter', 'reference_sheet', 'portfolio_pdf',
}


class SaveCareerDocumentRequest(BaseModel):
    user_id: str
    document_type: str
    structured_data: dict
    title: str | None = None
    ai_generated: bool = False


@router.post('/documents/save')
async def save_career_document(body: SaveCareerDocumentRequest):
    if body.document_type not in _SAVEABLE_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f'Unsupported document_type: {body.document_type}')
    document = await create_resume_document(
        body.user_id, body.document_type, body.structured_data,
        ai_generated=body.ai_generated, title=body.title,
    )
    return {'document': document}


# ── Job Scraper internal endpoints ─────────────────────────────────────────

class ScraperRunRequest(BaseModel):
    sources: list[str] | None = None  # None = all; or ['gozambia', 'jobsearchzm', 'jobberman_zm']


@router.post('/job-scraper/run')
async def run_job_scraper(body: ScraperRunRequest):
    """On-demand scrape trigger — called by Node's career-job-discovery.ts
    when a user clicks "Fetch Jobs" and there are manual-run credits left.
    Runs in the background so the HTTP response is immediate; the discovery
    run that follows uses whatever is in the pool."""
    from ..services.job_scraper import run_all_scrapers
    import asyncio
    asyncio.create_task(run_all_scrapers())
    return {'ok': True, 'message': 'Scrape started in background'}


@router.get('/job-scraper/status')
async def scraper_status():
    """Recent scraper run summary — used by Node's diagnostics endpoint."""
    from ..database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT source, MAX(started_at) AS last_run, SUM(jobs_found) AS total_found,
                      SUM(jobs_new) AS total_new,
                      BOOL_OR(success) AS last_success
               FROM scraper_runs
               WHERE started_at > NOW() - INTERVAL '48 hours'
               GROUP BY source ORDER BY source""",
        )
        pool_row = await conn.fetchrow('SELECT COUNT(*) AS total FROM scraped_jobs WHERE expires_at > NOW()')
    return {
        'poolSize': pool_row['total'] if pool_row else 0,
        'sources': [
            {
                'source': r['source'],
                'lastRun': r['last_run'].isoformat() if r['last_run'] else None,
                'totalFound': r['total_found'],
                'totalNew': r['total_new'],
                'lastSuccess': r['last_success'],
            }
            for r in rows
        ],
    }
