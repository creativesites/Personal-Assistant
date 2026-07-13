from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..ai.client import get_ai_client
from ..ai.prompts import DOCUMENT_AI_SUMMARY, DOCUMENT_QUALITY_CHECK, GENERATE_DOCUMENT_DATA
from ..database import get_pool
from ..services.document_renderer import format_money, render_document_pdf, storage_path_for

router = APIRouter(prefix='/internal/documents', tags=['documents'])


def _contact_display_name(contact) -> str:
    if not contact:
        return 'Contact'
    return contact.get('custom_name') or contact.get('display_name') or contact.get('phone_number') or 'Contact'


def _summarize_content(structured: dict) -> str:
    items = structured.get('items') or []
    if items:
        return ', '.join(f"{i.get('quantity', 1)}x {i.get('description', '')}" for i in items)
    sections = structured.get('sections') or []
    if sections:
        return '; '.join(s.get('heading', '') for s in sections)
    return 'no items or sections'


class RenderRequest(BaseModel):
    user_id: str


@router.post('/{document_id}/render')
async def render_document(document_id: str, body: RenderRequest):
    pool = await get_pool()

    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            'SELECT * FROM documents WHERE id = $1 AND user_id = $2', document_id, body.user_id,
        )
        if not document:
            raise HTTPException(status_code=404, detail='Document not found')

        business_profile = await conn.fetchrow(
            'SELECT * FROM business_profiles WHERE user_id = $1', body.user_id,
        )
        contact = None
        if document['contact_id']:
            contact = await conn.fetchrow(
                'SELECT custom_name, display_name, phone_number, company, email FROM contacts WHERE id = $1',
                document['contact_id'],
            )

        template = None
        if document['template_id']:
            template = await conn.fetchrow(
                'SELECT layout_key FROM document_templates WHERE id = $1', document['template_id'],
            )
        elif business_profile and business_profile['default_template_id']:
            template = await conn.fetchrow(
                'SELECT layout_key FROM document_templates WHERE id = $1', business_profile['default_template_id'],
            )
        layout_key = template['layout_key'] if template else 'minimal'

    business_profile_dict = dict(business_profile) if business_profile else {}
    contact_dict = dict(contact) if contact else None

    pdf_bytes = await render_document_pdf(dict(document), business_profile_dict, contact_dict, layout_key)

    path = storage_path_for(body.user_id, document_id)
    with open(path, 'wb') as f:
        f.write(pdf_bytes)

    new_status = 'generated' if document['status'] == 'draft' else document['status']

    # AI Summary (plan §6) — qualitative only, generated for every render
    # (manual or AI-created) so it's never gated on which creation path was
    # used. Best-effort: a summary failure shouldn't block the PDF existing.
    ai_summary = None
    try:
        structured = document['structured_data'] or {}
        ai = get_ai_client()
        prompt = DOCUMENT_AI_SUMMARY.format(
            document_type=document['document_type'],
            user_name='the business owner',
            contact_name=_contact_display_name(contact_dict),
            total_display=format_money(document['total_cents'], document['currency']),
            status=new_status,
            content_summary=_summarize_content(structured),
            notes=structured.get('notes') or 'none',
            reasoning_line=(f"Why generated: {document['ai_reasoning']}" if document['ai_reasoning'] else ''),
        )
        ai_summary = (await ai.complete_text([{'role': 'user', 'content': prompt}])).strip()
    except Exception:
        ai_summary = None

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE documents SET storage_path = $1, status = $2, ai_summary = COALESCE($3, ai_summary), updated_at = NOW() WHERE id = $4",
            path, new_status, ai_summary, document_id,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'generated', '{}'::jsonb)",
            document_id,
        )

    return {'id': document_id, 'status': new_status, 'storagePath': path, 'aiSummary': ai_summary}


class GenerateRequest(BaseModel):
    user_id: str
    contact_id: str
    document_type: str
    instruction: str


@router.post('/generate')
async def generate_document_data(body: GenerateRequest):
    """Conversational creation (plan §7) — AI's job stops at structured
    data; contact resolution is the caller's responsibility (a picked
    contact_id, not free-text name matching) so this never guesses who a
    document is for."""
    pool = await get_pool()

    async with pool.acquire() as conn:
        contact = await conn.fetchrow(
            'SELECT custom_name, display_name, phone_number, company FROM contacts WHERE id = $1 AND user_id = $2',
            body.contact_id, body.user_id,
        )
        if not contact:
            raise HTTPException(status_code=404, detail='Contact not found')

        relationship = await conn.fetchrow(
            'SELECT relationship_type FROM relationships WHERE contact_id = $1 AND user_id = $2',
            body.contact_id, body.user_id,
        )
        business_profile = await conn.fetchrow('SELECT * FROM business_profiles WHERE user_id = $1', body.user_id)
        products = await conn.fetch(
            "SELECT id, name, price, currency FROM products WHERE user_id = $1 AND status = 'active' "
            "ORDER BY updated_at DESC LIMIT 40",
            body.user_id,
        )
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', body.user_id)

    product_catalog = '\n'.join(f"{p['id']}: {p['name']} - {p['price']} {p['currency']}" for p in products)
    if not product_catalog:
        product_catalog = 'No products in catalog yet — use the description/price given in the instruction if any.'

    prompt = GENERATE_DOCUMENT_DATA.format(
        user_name=user['user_name'] if user else 'User',
        document_type=body.document_type,
        contact_name=_contact_display_name(dict(contact)),
        relationship_type=relationship['relationship_type'] if relationship else 'acquaintance',
        instruction=body.instruction,
        product_catalog=product_catalog,
        default_currency=business_profile['default_currency'] if business_profile else 'ZMW',
        default_tax_rate=business_profile['default_tax_rate'] if business_profile else 0,
        default_terms=(business_profile['default_terms'] if business_profile and business_profile['default_terms'] else 'none set'),
    )

    ai = get_ai_client()
    raw = await ai.complete_json([{'role': 'user', 'content': prompt}])

    # Never trust a productId the model invented — only ones from the catalog we sent it.
    catalog_ids = {str(p['id']) for p in products}
    items = []
    for item in (raw.get('items') or []):
        product_id = item.get('productId')
        if product_id and str(product_id) not in catalog_ids:
            product_id = None
        items.append({
            'productId': product_id,
            'description': item.get('description', ''),
            'quantity': item.get('quantity', 1),
            'unitPriceCents': int(item.get('unitPriceCents', 0) or 0),
            'discountPct': item.get('discountPct', 0) or 0,
            'taxPct': item.get('taxPct', 0) or 0,
        })

    return {
        'items': items,
        'sections': raw.get('sections') or [],
        'notes': raw.get('notes') or '',
        'terms': raw.get('terms') or '',
        'validUntil': raw.get('validUntil'),
        'dueDate': raw.get('dueDate'),
        'reasoning': raw.get('reasoning') or '',
        'insights': raw.get('insights') or [],
    }


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
        contact_name=_contact_display_name(dict(contact) if contact else None),
        content_summary=_summarize_content(structured),
        notes=structured.get('notes') or 'none',
        terms=structured.get('terms') or 'none',
        total_display=format_money(document['total_cents'], document['currency']),
    )

    ai = get_ai_client()
    raw = await ai.complete_json([{'role': 'user', 'content': prompt}])
    score = max(0, min(10, int(raw.get('score', 7) or 7)))

    return {'score': score, 'issues': raw.get('issues') or [], 'recommendation': raw.get('recommendation') or ''}
