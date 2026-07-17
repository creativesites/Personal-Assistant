from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bullmq import Queue
from ..database import get_pool
from ..ai.client import get_ai_client
from ..queue import redis_conn_opts
from ..memory import retrieval_service as memory

studio_router = APIRouter(prefix='/internal/studio', tags=['studio'])

router = APIRouter(prefix='/internal/conversations', tags=['conversations'])

advisor_router = APIRouter(prefix='/internal/advisor', tags=['advisor'])


class AskRequest(BaseModel):
    user_id: str
    question: str
    session_id: Optional[str] = None


_get_recent_messages = memory.get_recent_messages
_format_transcript = memory.format_transcript


@router.post('/{conversation_id}/summarize')
async def summarize_conversation(conversation_id: str, user_id: str):
    messages = await _get_recent_messages(conversation_id, limit=60)
    if not messages:
        raise HTTPException(status_code=404, detail='No messages found')

    contact_name = (
        messages[0].get('custom_name')
        or messages[0].get('display_name')
        or 'Contact'
    )
    transcript = _format_transcript(messages, contact_name)

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                'You are a business intelligence assistant. Summarize this WhatsApp '
                'conversation concisely. Cover: key topics discussed, current state, '
                'open items, and clear next steps. Use short bullet points. '
                'Max 150 words.'
            ),
        },
        {'role': 'user', 'content': f'Summarize this conversation:\n\n{transcript}'},
    ], service='intelligence', feature='conversation_summary', user_id=user_id)

    return {'summary': result}


@router.post('/{conversation_id}/followup')
async def generate_followup(conversation_id: str, user_id: str):
    messages = await _get_recent_messages(conversation_id, limit=20)
    if not messages:
        raise HTTPException(status_code=404, detail='No messages found')

    contact_name = (
        messages[0].get('custom_name')
        or messages[0].get('display_name')
        or 'this person'
    )
    transcript = _format_transcript(messages, contact_name)

    ai = get_ai_client()
    result = await ai.complete_text([
        {
            'role': 'system',
            'content': (
                f'You are a WhatsApp messaging assistant. Write a natural, friendly '
                f'follow-up message to {contact_name} that picks up from where the '
                f'conversation left off. Be concise (1-3 sentences). '
                f'No formal salutations. No quotation marks. Return only the message text.'
            ),
        },
        {
            'role': 'user',
            'content': f'Generate a follow-up message based on this conversation:\n\n{transcript}',
        },
    ], service='intelligence', feature='conversation_followup', user_id=user_id)

    return {'followup': result.strip().strip('"').strip("'")}



ZURI_ACTION_INSTRUCTIONS = """
You can embed interactive CRM action tags in your response when directly relevant. Use only IDs explicitly provided in context. Available tags:

[ACTION: lead_score | <0-100> | <contact_id>]
[ACTION: pipeline_stage | <lead|prospect|qualified|proposal|negotiation|closed_won|closed_lost> | <contact_id>]
[ACTION: reply_draft | <contact_id> | <draft_message_text>]
[ACTION: reminder | <title> | <YYYY-MM-DD>]
[ACTION: generate_document | <quotation|invoice|proposal|contract|statement_of_work|service_agreement> | <contact_id> | <one-line brief>]
[ACTION: estimate_duration | <product_id>]
[ACTION: start_project | <product_id> | <contact_id>]

Rules:
- Only suggest one or two actions per response — don't overload.
- Always write clean Markdown: use **bold**, bullet lists (- item), and headers (## Header) when helpful.
- Never leave raw asterisks, loose formatting, or broken brackets.
- When drafting a WhatsApp message, write it naturally — no formal salutations, no quotation marks around the text.
- Only suggest generate_document when the user explicitly asks to create/draft a quotation, invoice, proposal, contract, statement of work, or service agreement, and only with a contact_id already given in context — never invent one.
- Use estimate_duration when the user asks how long a service/project will take — only with a product_id (service) already given in context.
- Use start_project only when the user explicitly asks to kick off / start a project for a service that's already been sold or agreed, and only with a product_id already given in context; contact_id is optional.
"""


async def _get_session_history(session_id: str) -> list[dict]:
    """Fetch the last 10 messages from an advisor session for conversation context."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''SELECT role, content FROM advisor_messages
               WHERE session_id = $1
               ORDER BY created_at ASC
               LIMIT 10''',
            session_id,
        )
    history = []
    for r in rows:
        role = 'user' if r['role'] == 'user' else 'assistant'
        history.append({'role': role, 'content': r['content']})
    return history


@router.post('/{conversation_id}/ask')
async def ask_ai(conversation_id: str, body: AskRequest):
    """Advisor Companion Plan Phase 2 (docs/ADVISOR_COMPANION_PLAN.md §9)
    — delegates to AdvisorCompanionService.handle_conversation_turn for
    the deep, scoped retrieval (relationship memory, contact profile,
    emotional context) and the evidence/my-read/alternative-read/what-
    I'd-do structured response for analysis-flavored intents."""
    from ..services.advisor_companion import get_advisor_companion_service
    return await get_advisor_companion_service().handle_conversation_turn(
        body.user_id, conversation_id, body.question, body.session_id,
    )


class AnalyseHistoryRequest(BaseModel):
    user_id: str
    contact_id: str
    recent_count: int = 30


@router.post('/{conversation_id}/analyse-history')
async def analyse_history(conversation_id: str, body: AnalyseHistoryRequest):
    """
    Called by the WhatsApp service after historical sync for one chat.
    Queues a contact profile rebuild and health recalculation based on
    the most recent messages — no per-message AI calls needed.
    """
    # Defensive group gate — the WhatsApp service already excludes group
    # conversations from calling this endpoint at all, but check again here
    # in case another caller is added later. See CLAUDE.md "Groups".
    pool = await get_pool()
    async with pool.acquire() as conn:
        contact_row = await conn.fetchrow('SELECT is_group FROM contacts WHERE id = $1', body.contact_id)
    if contact_row and contact_row['is_group']:
        return {'queued': False, 'skipped': 'group_chat', 'conversationId': conversation_id}

    profile_queue = Queue('analysis.contact_profile', {'connection': redis_conn_opts()})
    temporal_queue = Queue('temporal.clock_check', {'connection': redis_conn_opts()})

    await profile_queue.add('historical_profile', {
        'contactId': body.contact_id,
        'userId': body.user_id,
        'conversationId': conversation_id,
        'recentCount': body.recent_count,
        'isHistorical': True,
    })
    await temporal_queue.add('cadence', {
        'contactId': body.contact_id,
        'userId': body.user_id,
    })

    return {'queued': True, 'conversationId': conversation_id}


class AdvisorAskRequest(BaseModel):
    user_id: str
    question: str
    session_id: Optional[str] = None


@advisor_router.post('/ask')
async def advisor_ask(body: AdvisorAskRequest):
    """Global advisor — answers questions about the user's full contact
    network. Advisor Companion Plan Phase 1 (docs/ADVISOR_COMPANION_PLAN.md
    §6.1) — delegates the full turn (intent classification, profile/
    memory/emotional-state retrieval, dynamic prompt assembly, memory
    suggestion) to AdvisorCompanionService rather than building it inline
    here; this route is intentionally thin now."""
    from ..services.advisor_companion import get_advisor_companion_service
    return await get_advisor_companion_service().handle_turn(body.user_id, body.question, body.session_id)


class StudioAskRequest(BaseModel):
    user_id: str
    question: str
    session_id: Optional[str] = None


@studio_router.post('/ask')
async def studio_ask(body: StudioAskRequest):
    """Business advisor — answers questions using real catalog, rules, supplier, and contact data.
    Delegates context assembly + the completion call to BusinessContextService
    (Platform Polish Phase 4, docs/PLATFORM_POLISH_PLAN.md §6.3 — the first
    surface migrated onto it), passing Studio's own supplier/low-stock/
    recent-contacts blocks and its `[ACTION: ...]` tag instructions as
    surface-specific additions rather than duplicating the shared
    catalog/facts/business-entity context assembly here."""
    from ..services.business_context_service import get_business_context_service

    pool = await get_pool()
    async with pool.acquire() as conn:
        supplier_rows = await conn.fetch(
            '''SELECT company, reliability_score, average_delivery_time,
                      outstanding_balance, payment_terms
               FROM suppliers WHERE user_id = $1 ORDER BY company ASC LIMIT 20''',
            body.user_id,
        )
        # Recent/active contacts — gives the advisor contact_ids so it can
        # suggest CRM/messaging actions (lead_score, reply_draft, generate_document, ...)
        # the same way the global Advisor's contact context does.
        contact_rows = await conn.fetch(
            '''SELECT co.id AS contact_id,
                      COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                      c.last_message_preview, c.last_message_at,
                      co.lead_score, co.pipeline_stage
               FROM conversations c
               JOIN contacts co ON co.id = c.contact_id
               WHERE c.user_id = $1 AND c.is_archived = false AND co.is_group = false
               ORDER BY c.last_message_at DESC NULLS LAST
               LIMIT 20''',
            body.user_id,
        )
        low_stock_rows = await conn.fetch(
            '''SELECT name, available, minimum_stock
               FROM products WHERE user_id = $1 AND available <= minimum_stock
               ORDER BY available ASC LIMIT 10''',
            body.user_id,
        )

    supplier_lines = []
    for s in supplier_rows:
        supplier_lines.append(
            f"- {s['company']}: reliability {s['reliability_score']}%, "
            f"delivery {s['average_delivery_time']} days, "
            f"outstanding balance {s['outstanding_balance']}"
        )
    suppliers_text = '\n'.join(supplier_lines) or 'No suppliers configured.'

    contact_lines = []
    for row in contact_rows:
        preview = (row['last_message_preview'] or '')[:80]
        contact_lines.append(
            f"- {row['contact_name']} (contact_id: {row['contact_id']}): "
            f"lead_score={row.get('lead_score') or 0}, stage={row.get('pipeline_stage') or 'unknown'}, "
            f"last: \"{preview}\""
        )
    contacts_text = '\n'.join(contact_lines) or 'No recent customer conversations found.'

    low_stock_lines = [
        f"- {r['name']}: {r['available']} available (reorder at {r['minimum_stock']})"
        for r in low_stock_rows
    ]
    low_stock_text = '\n'.join(low_stock_lines) or 'Nothing currently at or below its reorder point.'

    chat_history = []
    if body.session_id:
        chat_history = await _get_session_history(body.session_id)

    result = await get_business_context_service().answer(
        'studio', body.user_id, body.question, chat_history=chat_history,
        extra_context_blocks=[
            ('LOW / OUT OF STOCK', low_stock_text),
            ('SUPPLIERS', suppliers_text),
            ('RECENT CUSTOMER CONTACTS', contacts_text),
        ],
        system_suffix=ZURI_ACTION_INSTRUCTIONS,
    )
    return {'answer': result}
