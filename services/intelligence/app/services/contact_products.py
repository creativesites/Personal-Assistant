"""
Products & Services Integration — see docs/RELATIONSHIP_OS_PLAN.md §5.6.

Reuses the `products` catalog built for Zuri Marketing rather than a
parallel one. Name resolution against that catalog follows the exact same
discipline as connections.py's contact-name matching: an ambiguous or
zero-match mention is dropped rather than guessed at.

relation_type only ever strengthens, never regresses — a contact who
"asked about" a product and later "bought" it should read as purchased,
not flip back to interested if a later message vaguely re-mentions it.
"""

import structlog
from datetime import date, timedelta
from ..database import get_pool
from ..models import ProductMention

log = structlog.get_logger()

_RELATION_RANK = {'mentioned': 0, 'interested': 1, 'recommended': 2, 'quoted': 3, 'purchased': 4}


class ContactProductService:
    async def record_mentions(
        self, user_id: str, contact_id: str, message_id: str, mentions: list[ProductMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            for mention in mentions:
                relation_type = mention.relation_type
                if relation_type not in _RELATION_RANK:
                    continue
                name = mention.product_name.strip()
                if not name:
                    continue

                matches = await conn.fetch(
                    """SELECT id FROM products
                       WHERE user_id = $1 AND status != 'archived' AND name ILIKE $2
                       LIMIT 2""",
                    user_id, f'%{name}%',
                )
                if len(matches) != 1:
                    continue
                product_id = matches[0]['id']

                replacement_predicted_at = None
                if relation_type == 'purchased' and mention.replacement_interval_days:
                    replacement_predicted_at = date.today() + timedelta(days=mention.replacement_interval_days)

                existing = await conn.fetchrow(
                    """SELECT id, relation_type, quantity, source_message_ids
                       FROM contact_products WHERE user_id = $1 AND contact_id = $2 AND product_id = $3""",
                    user_id, contact_id, product_id,
                )

                if existing is None:
                    await conn.execute(
                        """INSERT INTO contact_products
                               (user_id, contact_id, product_id, relation_type, quantity,
                                replacement_predicted_at, source_message_ids)
                           VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                        user_id, contact_id, product_id, relation_type, mention.quantity,
                        replacement_predicted_at, [message_id],
                    )
                    log.info('contact_product_recorded', user_id=user_id, contact_id=contact_id, relation_type=relation_type)
                    continue

                new_rank = _RELATION_RANK[relation_type]
                old_rank = _RELATION_RANK.get(existing['relation_type'], 0)
                final_type = relation_type if new_rank >= old_rank else existing['relation_type']
                source_ids = list(existing['source_message_ids'] or []) + [message_id]

                await conn.execute(
                    """UPDATE contact_products SET
                           relation_type = $1,
                           quantity = GREATEST(quantity, $2),
                           replacement_predicted_at = COALESCE($3, replacement_predicted_at),
                           source_message_ids = $4,
                           updated_at = NOW()
                       WHERE id = $5""",
                    final_type, mention.quantity, replacement_predicted_at, source_ids, existing['id'],
                )
