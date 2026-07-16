"""
Business OS Phase E — the conversation-to-automation loop. See
docs/BUSINESS_OS_PLAN.md §15/§16 and, for the generalization below,
docs/BUSINESS_EVENTS_PLAN.md §5.

Converts detected business signals from a single message analysis pass —
a live order request (order_intent_mentioned), a product not in the
catalog (new_products_mentioned), a supplier not in the catalog
(suppliers_mentioned) — into ONE multi-action proposal an Inbox card can
render and the user approves in one tap, instead of several separate
chat-tag actions or several separate approval cards. Product name
resolution against the catalog follows the exact same discipline as
contact_products.py: an ambiguous or zero-match mention is dropped.

The `actions` list reuses the {type, params} shape the [ACTION: ...] chat-tag
system already uses (see chat-formatter.tsx) so the same per-type API calls
get reused client-side rather than inventing a second execution mechanism —
`create_deal`/`reserve_stock`/`create_product`/`create_supplier` are the
genuinely new types; `generate_document`/`reminder` are the ones the tag
system already knows how to execute.

Every new_products_mentioned/suppliers_mentioned detection also writes a
durable `business_events` row (see business_events.py) regardless of
whether it makes it into a bundle — that's the audit trail Studio's
"Zuri Noticed" feed reads from.
"""

import json
import structlog
from datetime import date, timedelta
from ..database import get_pool
from ..models import OrderIntentMention, NewProductMention, SupplierMention, CareerOpportunityMention
from ..queue import publish_event
from .business_events import BusinessEventService

log = structlog.get_logger()

_MIN_CONFIDENCE = 0.6

# Mirrors career_opportunities.category's DB CHECK (db/migrations/0078) —
# the LLM's own vocabulary (models.py's CareerOpportunityMention) includes
# "other" as an escape hatch that the DB constraint doesn't, so anything
# outside this set falls back to 'job' rather than failing the insert.
_CAREER_CATEGORIES = {
    'job', 'contract', 'consulting', 'investment', 'speaking', 'partnership',
    'collaboration', 'freelance', 'board_position', 'research', 'mentorship',
    'grant', 'scholarship', 'tender', 'supplier_opportunity', 'acquisition',
}

_business_events = BusinessEventService()


class ActionBundleService:
    async def detect_and_create(
        self, user_id: str, contact_id: str, conversation_id: str,
        message_id: str, mentions: list[OrderIntentMention],
        new_products: list[NewProductMention] | None = None,
        suppliers: list[SupplierMention] | None = None,
        career_opportunities: list[CareerOpportunityMention] | None = None,
    ) -> None:
        new_products = new_products or []
        suppliers = suppliers or []
        career_opportunities = career_opportunities or []
        if not mentions and not new_products and not suppliers and not career_opportunities:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            # A back-and-forth negotiation ("10 units" -> "actually make it
            # 8") shouldn't spam a fresh proposal per message — a pending
            # bundle from the last hour blocks a NEW bundle, but detections
            # below are still logged to business_events either way (the
            # audit trail is independent of whether a card gets created).
            existing = await conn.fetchrow(
                """SELECT id FROM action_bundles
                   WHERE user_id = $1 AND contact_id = $2 AND status = 'pending'
                     AND detected_at > NOW() - INTERVAL '60 minutes'""",
                user_id, contact_id,
            )

            event_ids: list[str] = []

            resolved_new_products = []
            for mention in new_products:
                if mention.confidence < _MIN_CONFIDENCE:
                    continue
                name = mention.name.strip()
                if not name:
                    continue
                # Skip if something with a very similar name already exists
                # in the catalog — this is meant to catch genuinely new
                # items, not re-propose something already recorded.
                dup = await conn.fetchrow(
                    "SELECT id FROM products WHERE user_id = $1 AND status != 'archived' AND name ILIKE $2 LIMIT 1",
                    user_id, f'%{name}%',
                )
                if dup:
                    continue
                event_id = await _business_events.record(
                    user_id, 'product_detected', contact_id=contact_id, conversation_id=conversation_id,
                    message_id=message_id, confidence=mention.confidence,
                    evidence=[mention.evidence] if mention.evidence else [],
                    payload={
                        'name': name, 'category': mention.category,
                        'estimatedPrice': mention.estimated_price, 'currency': mention.currency,
                        'isOneOff': mention.is_one_off,
                    },
                )
                event_ids.append(event_id)
                resolved_new_products.append({**mention.model_dump(), 'name': name, 'event_id': event_id})

            resolved_suppliers = []
            for mention in suppliers:
                if mention.confidence < _MIN_CONFIDENCE:
                    continue
                company = mention.company.strip()
                if not company:
                    continue
                dup = await conn.fetchrow(
                    "SELECT id FROM suppliers WHERE user_id = $1 AND company ILIKE $2 LIMIT 1",
                    user_id, f'%{company}%',
                )
                if dup:
                    continue
                event_id = await _business_events.record(
                    user_id, 'supplier_detected', contact_id=contact_id, conversation_id=conversation_id,
                    message_id=message_id, confidence=mention.confidence,
                    evidence=[mention.evidence] if mention.evidence else [],
                    payload={'company': company},
                )
                event_ids.append(event_id)
                resolved_suppliers.append({'company': company, 'confidence': mention.confidence, 'event_id': event_id})

            resolved_career_opportunities = []
            for mention in career_opportunities:
                if mention.confidence < _MIN_CONFIDENCE:
                    continue
                title = mention.title.strip()
                if not title:
                    continue
                # Same "don't re-propose something already recorded" discipline
                # as new_products/suppliers above — a pending/detected opportunity
                # with a very similar title for this user is treated as a dup.
                dup = await conn.fetchrow(
                    """SELECT id FROM career_opportunities
                       WHERE user_id = $1 AND status NOT IN ('rejected', 'withdrawn', 'archived')
                         AND title ILIKE $2 LIMIT 1""",
                    user_id, f'%{title}%',
                )
                if dup:
                    continue
                category = mention.category if mention.category in _CAREER_CATEGORIES else 'job'
                event_id = await _business_events.record(
                    user_id, 'career_opportunity_detected', contact_id=contact_id, conversation_id=conversation_id,
                    message_id=message_id, confidence=mention.confidence,
                    evidence=[mention.evidence] if mention.evidence else [],
                    payload={
                        'title': title, 'companyOrOrg': mention.company_or_org,
                        'category': category, 'isRemote': mention.is_remote,
                    },
                )
                event_ids.append(event_id)
                resolved_career_opportunities.append({
                    'title': title, 'company_or_org': mention.company_or_org,
                    'category': category, 'is_remote': mention.is_remote,
                    'confidence': mention.confidence, 'event_id': event_id,
                })

            resolved_items = []
            for mention in mentions:
                if mention.confidence < _MIN_CONFIDENCE:
                    continue
                name = mention.product_name.strip()
                if not name:
                    continue
                matches = await conn.fetch(
                    """SELECT id, name, available, minimum_stock FROM products
                       WHERE user_id = $1 AND status != 'archived' AND name ILIKE $2
                       LIMIT 2""",
                    user_id, f'%{name}%',
                )
                if len(matches) != 1:
                    continue
                product = matches[0]
                resolved_items.append({
                    'product_id': str(product['id']),
                    'product_name': product['name'],
                    'quantity': mention.quantity,
                    'available': product['available'],
                    'minimum_stock': product['minimum_stock'],
                    'confidence': mention.confidence,
                })

            if not resolved_items and not resolved_new_products and not resolved_suppliers and not resolved_career_opportunities:
                return
            if existing:
                log.info('action_bundle_deduped', user_id=user_id, contact_id=contact_id)
                return

            contact = await conn.fetchrow(
                """SELECT COALESCE(custom_name, display_name, phone_number, 'this contact') AS name
                   FROM contacts WHERE id = $1""",
                contact_id,
            )
            contact_name = contact['name'] if contact else 'this contact'

            actions = []
            summary_parts = []
            confidences = []
            evidence: list[str] = []

            for np in resolved_new_products:
                actions.append({
                    'type': 'create_product',
                    'params': [np['name'], np['category'] or '', str(np['estimated_price'] or ''), np['currency'] or ''],
                })
                confidences.append(np['confidence'])
                if np.get('evidence'):
                    evidence.append(np['evidence'])
            if resolved_new_products:
                names = ', '.join(p['name'] for p in resolved_new_products)
                summary_parts.append(f'Detected a new product not in your catalog: {names}')

            for sp in resolved_suppliers:
                actions.append({'type': 'create_supplier', 'params': [sp['company']]})
                confidences.append(sp['confidence'])
                if sp.get('evidence'):
                    evidence.append(sp['evidence'])
            if resolved_suppliers:
                names = ', '.join(s['company'] for s in resolved_suppliers)
                summary_parts.append(f'Detected a new supplier: {names}')

            for co in resolved_career_opportunities:
                actions.append({
                    'type': 'create_career_opportunity',
                    'params': [
                        contact_id, co['title'], co['company_or_org'] or '', co['category'],
                        '' if co['is_remote'] is None else str(co['is_remote']).lower(),
                    ],
                })
                confidences.append(co['confidence'])
                if co.get('evidence'):
                    evidence.append(co['evidence'])
            if resolved_career_opportunities:
                names = ', '.join(
                    f"{o['title']}" + (f" at {o['company_or_org']}" if o['company_or_org'] else '')
                    for o in resolved_career_opportunities
                )
                summary_parts.append(f'Detected a career opportunity: {names}')

            if resolved_items:
                item_summary = ', '.join(f"{i['quantity']}x {i['product_name']}" for i in resolved_items)
                order_summary = f'Detected a request for {item_summary} from {contact_name}'
                low_stock_items = [i for i in resolved_items if i['available'] - i['quantity'] <= i['minimum_stock']]
                if low_stock_items:
                    names = ', '.join(i['product_name'] for i in low_stock_items)
                    order_summary += f'. This order will bring {names} to or below the reorder point.'
                summary_parts.append(order_summary)
                confidences.extend(i['confidence'] for i in resolved_items)

                # Neural Layer Phase 6 (docs/NEURAL_LAYER_PLAN.md §4.9/§10) —
                # dependsOn indices turn this from a flat checklist into a
                # real sequence: reserve stock only after the deal exists,
                # draft the quotation only once every item is reserved, and
                # only remind once the quotation has actually been drafted.
                first = resolved_items[0]
                deal_index = len(actions)
                actions.append({
                    'type': 'create_deal',
                    'params': [contact_id, first['product_id'], first['product_name'], str(first['quantity'])],
                })
                reserve_indices = []
                for item in resolved_items:
                    actions.append({
                        'type': 'reserve_stock',
                        'params': [item['product_id'], item['product_name'], str(item['quantity'])],
                        'dependsOn': [deal_index],
                    })
                    reserve_indices.append(len(actions) - 1)
                brief = f'Quotation for {item_summary}, requested by {contact_name}'
                actions.append({'type': 'generate_document', 'params': ['quotation', contact_id, brief], 'dependsOn': reserve_indices})
                document_index = len(actions) - 1
                follow_up_date = (date.today() + timedelta(days=30)).isoformat()
                actions.append({
                    'type': 'reminder',
                    'params': [f'Follow up on {item_summary} order with {contact_name}', follow_up_date],
                    'dependsOn': [document_index],
                })

            summary = '. '.join(summary_parts)
            bundle_confidence = round(sum(confidences) / len(confidences), 2) if confidences else 0.5

            row = await conn.fetchrow(
                """INSERT INTO action_bundles (user_id, contact_id, conversation_id, summary, actions, confidence, evidence)
                   VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb) RETURNING id""",
                user_id, contact_id, conversation_id, summary, json.dumps(actions),
                bundle_confidence, json.dumps(evidence),
            )

        bundle_id = str(row['id'])
        if event_ids:
            await _business_events.mark_bundled(event_ids, bundle_id)
        log.info('action_bundle_created', user_id=user_id, contact_id=contact_id, bundle_id=bundle_id)
        await publish_event(
            f'bundle:ready:{user_id}',
            json.dumps({'bundleId': bundle_id, 'contactId': contact_id, 'summary': summary}),
        )
