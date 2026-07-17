"""Career & Growth Engine Phase 3 — AI Resume Studio (see
docs/CAREER_GROWTH_ENGINE_PLAN.md §8). Generation reuses the exact
conversational-instruction -> structured_data -> react-pdf-render pipeline
document_generator.py already established for Business Workspace, fed from
career_profiles instead of business_profiles — but resumes/cover letters
have a genuinely different structured_data shape (experience/education/
skills, no items/pricing), so this is a sibling service rather than a reuse
of generate_document_data()/create_document_row() themselves, which hard-code
the line-item/sections shape.

Resumes/cover letters are ordinary `documents` rows (document_type='resume'/
'cover_letter', contact_id NULL, document_category='hr') — version history,
semantic search, and the documents.embedding column are all reused verbatim,
no parallel storage.
"""
import io
import json
import os
import structlog

import numpy as np
import pdfplumber

from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_RESUME_DATA, GENERATE_COVER_LETTER_DATA, SCORE_RESUME
from ..config import settings
from ..database import get_pool
from .document_generator import assign_document_number

log = structlog.get_logger()

_MATCH_CANDIDATE_LIMIT = 20


def _storage_path_for(user_id: str, document_id: str) -> str:
    """Same doc_storage volume/path convention as services/api's
    storagePathFor() (services/api/src/lib/pdf/render.ts) — both containers
    mount the identical `doc_storage` volume at DOC_STORAGE_DIR (see
    docker-compose.prod.yml), so a path built here is readable by Node's
    /api/documents/:id/pdf route without any extra hand-off."""
    directory = os.path.join(settings.doc_storage_dir, user_id)
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f'{document_id}.pdf')


def extract_resume_text(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == 'application/pdf':
        pages = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ''
                if text.strip():
                    pages.append(text.strip())
        return '\n\n'.join(pages)
    # text/plain and anything else readable as UTF-8 text
    return file_bytes.decode('utf-8', errors='ignore')


async def _get_career_profile(user_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        profile = await conn.fetchrow('SELECT * FROM career_profiles WHERE user_id = $1', user_id)
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', user_id)
    return {'profile': dict(profile) if profile else {}, 'user_name': user['user_name'] if user else 'User'}


async def generate_resume_data(user_id: str, instruction: str) -> dict:
    ctx = await _get_career_profile(user_id)
    profile = ctx['profile']

    prompt = GENERATE_RESUME_DATA.format(
        user_name=ctx['user_name'],
        headline=profile.get('headline') or 'not set',
        summary=profile.get('summary') or 'not set',
        skills=json.dumps(profile.get('skills') or []),
        certifications=json.dumps(profile.get('certifications') or []),
        education=json.dumps(profile.get('education') or []),
        languages=json.dumps(profile.get('languages') or []),
        target_roles=', '.join(profile.get('target_roles') or []) or 'not set',
        instruction=instruction,
    )
    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='career', feature='resume_generation', user_id=user_id,
    )
    return {
        'headline': raw.get('headline') or profile.get('headline') or '',
        'summary': raw.get('summary') or '',
        'experience': raw.get('experience') or [],
        'education': raw.get('education') or [],
        'skills': raw.get('skills') or [],
        'certifications': raw.get('certifications') or [],
        'languages': raw.get('languages') or [],
    }


async def generate_cover_letter_data(user_id: str, career_opportunity_id: str, instruction: str) -> dict:
    ctx = await _get_career_profile(user_id)
    profile = ctx['profile']

    pool = await get_pool()
    async with pool.acquire() as conn:
        opportunity = await conn.fetchrow(
            'SELECT title, company_or_org, description FROM career_opportunities WHERE id = $1 AND user_id = $2',
            career_opportunity_id, user_id,
        )
    if not opportunity:
        raise ValueError('Career opportunity not found')

    prompt = GENERATE_COVER_LETTER_DATA.format(
        user_name=ctx['user_name'],
        summary=profile.get('summary') or 'not set',
        skills=json.dumps(profile.get('skills') or []),
        opportunity_title=opportunity['title'],
        company_or_org=opportunity['company_or_org'] or 'the company',
        opportunity_description=opportunity['description'] or 'not provided',
        instruction=instruction,
    )
    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='career', feature='cover_letter_generation', user_id=user_id,
    )
    return {
        'recipientName': raw.get('recipientName'),
        'companyName': raw.get('companyName') or opportunity['company_or_org'],
        'body': raw.get('body') or '',
        'signOff': raw.get('signOff') or f"Sincerely,\n{ctx['user_name']}",
    }


async def score_resume_text(user_id: str, resume_text: str) -> dict:
    prompt = SCORE_RESUME.format(resume_text=resume_text[:8000])
    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='career', feature='resume_scoring', user_id=user_id,
    )

    def clamp(v):
        try:
            return max(0, min(100, int(v)))
        except (TypeError, ValueError):
            return 0

    return {
        'atsCompatibility': clamp(raw.get('atsCompatibility')),
        'recruiterAppeal': clamp(raw.get('recruiterAppeal')),
        'technicalStrength': clamp(raw.get('technicalStrength')),
        'achievementFraming': clamp(raw.get('achievementFraming')),
        'formatting': clamp(raw.get('formatting')),
        'overallScore': clamp(raw.get('overallScore')),
        'suggestions': raw.get('suggestions') or [],
    }


_DOCUMENT_TYPE_LABELS = {
    'resume': 'Resume', 'cover_letter': 'Cover Letter', 'application_letter': 'Application Letter',
    'expression_of_interest': 'Expression of Interest', 'personal_statement': 'Personal Statement',
    'motivation_letter': 'Motivation Letter', 'reference_sheet': 'Reference Sheet', 'portfolio_pdf': 'Portfolio',
}


async def create_resume_document(
    user_id: str, document_type: str, structured_data: dict, ai_generated: bool,
    title: str | None = None, source_document_id: str | None = None,
    embedding: list[float] | None = None,
) -> dict:
    """Inserts a resume/cover_letter/CV Studio Phase 9 Supporting Document
    row. Deliberately not routed through document_generator.py's
    create_document_row() — that function's insert hard-codes the
    items/sections/subtotal shape this document type doesn't have.
    contact_id is NULL (these are about the user, not a contact) and
    document_category is 'hr', matching the pre-existing CHECK vocabulary
    from migration 0043 — no schema change needed there."""
    document_number = await assign_document_number(user_id, document_type)
    label = _DOCUMENT_TYPE_LABELS.get(document_type, document_type.replace('_', ' ').title())
    resolved_title = title or f'{label} {document_number}'

    pool = await get_pool()
    async with pool.acquire() as conn:
        version = 1
        if source_document_id:
            parent = await conn.fetchrow(
                'SELECT version FROM documents WHERE id = $1 AND user_id = $2', source_document_id, user_id,
            )
            if parent:
                version = (parent['version'] or 1) + 1

        row = await conn.fetchrow(
            """INSERT INTO documents
                 (user_id, contact_id, document_type, document_category, document_number, title,
                  status, structured_data, version, source_document_id, requested_by, ai_generated, embedding)
               VALUES ($1, NULL, $2, 'hr', $3, $4, 'draft', $5::jsonb, $6, $7, 'user', $8, $9)
               RETURNING *""",
            user_id, document_type, document_number, resolved_title, json.dumps(structured_data),
            version, source_document_id, ai_generated,
            np.array(embedding, dtype=np.float32) if embedding is not None else None,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2::jsonb)",
            row['id'], json.dumps({'aiGenerated': ai_generated}),
        )
    return dict(row)


async def score_and_store_upload(user_id: str, file_bytes: bytes, mime_type: str, title: str | None = None) -> dict:
    """Resume analysis (§8) — the uploaded PDF's own bytes are the storage
    artifact (no react-pdf re-render — that would discard the original
    formatting the person already chose), so the caller (career-documents.ts)
    writes storage_path directly after this returns the created row.

    Saving the upload and scoring it are deliberately decoupled: a transient
    AI failure (rate limit, provider outage, a malformed JSON response)
    used to lose the entire upload, since the whole function threw before
    anything was written. Now the document + original file are always saved
    first; scoring is best-effort on top, and score_existing_resume() below
    lets the caller retry it later without re-uploading."""
    resume_text = extract_resume_text(file_bytes, mime_type)
    if not resume_text.strip():
        raise ValueError('Could not extract any text from this file')

    score = None
    score_failed = False
    try:
        score = await score_resume_text(user_id, resume_text)
    except Exception:
        log.warning('resume_upload_scoring_failed', user_id=user_id)
        score_failed = True

    ai = get_ai_client()
    embedding = None
    try:
        embedding = await ai.embed(resume_text[:2000], service='career', feature='resume_embedding', user_id=user_id)
    except Exception:
        embedding = None

    document = await create_resume_document(
        user_id, 'resume',
        structured_data={'source': 'uploaded', 'rawText': resume_text, 'score': score},
        ai_generated=False, title=title, embedding=embedding,
    )

    # The uploaded PDF's own bytes are the storage artifact — no react-pdf
    # re-render, which would discard the formatting the person already chose.
    storage_path = _storage_path_for(user_id, str(document['id']))
    with open(storage_path, 'wb') as f:
        f.write(file_bytes)

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE documents SET storage_path = $1, status = 'generated', updated_at = NOW() WHERE id = $2 RETURNING *",
            storage_path, document['id'],
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'generated', '{}'::jsonb)",
            document['id'],
        )
    document = dict(row)

    return {'document': document, 'score': score, 'scoreFailed': score_failed}


async def score_existing_resume(user_id: str, document_id: str) -> dict:
    """On-demand (re)scoring for a resume that was uploaded without a score —
    either the initial upload's AI call failed, or a future feature adds
    resumes some other way that skips scoring. Re-uses the rawText already
    captured at upload time rather than re-extracting from the stored file."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT id, structured_data FROM documents WHERE id = $1 AND user_id = $2 AND document_type = 'resume'",
            document_id, user_id,
        )
        if not doc:
            raise ValueError('Resume not found')

        structured_data = dict(doc['structured_data'] or {})
        resume_text = structured_data.get('rawText')
        if not resume_text:
            raise ValueError('This resume has no extracted text to score — try re-uploading it')

        score = await score_resume_text(user_id, resume_text)
        structured_data['score'] = score

        row = await conn.fetchrow(
            "UPDATE documents SET structured_data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *",
            json.dumps(structured_data), document_id,
        )
    return {'document': dict(row), 'score': score}


async def match_resume_to_opportunities(user_id: str, document_id: str, limit: int = 5) -> list[dict]:
    """Embedding-based CV<->opportunity matching (§8) — reuses documents.
    embedding exactly as Business Workspace Phase 4 designed it for semantic
    document search, now with a second consumer. Opportunities have no
    embedding column of their own (a deliberate scope reduction — re-embeds
    each candidate's description per call, bounded to the most recent
    _MATCH_CANDIDATE_LIMIT non-terminal opportunities; worth a dedicated
    column if usage ever makes this a hot path)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            'SELECT id, structured_data, embedding FROM documents WHERE id = $1 AND user_id = $2 AND document_type = $3',
            document_id, user_id, 'resume',
        )
        if not document:
            raise ValueError('Resume not found')

        opportunities = await conn.fetch(
            """SELECT id, title, company_or_org, description FROM career_opportunities
               WHERE user_id = $1 AND status NOT IN ('rejected', 'withdrawn', 'archived')
               ORDER BY created_at DESC LIMIT $2""",
            user_id, _MATCH_CANDIDATE_LIMIT,
        )

    if not opportunities:
        return []

    ai = get_ai_client()
    resume_vec = document['embedding']
    if resume_vec is None:
        structured = document['structured_data'] or {}
        text = structured.get('rawText') or json.dumps(structured)
        resume_vec = await ai.embed(text[:2000], service='career', feature='resume_embedding', user_id=user_id)
        if resume_vec is None:
            raise ValueError('Could not compute a resume embedding — try again shortly')
        resume_vec = np.array(resume_vec, dtype=np.float32)
    else:
        resume_vec = np.array(resume_vec, dtype=np.float32)

    results = []
    for opp in opportunities:
        text = f"{opp['title']} at {opp['company_or_org'] or ''}: {opp['description'] or ''}"
        opp_vec = await ai.embed(text[:2000], service='career', feature='opportunity_embedding', user_id=user_id)
        if opp_vec is None:
            continue
        opp_vec = np.array(opp_vec, dtype=np.float32)
        denom = (np.linalg.norm(resume_vec) * np.linalg.norm(opp_vec)) or 1.0
        cosine = float(np.dot(resume_vec, opp_vec) / denom)
        results.append({
            'opportunityId': str(opp['id']),
            'title': opp['title'],
            'companyOrOrg': opp['company_or_org'],
            'matchScore': round(max(0.0, min(1.0, cosine)) * 100),
        })

    results.sort(key=lambda r: r['matchScore'], reverse=True)
    return results[:limit]


_TAILOR_SUGGESTION_THRESHOLD = 70


async def match_opportunity_to_resumes(user_id: str, opportunity_id: str) -> dict:
    """Job Search OS §15.11 — Auto CV Matching, the inverse direction of
    match_resume_to_opportunities() above (opportunity->resumes instead of
    resume->opportunities), same cosine-similarity mechanism reused rather
    than a second embedding scheme. When the best-matching resume scores
    below the threshold, the caller surfaces a "tailor a version" suggestion
    — never "generate fake experience" to close the gap (see plan §15.11's
    own explicit boundary)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        opportunity = await conn.fetchrow(
            'SELECT id, title, company_or_org, description FROM career_opportunities WHERE id = $1 AND user_id = $2',
            opportunity_id, user_id,
        )
        if not opportunity:
            raise ValueError('Opportunity not found')

        resumes = await conn.fetch(
            """SELECT id, title, embedding, structured_data FROM documents
               WHERE user_id = $1 AND document_type = 'resume'
               ORDER BY created_at DESC LIMIT 10""",
            user_id,
        )

    if not resumes:
        return {'hasResumes': False, 'matches': [], 'bestScore': None, 'suggestTailoring': False}

    ai = get_ai_client()
    opp_text = f"{opportunity['title']} at {opportunity['company_or_org'] or ''}: {opportunity['description'] or ''}"
    opp_vec = await ai.embed(opp_text[:2000], service='career', feature='opportunity_embedding', user_id=user_id)
    if opp_vec is None:
        raise ValueError('Could not compute an opportunity embedding — try again shortly')
    opp_vec = np.array(opp_vec, dtype=np.float32)

    results = []
    for resume in resumes:
        resume_vec = resume['embedding']
        if resume_vec is None:
            structured = resume['structured_data'] or {}
            text = structured.get('rawText') or json.dumps(structured)
            resume_vec = await ai.embed(text[:2000], service='career', feature='resume_embedding', user_id=user_id)
            if resume_vec is None:
                continue
        resume_vec = np.array(resume_vec, dtype=np.float32)
        denom = (np.linalg.norm(resume_vec) * np.linalg.norm(opp_vec)) or 1.0
        cosine = float(np.dot(resume_vec, opp_vec) / denom)
        results.append({
            'documentId': str(resume['id']),
            'title': resume['title'],
            'matchScore': round(max(0.0, min(1.0, cosine)) * 100),
        })

    results.sort(key=lambda r: r['matchScore'], reverse=True)
    best_score = results[0]['matchScore'] if results else None
    return {
        'hasResumes': True,
        'matches': results,
        'bestScore': best_score,
        'suggestTailoring': best_score is not None and best_score < _TAILOR_SUGGESTION_THRESHOLD,
    }
