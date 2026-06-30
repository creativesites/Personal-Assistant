"""
Vision AI routes — image and document analysis.
Prefix: /internal/vision
"""

import base64
import json
import os
import structlog
import litellm
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..config import settings
from ..database import get_pool

logger = structlog.get_logger()

router = APIRouter(prefix='/internal/vision', tags=['vision'])

# Media types the classifier can assign
MEDIA_TYPES = (
    'product',
    'damage',
    'receipt',
    'id_document',
    'food',
    'vehicle',
    'screenshot',
    'general',
)


# ─── Request model ─────────────────────────────────────────────────────────────

class VisionAnalyseRequest(BaseModel):
    user_id: str
    message_id: str
    media_url: str          # URL or local filesystem path
    mime_type: Optional[str] = None   # e.g. 'image/jpeg', 'image/png', 'application/pdf'


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mime_to_media_type(mime_type: Optional[str]) -> str:
    """Map a MIME type to a rough media_type hint for the prompt."""
    if not mime_type:
        return 'image'
    if 'pdf' in mime_type:
        return 'document'
    if 'video' in mime_type:
        return 'video'
    return 'image'


def _build_image_content(media_url: str, mime_type: Optional[str]) -> dict:
    """
    Build the image_url content block for LiteLLM vision.
    Handles both remote URLs and local file paths.
    """
    # If it looks like an HTTP(S) URL, pass as-is
    if media_url.startswith('http://') or media_url.startswith('https://'):
        return {
            'type': 'image_url',
            'image_url': {'url': media_url},
        }

    # Local file path — read and base64-encode
    if not os.path.exists(media_url):
        raise FileNotFoundError(f'Local media file not found: {media_url}')

    effective_mime = mime_type or 'image/jpeg'
    with open(media_url, 'rb') as fh:
        encoded = base64.b64encode(fh.read()).decode('utf-8')

    data_uri = f'data:{effective_mime};base64,{encoded}'
    return {
        'type': 'image_url',
        'image_url': {'url': data_uri},
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post('/analyse')
async def analyse_media(req: VisionAnalyseRequest):
    """
    Analyse an image or document with Gemini vision.
    Detects media_type, extracts text (OCR), labels, and structured data.
    Stores result in media_analyses table (upserts by message_id).
    """
    try:
        asset_type = _mime_to_media_type(req.mime_type)
        image_content = _build_image_content(req.media_url, req.mime_type)

        media_types_list = ', '.join(MEDIA_TYPES)

        prompt_text = (
            f'You are a multimodal AI analyst. Analyse this {asset_type}.\n\n'
            'Return a JSON object with:\n'
            f'- "media_type": one of [{media_types_list}] — pick the best fit\n'
            '- "labels": array of strings — objects, concepts, or entities visible/detected\n'
            '- "text_content": all readable text found in the image (OCR); empty string if none\n'
            '- "structured": structured extraction relevant to the media_type, e.g.:\n'
            '    receipt → {"vendor": "...", "date": "...", "items": [{"name":"","qty":1,"price":0}], "total": 0}\n'
            '    id_document → {"document_type": "...", "name": "...", "number": "..."}\n'
            '    product → {"name": "...", "brand": "...", "condition": "..."}\n'
            '    damage → {"severity": "low|medium|high", "affected_areas": [...]}\n'
            '    vehicle → {"make": "...", "model": "...", "color": "...", "plate": "..."}\n'
            '    For other types use an empty object {}\n'
            '- "summary": 1-2 sentence plain-English description of what this image shows\n'
            '- "confidence": float 0.0–1.0 representing your overall analysis confidence\n\n'
            'IMPORTANT: Respond ONLY with valid JSON. Do not include markdown fences.'
        )

        response = await litellm.acompletion(
            model=settings.default_ai_model,
            messages=[
                {
                    'role': 'user',
                    'content': [
                        image_content,
                        {'type': 'text', 'text': prompt_text},
                    ],
                }
            ],
            temperature=0.2,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)

        media_type = result.get('media_type', 'general')
        if media_type not in MEDIA_TYPES:
            media_type = 'general'

        labels = result.get('labels', [])
        text_content = result.get('text_content', '')
        structured = result.get('structured', {})
        summary = result.get('summary', '')
        confidence_raw = result.get('confidence', 0.8)
        # Clamp to [0,1]
        try:
            confidence = min(1.0, max(0.0, float(confidence_raw)))
        except (TypeError, ValueError):
            confidence = 0.8

        model_used = settings.default_ai_model

        # ── Persist to media_analyses ──────────────────────────────────────────
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO media_analyses
                    (message_id, media_type, labels, text_content, structured,
                     summary, confidence, model_used, analyzed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                ON CONFLICT (message_id) DO UPDATE SET
                    media_type   = EXCLUDED.media_type,
                    labels       = EXCLUDED.labels,
                    text_content = EXCLUDED.text_content,
                    structured   = EXCLUDED.structured,
                    summary      = EXCLUDED.summary,
                    confidence   = EXCLUDED.confidence,
                    model_used   = EXCLUDED.model_used,
                    analyzed_at  = NOW()
                """,
                req.message_id,
                media_type,
                json.dumps(labels),
                text_content,
                json.dumps(structured),
                summary,
                confidence,
                model_used,
            )

        logger.info(
            'vision_analyse_complete',
            message_id=req.message_id,
            media_type=media_type,
            confidence=confidence,
        )

        return {
            'media_type': media_type,
            'labels': labels,
            'text_content': text_content,
            'structured': structured,
            'summary': summary,
            'confidence': confidence,
        }

    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except json.JSONDecodeError as exc:
        logger.error('vision_json_parse_error', error=str(exc))
        raise HTTPException(status_code=500, detail=f'Failed to parse AI response: {exc}')
    except Exception as exc:
        logger.error('vision_analyse_error', error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))
