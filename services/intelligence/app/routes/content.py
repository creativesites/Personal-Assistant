import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..ai.client import get_ai_client
from ..ai.model_router import get_active_model
from ..config import settings

router = APIRouter(prefix='/internal/content', tags=['content'])


class GenerateRequest(BaseModel):
    name: str
    description: str | None = None
    price: float | None = None
    currency: str | None = None


@router.post('/generate')
async def generate_content(body: GenerateRequest):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail='Product name is required')

    price_line = f'{body.currency or ""} {body.price}'.strip() if body.price is not None else 'not specified'
    product_summary = (
        f'Product: {body.name}\n'
        f'Description: {body.description or "not provided"}\n'
        f'Price: {price_line}'
    )

    model = await get_active_model('text') or settings.default_ai_model
    ai = get_ai_client()
    result = await ai.complete_json(
        [
            {
                'role': 'system',
                'content': (
                    'You are a marketing copywriter for small businesses selling on '
                    'Facebook, Instagram, TikTok and WhatsApp. Given a product, write '
                    'three pieces of content and return ONLY a JSON object with keys '
                    '"description", "caption", and "video_script":\n'
                    '- description: a compelling 2-3 sentence product listing description.\n'
                    '- caption: a short, punchy social media caption with 2-4 relevant hashtags.\n'
                    '- video_script: a 20-30 second talking-point script for a product reel, '
                    'as a numbered list of short beats.'
                ),
            },
            {'role': 'user', 'content': product_summary},
        ],
        model=model, service='studio', feature='content_generation',
    )

    for key in ('description', 'caption', 'video_script'):
        if not result.get(key):
            raise HTTPException(status_code=502, detail=f'Model did not return "{key}"')

    return {
        'description': result['description'],
        'caption': result['caption'],
        'videoScript': result['video_script'],
        'model': model,
    }


@router.post('/recommendations')
async def generate_recommendations(stats: dict):
    """`stats` is exactly the shape services/api's getCampaignStats() returns
    (summary/posts/products/postingTimes) — passed through as-is rather than
    a typed model so the prompt always reflects the same numbers the user
    sees on the Campaigns page, with no risk of the two drifting apart."""
    model = await get_active_model('text') or settings.default_ai_model
    ai = get_ai_client()
    result = await ai.complete_json(
        [
            {
                'role': 'system',
                'content': (
                    'You are a marketing analyst for a small business selling on social media '
                    'and WhatsApp. You will be given JSON data: sent social posts with their '
                    'attributed leads/sales, product-level lead/sale counts and conversion '
                    'rates, and which day-of-week/hour-of-day combinations produced the most '
                    'leads. Write 3-5 short, specific, actionable recommendations based only on '
                    'this data — no generic marketing advice. If a product or post has zero '
                    'leads, that is itself worth flagging. Return ONLY a JSON object: '
                    '{"recommendations": ["...", "..."]}'
                ),
            },
            {'role': 'user', 'content': json.dumps(stats)},
        ],
        model=model, service='studio', feature='content_recommendations',
    )

    recommendations = result.get('recommendations')
    if not isinstance(recommendations, list) or not recommendations:
        raise HTTPException(status_code=502, detail='Model did not return recommendations')

    return {'recommendations': [str(r) for r in recommendations], 'model': model}
