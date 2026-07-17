import base64

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.resume_studio import (
    create_resume_document,
    generate_cover_letter_data,
    generate_resume_data,
    match_resume_to_opportunities,
    score_and_store_upload,
    score_resume_text,
)

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
