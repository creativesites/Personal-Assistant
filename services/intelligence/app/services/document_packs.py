"""Automatic Business Packs (plan §13/§15 Phase 4) — pack *definitions* are
code constants (mirroring how lookup-table constants already live in this
codebase rather than a DB-editable config), deliberately, to avoid shipping
a generic pack-authoring tool before there's usage data on which packs
people actually want.

- New Customer Sales Pack: quotation + proposal + a drafted follow-up.
- Renewal Pack: renewal quotation pre-filled from the prior accepted/paid
  invoice (a deterministic clone, like the /convert route — not a fresh AI
  generation, since the whole point is reusing what was already agreed) +
  a drafted reminder.
- Project Kickoff Pack: service agreement + project plan + a proactive_queue
  follow-up task.
"""
import json
import structlog

from ..database import get_pool
from .document_generator import (
    assign_document_number, contact_display_name, create_document_row, generate_document_data,
)
from .document_render_client import render_document

log = structlog.get_logger()

RENEWAL_PACK_KEY = 'renewal_pack'

PACKS = {
    'new_customer_sales_pack': {
        'label': 'New Customer Sales Pack',
        'document_types': ['quotation', 'proposal'],
        'followup_title': 'Follow up on new customer pack',
        'followup_body': "{contact_name}'s quotation and proposal are ready — check in once they've had time to review.",
        'followup_draft': "Hi {contact_name}, just checking in on the quotation and proposal I sent over — happy to answer any questions.",
    },
    'project_kickoff_pack': {
        'label': 'Project Kickoff Pack',
        'document_types': ['service_agreement', 'project_plan'],
        'followup_title': 'Follow up on project kickoff pack',
        'followup_body': "{contact_name}'s contract and project plan are ready — confirm they're happy to proceed.",
        'followup_draft': "Hi {contact_name}, sending over the service agreement and project plan to kick things off — let me know if anything needs adjusting.",
    },
}


async def run_pack(user_id: str, contact_id: str, pack_key: str, instruction: str) -> dict:
    if pack_key == RENEWAL_PACK_KEY:
        return await _run_renewal_pack(user_id, contact_id)

    pack = PACKS.get(pack_key)
    if not pack:
        raise ValueError(f'Unknown pack: {pack_key}')

    document_ids = []
    for document_type in pack['document_types']:
        generated = await generate_document_data(user_id, contact_id, document_type, instruction)
        doc = await create_document_row(user_id, contact_id, document_type, generated, requested_by='user')
        await render_document(doc['id'], user_id)
        document_ids.append(str(doc['id']))

    await _record_pack_run(user_id, contact_id, pack_key, document_ids)
    contact_name = await _get_contact_name(contact_id)
    await _insert_followup(
        user_id, contact_id,
        title=pack['followup_title'],
        body=pack['followup_body'].format(contact_name=contact_name),
        draft=pack['followup_draft'].format(contact_name=contact_name),
    )
    return {'packKey': pack_key, 'documentIds': document_ids}


async def _run_renewal_pack(user_id: str, contact_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        prior = await conn.fetchrow(
            """SELECT * FROM documents WHERE user_id = $1 AND contact_id = $2
               AND document_type = 'invoice' AND status IN ('paid', 'accepted')
               ORDER BY created_at DESC LIMIT 1""",
            user_id, contact_id,
        )
    if not prior:
        raise ValueError('No prior paid/accepted invoice found for this contact to renew from')

    document_number = await assign_document_number(user_id, 'quotation')
    title = f"Quotation {document_number}"

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO documents
                 (user_id, contact_id, document_type, document_category, document_number, title,
                  status, structured_data, currency, subtotal_cents, discount_cents, tax_cents, total_cents,
                  source_document_id, requested_by, ai_generated)
               VALUES ($1,$2,'quotation',$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12,'user',false)
               RETURNING *""",
            user_id, contact_id, prior['document_category'], document_number, title,
            json.dumps(prior['structured_data']), prior['currency'], prior['subtotal_cents'],
            prior['discount_cents'], prior['tax_cents'], prior['total_cents'], prior['id'],
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2::jsonb)",
            row['id'], json.dumps({'renewalOf': str(prior['id'])}),
        )

    await render_document(row['id'], user_id)
    document_ids = [str(row['id'])]
    await _record_pack_run(user_id, contact_id, RENEWAL_PACK_KEY, document_ids)

    contact_name = await _get_contact_name(contact_id)
    await _insert_followup(
        user_id, contact_id,
        title='Send renewal reminder',
        body=f"{contact_name}'s renewal quotation is ready, based on their last invoice.",
        draft=f"Hi {contact_name}, it's time to renew — I've put together a quotation based on what you had last time. Let me know if anything's changed.",
    )
    return {'packKey': RENEWAL_PACK_KEY, 'documentIds': document_ids}


async def _get_contact_name(contact_id: str) -> str:
    pool = await get_pool()
    async with pool.acquire() as conn:
        contact = await conn.fetchrow(
            'SELECT custom_name, display_name, phone_number FROM contacts WHERE id = $1', contact_id,
        )
    return contact_display_name(dict(contact) if contact else None)


async def _record_pack_run(user_id: str, contact_id: str, pack_key: str, document_ids: list[str]) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO document_pack_runs (user_id, contact_id, pack_key, document_ids) VALUES ($1, $2, $3, $4::jsonb)",
            user_id, contact_id, pack_key, json.dumps(document_ids),
        )


async def _insert_followup(user_id: str, contact_id: str, title: str, body: str, draft: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO proactive_queue
                 (user_id, contact_id, suggestion_type, title, body, draft_message, priority, status, suggested_for_date)
               VALUES ($1, $2, 'follow_up', $3, $4, $5, 3, 'pending', CURRENT_DATE + 3)""",
            user_id, contact_id, title, body, draft,
        )
