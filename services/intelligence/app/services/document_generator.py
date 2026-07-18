"""Business Workspace document generation — the Python-side counterpart to
services/api/src/routes/documents.ts's traditional-create path. Used by the
FastAPI routes (routes/documents.py) AND directly, in-process, by the
autonomous agent's create_document tool (agent_engine.py) — an agent
creating a quotation shouldn't require a self-HTTP-call back into this same
service. See docs/BUSINESS_WORKSPACE_PLAN.md §7/§15 Phase 3.
"""
import json
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import DOCUMENT_AI_SUMMARY, DOCUMENT_CHAT, DOCUMENT_INSIGHTS, GENERATE_DOCUMENT_DATA
from ..database import get_pool
from ..queue import get_queue

log = structlog.get_logger()

DOCUMENT_CATEGORY = {
    'quotation': 'sales', 'invoice': 'sales', 'proposal': 'sales', 'contract': 'legal',
    'service_agreement': 'legal', 'statement_of_work': 'legal', 'project_plan': 'operations',
    'resume': 'hr', 'cover_letter': 'hr', 'portfolio_page': 'hr',
}

# Was in document_renderer.py, alongside the Jinja2/Playwright rendering
# engine that lived there — rendering itself moved to services/api
# (@react-pdf/renderer), but this formatting helper is still needed here
# (summarize_document()) and by routes/documents.py's quality_check.
CURRENCY_SYMBOLS = {'ZMW': 'K', 'USD': '$', 'GBP': '£', 'EUR': '€', 'KES': 'KSh', 'BWP': 'P', 'NAD': 'N$'}


def format_money(cents: int, currency: str) -> str:
    symbol = CURRENCY_SYMBOLS.get(currency, currency + ' ')
    return f'{symbol}{cents / 100:,.2f}'


def contact_display_name(contact) -> str:
    if not contact:
        return 'Contact'
    return contact.get('custom_name') or contact.get('display_name') or contact.get('phone_number') or 'Contact'


def summarize_content(structured: dict) -> str:
    items = structured.get('items') or []
    if items:
        return ', '.join(f"{i.get('quantity', 1)}x {i.get('description', '')}" for i in items)
    sections = structured.get('sections') or []
    if sections:
        return '; '.join(s.get('heading', '') for s in sections)
    # resume/cover_letter shapes (Career & Growth Engine Phase 3) — no
    # items/sections, so summarize_document()'s fallback would otherwise
    # read as a broken "no items or sections" line for these document types.
    experience = structured.get('experience') or []
    if experience:
        return ', '.join(f"{e.get('title', '')} at {e.get('company', '')}" for e in experience[:3])
    body = structured.get('body')
    if body:
        return body[:200]
    raw_text = structured.get('rawText')
    if raw_text:
        return raw_text[:200]
    return 'no items or sections'


def compute_totals(items: list[dict]) -> tuple[list[dict], int, int, int, int]:
    subtotal_cents = discount_cents = tax_cents = 0
    computed = []
    for item in items:
        line_subtotal = round(item.get('quantity', 1) * item.get('unitPriceCents', 0))
        discount = round(line_subtotal * ((item.get('discountPct') or 0) / 100))
        after_discount = line_subtotal - discount
        tax = round(after_discount * ((item.get('taxPct') or 0) / 100))
        line_total = after_discount + tax
        subtotal_cents += line_subtotal
        discount_cents += discount
        tax_cents += tax
        computed.append({**item, 'lineTotalCents': line_total})
    total_cents = subtotal_cents - discount_cents + tax_cents
    return computed, subtotal_cents, discount_cents, tax_cents, total_cents


async def assign_document_number(user_id: str, document_type: str) -> str:
    pool = await get_pool()
    async with pool.acquire() as conn:
        profile = await conn.fetchrow('SELECT id FROM business_profiles WHERE user_id = $1', user_id)
        if not profile:
            await conn.execute('INSERT INTO business_profiles (user_id) VALUES ($1)', user_id)

        row = await conn.fetchrow(
            """WITH current AS (
                 SELECT COALESCE((numbering->$1->>'next')::int, 1) AS n,
                        COALESCE(numbering->$1->>'prefix', upper($1) || '-') AS prefix
                 FROM business_profiles WHERE user_id = $2
                 FOR UPDATE
               )
               UPDATE business_profiles
               SET numbering = jsonb_set(numbering, ARRAY[$1, 'next'], to_jsonb((SELECT n FROM current) + 1), true),
                   updated_at = NOW()
               WHERE user_id = $2
               RETURNING (SELECT prefix FROM current) AS prefix, (SELECT n FROM current) AS assigned""",
            document_type, user_id,
        )
    return f"{row['prefix']}{row['assigned']}"


async def generate_document_data(user_id: str, contact_id: str, document_type: str, instruction: str) -> dict:
    """AI's job stops at structured data (plan §4/§6) — contact resolution is
    the caller's responsibility (a picked contact_id, never free-text name
    matching)."""
    pool = await get_pool()

    async with pool.acquire() as conn:
        contact = await conn.fetchrow(
            'SELECT custom_name, display_name, phone_number, company, industry FROM contacts WHERE id = $1 AND user_id = $2',
            contact_id, user_id,
        )
        if not contact:
            raise ValueError('Contact not found')

        relationship = await conn.fetchrow(
            'SELECT relationship_type FROM relationships WHERE contact_id = $1 AND user_id = $2', contact_id, user_id,
        )
        business_profile = await conn.fetchrow('SELECT * FROM business_profiles WHERE user_id = $1', user_id)
        products = await conn.fetch(
            "SELECT id, name, price, currency FROM products WHERE user_id = $1 AND status = 'active' "
            "ORDER BY updated_at DESC LIMIT 40",
            user_id,
        )
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', user_id)

        # Pricing benchmark (plan §9) — reuses business_facts, so this reads
        # through the exact same store the periodic aggregation job writes.
        benchmark_key = f"pricing_benchmark_discount_{(contact['industry'] or 'general').lower().replace(' ', '_')}"
        benchmark = await conn.fetchrow(
            """SELECT fact_value FROM business_facts
               WHERE user_id = $1 AND fact_key = $2 AND is_active = TRUE AND is_approved = TRUE""",
            user_id, benchmark_key,
        )

    product_catalog = '\n'.join(f"{p['id']}: {p['name']} - {p['price']} {p['currency']}" for p in products)
    if not product_catalog:
        product_catalog = 'No products in catalog yet — use the description/price given in the instruction if any.'

    pricing_context = (
        f"Typical discount for this contact's industry ({contact['industry'] or 'general'}): {benchmark['fact_value']} "
        f"— a reference point only, not a rule."
        if benchmark else ''
    )

    prompt = GENERATE_DOCUMENT_DATA.format(
        user_name=user['user_name'] if user else 'User',
        document_type=document_type,
        contact_name=contact_display_name(dict(contact)),
        relationship_type=relationship['relationship_type'] if relationship else 'acquaintance',
        instruction=instruction,
        product_catalog=product_catalog,
        default_currency=business_profile['default_currency'] if business_profile else 'ZMW',
        default_tax_rate=business_profile['default_tax_rate'] if business_profile else 0,
        default_terms=(business_profile['default_terms'] if business_profile and business_profile['default_terms'] else 'none set'),
        pricing_context=pricing_context,
    )

    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='documents', feature='document_generation', user_id=user_id,
    )

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


async def create_document_row(
    user_id: str, contact_id: str, document_type: str, generated: dict, requested_by: str = 'user',
    agent_id: str | None = None,
) -> dict:
    """Inserts the documents row + writes AI Document Memory (plan §7). This
    is the Python-side equivalent of documents.ts's POST /ai-generate —
    used by the agent tool, which has no Node process to call into."""
    computed_items, subtotal_cents, discount_cents, tax_cents, total_cents = compute_totals(generated.get('items') or [])
    document_number = await assign_document_number(user_id, document_type)
    title = f"{document_type[0].upper()}{document_type[1:]} {document_number}"

    structured_data = {
        'items': computed_items,
        'sections': generated.get('sections') or [],
        'notes': generated.get('notes') or None,
        'terms': generated.get('terms') or None,
        'validUntil': generated.get('validUntil'),
        'dueDate': generated.get('dueDate'),
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO documents
                 (user_id, contact_id, agent_id, document_type, document_category, document_number, title,
                  status, structured_data, subtotal_cents, discount_cents, tax_cents, total_cents,
                  requested_by, ai_generated, ai_reasoning)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,true,$14)
               RETURNING *""",
            user_id, contact_id, agent_id, document_type, DOCUMENT_CATEGORY.get(document_type, 'sales'),
            document_number, title, json.dumps(structured_data), subtotal_cents, discount_cents, tax_cents,
            total_cents, requested_by, generated.get('reasoning') or None,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2::jsonb)",
            row['id'], {'aiGenerated': True, 'requestedBy': requested_by},
        )

        for insight in generated.get('insights') or []:
            key, value = insight.get('key'), insight.get('value')
            if not key or not value:
                continue
            await conn.execute(
                """INSERT INTO contact_insights
                     (contact_id, user_id, insight_key, insight_value, confidence, supporting_text, source, source_document_id)
                   VALUES ($1, $2, $3, $4, $5, $6, 'document', $7)""",
                contact_id, user_id, key, value, insight.get('confidence') or 0.6, None, row['id'],
            )

    return dict(row)


async def summarize_document(document_id: str, user_id: str) -> dict:
    """ai_summary/embedding computation, extracted from render_and_save()'s
    tail now that rendering itself lives in services/api (Node,
    @react-pdf/renderer) — this is purely structured_data-derived text, never
    the rendered PDF bytes, so it's unaffected by which engine renders the
    PDF. Called fire-and-forget by Node right after a successful render."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow('SELECT * FROM documents WHERE id = $1 AND user_id = $2', document_id, user_id)
        if not document:
            raise ValueError('Document not found')
        contact_dict = None
        if document['contact_id']:
            contact = await conn.fetchrow(
                'SELECT custom_name, display_name, phone_number, company, email, whatsapp_jid FROM contacts WHERE id = $1',
                document['contact_id'],
            )
            contact_dict = dict(contact) if contact else None

    structured = document['structured_data'] or {}

    ai_summary = None
    try:
        ai = get_ai_client()
        prompt = DOCUMENT_AI_SUMMARY.format(
            document_type=document['document_type'],
            user_name='the business owner',
            contact_name=contact_display_name(contact_dict),
            total_display=format_money(document['total_cents'], document['currency']),
            status=document['status'],
            content_summary=summarize_content(structured),
            notes=structured.get('notes') or 'none',
            reasoning_line=(f"Why generated: {document['ai_reasoning']}" if document['ai_reasoning'] else ''),
        )
        ai_summary = (await ai.complete_text(
            [{'role': 'user', 'content': prompt}],
            service='documents', feature='document_summary', user_id=user_id,
        )).strip()
    except Exception:
        ai_summary = None

    embedding_vec = None
    try:
        embedding_text = ' | '.join(filter(None, [
            document['title'], document['document_type'],
            contact_display_name(contact_dict), summarize_content(structured),
            structured.get('notes'), structured.get('terms'),
        ]))
        ai = get_ai_client()
        embedding_vec = await ai.embed(embedding_text[:2000], user_id=user_id)
    except Exception:
        embedding_vec = None

    async with pool.acquire() as conn:
        if embedding_vec is not None:
            import numpy as np
            await conn.execute(
                "UPDATE documents SET ai_summary = COALESCE($1, ai_summary), embedding = $2, updated_at = NOW() WHERE id = $3",
                ai_summary, np.array(embedding_vec, dtype=np.float32), document_id,
            )
        else:
            await conn.execute(
                "UPDATE documents SET ai_summary = COALESCE($1, ai_summary), updated_at = NOW() WHERE id = $2",
                ai_summary, document_id,
            )

    return {'aiSummary': ai_summary}


async def search_documents(user_id: str, query: str, limit: int = 10) -> list[dict]:
    """Semantic search over documents (plan §15 Phase 4) — same cosine-
    distance pattern already shipped for kb_chunks in knowledge_retriever.py.
    Falls back to a plain ILIKE search when embeddings are unavailable
    (no OPENAI_API_KEY configured), same fallback style as the KB retriever."""
    if not query.strip():
        return []

    ai = get_ai_client()
    try:
        query_embedding = await ai.embed(query[:2000], user_id=user_id)
    except Exception:
        query_embedding = None

    pool = await get_pool()
    if query_embedding is None:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT d.id, d.title, d.document_type, d.document_number, d.status,
                          COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
                   WHERE d.user_id = $1 AND d.status != 'archived'
                     AND (d.title ILIKE '%' || $2 || '%' OR d.structured_data->>'notes' ILIKE '%' || $2 || '%')
                   ORDER BY d.created_at DESC LIMIT $3""",
                user_id, query, limit,
            )
        return [{**dict(r), 'score': None} for r in rows]

    import numpy as np
    query_vec = np.array(query_embedding, dtype=np.float32)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT d.id, d.title, d.document_type, d.document_number, d.status,
                      COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                      1 - (d.embedding <-> $1) AS score
               FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
               WHERE d.user_id = $2 AND d.embedding IS NOT NULL AND d.status != 'archived'
               ORDER BY d.embedding <-> $1 LIMIT $3""",
            query_vec, user_id, limit,
        )
    return [dict(r) for r in rows]


async def compute_document_insights(user_id: str) -> list[str]:
    """AI Compares Documents / 'Sales-Analyst Mode' (plan §8/§15 Phase 4) —
    aggregated stats in, grounded suggestions out, mirroring
    /internal/content/recommendations's existing shape."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow('SELECT COALESCE(full_name, email) AS user_name FROM users WHERE id = $1', user_id)
        rows = await conn.fetch(
            """SELECT document_type, COALESCE(status, 'draft') AS status,
                      COUNT(*) AS count, AVG(total_cents) AS avg_total_cents
               FROM documents WHERE user_id = $1
               GROUP BY document_type, status ORDER BY document_type, status""",
            user_id,
        )
        industry_rows = await conn.fetch(
            """SELECT d.document_type, COALESCE(c.industry, 'unknown') AS industry,
                      COUNT(*) FILTER (WHERE d.status IN ('expired', 'rejected')) AS lost_count,
                      COUNT(*) AS total_count
               FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
               WHERE d.user_id = $1 AND d.document_type IN ('quotation', 'invoice', 'proposal')
               GROUP BY d.document_type, COALESCE(c.industry, 'unknown')
               HAVING COUNT(*) >= 3
               ORDER BY lost_count DESC""",
            user_id,
        )

    if not rows:
        return ["Not enough documents yet to spot patterns — generate a few quotations or invoices first."]

    stats_lines = [f"- {r['document_type']} / {r['status']}: {r['count']} document(s), avg total {int(r['avg_total_cents'] or 0)} cents" for r in rows]
    for r in industry_rows:
        rate = round(100 * r['lost_count'] / r['total_count']) if r['total_count'] else 0
        stats_lines.append(f"- {r['document_type']} to {r['industry']} contacts: {rate}% expired/rejected ({r['lost_count']}/{r['total_count']})")
    stats = '\n'.join(stats_lines)

    prompt = DOCUMENT_INSIGHTS.format(user_name=user['user_name'] if user else 'User', stats=stats)
    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='documents', feature='document_insights', user_id=user_id,
    )
    insights = raw.get('insights')
    if not isinstance(insights, list) or not insights:
        return ["Not enough variation in the data yet to draw a confident conclusion."]
    return [str(i) for i in insights]


async def send_document_whatsapp(document_id: str, user_id: str) -> dict:
    """Mirrors documents.ts's POST /:id/send — used when an autonomous/
    delegated agent is trusted to dispatch a document unattended (plan §15
    Phase 3). Kept in Python rather than proxied to services/api so the
    agent tool never makes a self-HTTP-call back into this service."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            """SELECT d.*, co.whatsapp_jid FROM documents d JOIN contacts co ON co.id = d.contact_id
               WHERE d.id = $1 AND d.user_id = $2""",
            document_id, user_id,
        )
        if not document:
            raise ValueError('Document not found or has no linked contact')
        if not document['storage_path']:
            raise ValueError('Generate the PDF before sending')

        preview = f"{document['title']} ({document['document_number']})"
        conv = await conn.fetchrow(
            """INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
               VALUES ($1, $2, $3, NOW(), $4)
               ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
                 last_message_at = NOW(), last_message_preview = $4, updated_at = NOW()
               RETURNING id""",
            user_id, document['contact_id'], document['whatsapp_jid'], preview,
        )

        import uuid
        from datetime import datetime, timezone
        now = datetime.now(tz=timezone.utc)
        temp_wa_id = f"direct-{uuid.uuid4()}"
        caption = f"{document['title']} — {document['document_number']}"

        msg = await conn.fetchrow(
            """INSERT INTO messages
                 (conversation_id, whatsapp_message_id, sender_type, message_type, body,
                  media_url, media_mime_type, whatsapp_timestamp)
               VALUES ($1, $2, 'user', 'document', $3, $4, 'application/pdf', $5)
               RETURNING id""",
            conv['id'], temp_wa_id, caption, f'/api/documents/{document_id}/pdf', now,
        )

        await conn.execute(
            "UPDATE documents SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1", document_id,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'sent', '{}'::jsonb)", document_id,
        )

    queue = get_queue('send.reply')
    await queue.add('send.reply', {
        'userId': user_id,
        'messageId': str(msg['id']),
        'suggestedReplyId': None,
        'recipientJid': document['whatsapp_jid'],
        'text': caption,
        'mediaPath': document['storage_path'],
        'mediaMimeType': 'application/pdf',
        'mediaFileName': f"{document['document_number']}.pdf",
    })

    return {'ok': True, 'conversationId': str(conv['id'])}


async def chat_about_document(document_id: str, user_id: str, instruction: str, history: list[dict]) -> dict:
    """Per-document AI Assistant (plan §12) — the same regenerate-with-
    instruction discipline already shipped for proactive_queue, scoped to a
    document and made multi-turn. Never edits the rendered PDF directly,
    only structured_data, which the caller re-renders."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow('SELECT * FROM documents WHERE id = $1 AND user_id = $2', document_id, user_id)
        if not document:
            raise ValueError('Document not found')

    structured = document['structured_data'] or {}
    history_text = '\n'.join(f"{h['role']}: {h['content']}" for h in history[-10:]) or '(no prior messages)'

    prompt = DOCUMENT_CHAT.format(
        document_type=document['document_type'],
        current_data=json.dumps(structured),
        history=history_text,
        instruction=instruction,
    )

    ai = get_ai_client()
    raw = await ai.complete_json(
        [{'role': 'user', 'content': prompt}],
        service='documents', feature='document_chat', user_id=user_id,
    )

    updated_items = raw.get('items')
    if updated_items is None:
        updated_items = structured.get('items') or []
    computed_items, subtotal_cents, discount_cents, tax_cents, total_cents = compute_totals(updated_items)

    new_structured = {
        **structured,
        'items': computed_items,
        'sections': raw.get('sections') if raw.get('sections') is not None else structured.get('sections') or [],
        'notes': raw.get('notes') if raw.get('notes') is not None else structured.get('notes'),
        'terms': raw.get('terms') if raw.get('terms') is not None else structured.get('terms'),
    }

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE documents SET structured_data = $1::jsonb, subtotal_cents = $2, discount_cents = $3,
                 tax_cents = $4, total_cents = $5, updated_at = NOW() WHERE id = $6""",
            new_structured, subtotal_cents, discount_cents, tax_cents, total_cents, document_id,
        )
        await conn.execute(
            "INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'edited', $2::jsonb)",
            document_id, {'viaChat': True},
        )

    return {'reply': raw.get('reply') or 'Updated.', 'structuredData': new_structured, 'totalCents': total_cents}
