"""
Retrieval Service — the single place that knows how to fetch "what does
Zuri already know about this person/business/relationship." Replaces the
duplicated ad-hoc context-building queries that used to live separately in
reply_gen.py, agent_engine.py, proactive.py, and clock_engine.py.

This centralizes *fetching*, not prompt-string formatting — each caller
still assembles its own prompt text from the returned data, since a reply
draft, an autonomous-agent response, and a proactive nudge each need a
different shape of context. The format_* helpers below cover the framing
that genuinely is shared across callers (business facts, relationship
memory) so that text doesn't get reworded slightly differently in three
places.
"""

import structlog
from ..database import get_pool
from .conversation_memory import get_conversation_memory
from ..services.business_facts import BusinessFactService
from ..services.agent_memory import AgentMemoryService
from ..services.knowledge_retriever import retrieve_relevant_chunks

log = structlog.get_logger()

_business_facts = BusinessFactService()
_agent_memory = AgentMemoryService()

_DEFAULT_CONTACT_SUMMARY = {
    'contact_name': 'Contact',
    'relationship_type': 'acquaintance',
    'personality_summary': None,
    'current_life_context': None,
    'communication_style': None,
    'structured_attributes': {},
}

_DEFAULT_RELATIONSHIP_MEMORY = {
    'outstanding_promises': [],
    'missed_followups_count': 0,
    'conversation_themes': [],
    'important_dates': [],
    'shared_history_since': None,
}


async def get_contact_summary(user_id: str, contact_id: str) -> dict:
    """Contact name, relationship type, and AI-generated profile fields in one round-trip."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COALESCE(c.custom_name, c.display_name, c.phone_number, 'Unknown') AS contact_name,
                r.relationship_type,
                cp.personality_summary, cp.current_life_context, cp.communication_style,
                cp.structured_attributes
            FROM contacts c
            LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = $2
            LEFT JOIN contact_profiles cp ON cp.contact_id = c.id AND cp.user_id = $2
            WHERE c.id = $1
            """,
            contact_id, user_id,
        )
    if not row:
        return dict(_DEFAULT_CONTACT_SUMMARY)
    result = dict(row)
    result['relationship_type'] = result['relationship_type'] or 'acquaintance'
    result['structured_attributes'] = result['structured_attributes'] or {}
    return result


async def get_recent_messages(conversation_id: str, limit: int = 50) -> list[dict]:
    """Shared by routes/conversation.py's summarize/followup endpoints and
    services/advisor_companion.py's conversation-scoped turn (Advisor
    Companion Plan Phase 2) — one fetch, not three near-identical copies."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''SELECT m.sender_type, m.body, m.whatsapp_timestamp,
                      co.custom_name, co.display_name
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts co ON co.id = c.contact_id
               WHERE m.conversation_id = $1
                 AND m.is_deleted = false
                 AND m.body IS NOT NULL
                 AND m.message_type = 'text'
               ORDER BY m.whatsapp_timestamp DESC
               LIMIT $2''',
            conversation_id,
            limit,
        )
    return [dict(r) for r in reversed(rows)]


def format_transcript(messages: list[dict], contact_name: str = 'Contact') -> str:
    lines = []
    for m in messages:
        speaker = 'You' if m['sender_type'] == 'user' else contact_name
        lines.append(f'{speaker}: {m["body"]}')
    return '\n'.join(lines)


async def get_user_voice(user_id: str) -> dict:
    """User's display name plus voice/writing-style profile, if one exists yet."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1", user_id,
        )
        comm_row = await conn.fetchrow(
            'SELECT writing_style, common_phrases, formality_score'
            ' FROM user_communication_profiles WHERE user_id = $1',
            user_id,
        )
    return {
        'user_name': user_row['user_name'] if user_row else 'User',
        'writing_style': comm_row['writing_style'] if comm_row else None,
        'common_phrases': comm_row['common_phrases'] if comm_row else None,
        'formality_score': (
            float(comm_row['formality_score'])
            if comm_row and comm_row['formality_score'] is not None else None
        ),
    }


async def get_relationship_memory(user_id: str, contact_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT outstanding_promises, missed_followups_count, conversation_themes,
                   important_dates, shared_history_since
            FROM relationship_memory WHERE user_id = $1 AND contact_id = $2
            """,
            user_id, contact_id,
        )
    return dict(row) if row else dict(_DEFAULT_RELATIONSHIP_MEMORY)


async def get_business_facts(user_id: str, limit: int = 15) -> list[dict]:
    return await _business_facts.get_approved_facts(user_id, limit)


async def get_kb_chunks(
    user_id: str, query_text: str, agent_id: str | None = None, limit: int = 3,
) -> list[dict]:
    return await retrieve_relevant_chunks(user_id=user_id, agent_id=agent_id, query=query_text, limit=limit)


async def get_agent_memories(
    agent_id: str, contact_id: str | None, query_text: str, limit: int = 5,
) -> list[dict]:
    return await _agent_memory.retrieve(agent_id, contact_id, query_text, limit)


async def get_conversation_state(conversation_id: str) -> dict:
    return await get_conversation_memory(conversation_id)


# ── Shared formatting — used by more than one caller, kept consistent ──────

async def get_relevant_catalog(user_id: str, query: str | None = None, limit: int = 50) -> list[dict]:
    """Fetch active catalog items for a user, ordered by name."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, description, item_type, sku, brand, category,
                   selling_price, purchase_cost, margin, currency,
                   stock, available, reserved, minimum_stock,
                   warranty, tags, service_details
            FROM products
            WHERE user_id = $1 AND status = 'active'
            ORDER BY name ASC
            LIMIT $2
            """,
            user_id, limit,
        )
    return [dict(r) for r in rows]


def format_catalog_items(items: list[dict]) -> str:
    if not items:
        return ''
    lines = []
    for item in items:
        item_type = (item.get('item_type') or 'product').upper()
        name = item.get('name', 'Unknown')
        sku = item.get('sku')
        label = f'[{item_type}] {name}'
        if sku:
            label += f' (SKU: {sku})'
        parts = [label]
        price = item.get('selling_price')
        if price is not None:
            currency = item.get('currency') or 'ZMW'
            parts.append(f'Price: {currency} {float(price):,.2f}')
        available = item.get('available')
        if available is not None:
            parts.append(f'Stock: {available} available')
        desc = item.get('description')
        if desc:
            parts.append(f'Desc: {str(desc)[:100]}')
        warranty = item.get('warranty')
        if warranty:
            parts.append(f'Warranty: {warranty}')
        lines.append(' | '.join(parts))
    return '\n'.join(f'- {line}' for line in lines)


def format_business_facts(facts: list[dict]) -> str:
    if not facts:
        return ''
    return '\n'.join(f"- {f['fact_key']}: {f['fact_value']}" for f in facts)


# Business OS Phase D (docs/BUSINESS_OS_PLAN.md §9) — data-driven "customers
# who bought X also bought Y", derived from real contact_products purchase
# history rather than the manually-curated (and currently unused anywhere)
# products.cross_sell/upsell JSONB columns.
async def get_co_purchases(user_id: str, product_id: str, limit: int = 3) -> list[dict]:
    """Thin wrapper over the Knowledge Graph query layer (Neural Layer
    Phase 4, docs/NEURAL_LAYER_PLAN.md §4.5) — kept here so reply_gen.py's
    catalog-context call site doesn't need to know about ..neural."""
    from ..neural.knowledge_graph import co_purchasers
    return await co_purchasers(user_id, product_id, limit)


def find_mentioned_catalog_item(catalog_items: list[dict], message_body: str) -> dict | None:
    """Naive substring match — good enough to spot which catalog item a
    customer's message is about, same "filter if catalog is large" approach
    already used for the reply-generation catalog context (see
    docs/STUDIO_ERP_PLAN.md §4.1)."""
    body_lower = message_body.lower()
    for item in catalog_items:
        name = (item.get('name') or '').lower()
        if name and name in body_lower:
            return item
    return None



def format_relationship_memory(rel_mem: dict) -> str:
    lines = []
    if rel_mem.get('outstanding_promises'):
        promises = '; '.join(
            f"{p['made_by']} promised: {p['text']}" for p in rel_mem['outstanding_promises']
        )
        lines.append(f'Outstanding promises: {promises}')
    if rel_mem.get('missed_followups_count'):
        lines.append(f"Missed follow-ups so far: {rel_mem['missed_followups_count']}")
    if rel_mem.get('conversation_themes'):
        lines.append(f"Recurring topics: {', '.join(rel_mem['conversation_themes'])}")
    dated = [d for d in (rel_mem.get('important_dates') or []) if d.get('date')]
    if dated:
        dates_text = '; '.join(f"{d['title']} ({d['date']})" for d in dated)
        lines.append(f'Important dates: {dates_text}')
    return '\n'.join(lines)
