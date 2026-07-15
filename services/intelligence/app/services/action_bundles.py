"""
Business OS Phase E — the conversation-to-automation loop. See
docs/BUSINESS_OS_PLAN.md §15/§16.

Converts a detected live order request (MessageAnalysis.order_intent_mentioned)
into a single multi-action proposal an Inbox card can render and the user
approves in one tap, instead of several separate chat-tag actions. Product
name resolution against the catalog follows the exact same discipline as
contact_products.py: an ambiguous or zero-match mention is dropped.

The `actions` list reuses the {type, params} shape the [ACTION: ...] chat-tag
system already uses (see chat-formatter.tsx) so the same per-type API calls
get reused client-side rather than inventing a second execution mechanism —
`create_deal` and `reserve_stock` are the two genuinely new types; the other
two (`generate_document`, `reminder`) are the exact ones the tag system
already knows how to execute.
"""

import json
import structlog
from datetime import date, timedelta
from ..database import get_pool
from ..models import OrderIntentMention
from ..queue import publish_event

log = structlog.get_logger()

_MIN_CONFIDENCE = 0.6


class ActionBundleService:
    async def detect_and_create(
        self, user_id: str, contact_id: str, conversation_id: str,
        message_id: str, mentions: list[OrderIntentMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            # A back-and-forth negotiation ("10 units" -> "actually make it
            # 8") shouldn't spam a fresh proposal per message — skip if this
            # contact already has a pending bundle from the last hour.
            existing = await conn.fetchrow(
                """SELECT id FROM action_bundles
                   WHERE user_id = $1 AND contact_id = $2 AND status = 'pending'
                     AND detected_at > NOW() - INTERVAL '60 minutes'""",
                user_id, contact_id,
            )
            if existing:
                log.info('action_bundle_deduped', user_id=user_id, contact_id=contact_id)
                return

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
                })

            if not resolved_items:
                return

            contact = await conn.fetchrow(
                """SELECT COALESCE(custom_name, display_name, phone_number, 'this contact') AS name
                   FROM contacts WHERE id = $1""",
                contact_id,
            )
            contact_name = contact['name'] if contact else 'this contact'
            item_summary = ', '.join(f"{i['quantity']}x {i['product_name']}" for i in resolved_items)

            summary = f'Detected a request for {item_summary} from {contact_name}'
            low_stock_items = [i for i in resolved_items if i['available'] - i['quantity'] <= i['minimum_stock']]
            if low_stock_items:
                names = ', '.join(i['product_name'] for i in low_stock_items)
                summary += f'. This order will bring {names} to or below the reorder point.'

            # Neural Layer Phase 6 (docs/NEURAL_LAYER_PLAN.md §4.9/§10) —
            # dependsOn indices turn this from a flat checklist into a real
            # sequence: reserve stock only after the deal exists, draft the
            # quotation only once every item is reserved, and only remind
            # once the quotation has actually been drafted. Additive to the
            # {type, params} shape Business OS Phase E shipped — a consumer
            # that ignores dependsOn still sees the exact same flat list.
            first = resolved_items[0]
            actions = [{
                'type': 'create_deal',
                'params': [contact_id, first['product_id'], first['product_name'], str(first['quantity'])],
            }]
            deal_index = 0
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

            row = await conn.fetchrow(
                """INSERT INTO action_bundles (user_id, contact_id, conversation_id, summary, actions)
                   VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id""",
                user_id, contact_id, conversation_id, summary, json.dumps(actions),
            )

        bundle_id = str(row['id'])
        log.info('action_bundle_created', user_id=user_id, contact_id=contact_id, bundle_id=bundle_id)
        await publish_event(
            f'bundle:ready:{user_id}',
            json.dumps({'bundleId': bundle_id, 'contactId': contact_id, 'summary': summary}),
        )
