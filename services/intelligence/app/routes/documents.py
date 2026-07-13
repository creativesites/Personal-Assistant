from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..database import get_pool
from ..services.document_renderer import render_document_pdf, storage_path_for

router = APIRouter(prefix='/internal/documents', tags=['documents'])


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

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE documents SET storage_path = $1, status = $2, updated_at = NOW() WHERE id = $3",
            path, new_status, document_id,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'generated', '{}'::jsonb)",
            document_id,
        )

    return {'id': document_id, 'status': new_status, 'storagePath': path}
