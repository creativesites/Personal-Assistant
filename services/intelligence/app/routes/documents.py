from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..ai.client import get_ai_client
from ..ai.prompts import DOCUMENT_QUALITY_CHECK
from ..database import get_pool
from ..services.document_generator import (
    chat_about_document,
    compute_document_insights,
    contact_display_name,
    generate_document_data,
    render_and_save,
    search_documents,
    summarize_content,
)
from ..services.document_packs import run_pack
from ..services.document_renderer import format_money

router = APIRouter(prefix='/internal/documents', tags=['documents'])


class RenderRequest(BaseModel):
    user_id: str


@router.post('/{document_id}/render')
async def render_document(document_id: str, body: RenderRequest):
    try:
        return await render_and_save(document_id, body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class GenerateRequest(BaseModel):
    user_id: str
    contact_id: str
    document_type: str
    instruction: str


@router.post('/generate')
async def generate(body: GenerateRequest):
    try:
        return await generate_document_data(body.user_id, body.contact_id, body.document_type, body.instruction)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class QualityCheckRequest(BaseModel):
    user_id: str


@router.post('/{document_id}/quality-check')
async def quality_check(document_id: str, body: QualityCheckRequest):
    """Advisory only (plan §15 Phase 2) — never blocks sending."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow('SELECT * FROM documents WHERE id = $1 AND user_id = $2', document_id, body.user_id)
        if not document:
            raise HTTPException(status_code=404, detail='Document not found')
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', body.user_id)
        contact = None
        if document['contact_id']:
            contact = await conn.fetchrow(
                'SELECT custom_name, display_name, phone_number FROM contacts WHERE id = $1', document['contact_id'],
            )

    structured = document['structured_data'] or {}
    prompt = DOCUMENT_QUALITY_CHECK.format(
        document_type=document['document_type'],
        user_name=user['user_name'] if user else 'User',
        contact_name=contact_display_name(dict(contact) if contact else None),
        content_summary=summarize_content(structured),
        notes=structured.get('notes') or 'none',
        terms=structured.get('terms') or 'none',
        total_display=format_money(document['total_cents'], document['currency']),
    )

    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='documents', feature='document_quality_check', user_id=body.user_id,
    )
    score = max(0, min(10, int(raw.get('score', 7) or 7)))

    return {'score': score, 'issues': raw.get('issues') or [], 'recommendation': raw.get('recommendation') or ''}


class ChatRequest(BaseModel):
    user_id: str
    instruction: str
    history: list[dict] = []


@router.post('/{document_id}/chat')
async def chat(document_id: str, body: ChatRequest):
    """Per-document AI Assistant (plan §12/§15 Phase 3)."""
    try:
        return await chat_about_document(document_id, body.user_id, body.instruction, body.history)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class SearchRequest(BaseModel):
    user_id: str
    query: str
    limit: int = 10


@router.post('/search')
async def search(body: SearchRequest):
    """Semantic search over documents (plan §15 Phase 4)."""
    results = await search_documents(body.user_id, body.query, body.limit)
    return {'results': results}


class InsightsRequest(BaseModel):
    user_id: str


@router.post('/insights')
async def insights(body: InsightsRequest):
    """AI Compares Documents / 'Sales-Analyst Mode' (plan §8/§15 Phase 4)."""
    return {'insights': await compute_document_insights(body.user_id)}


class PackRunRequest(BaseModel):
    user_id: str
    contact_id: str
    instruction: str = ''


@router.post('/packs/{pack_key}/run')
async def packs_run(pack_key: str, body: PackRunRequest):
    """Automatic Business Packs (plan §13/§15 Phase 4)."""
    try:
        return await run_pack(body.user_id, body.contact_id, pack_key, body.instruction)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
