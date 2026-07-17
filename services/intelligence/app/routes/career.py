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
    score_resume_text,
)
from ..services.career_networking import generate_introduction_draft
from ..services.company_intelligence import generate_company_intelligence
from ..services.cv_assistant import rewrite_text, suggest_metric_prompt, suggest_skill_grouping
from ..services.cv_matching import compute_cv_opportunity_match, generate_tailoring_suggestions

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
