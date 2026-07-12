"""
Life Events & Shared Interests — see docs/RELATIONSHIP_OS_PLAN.md §6.6.

The personal-tier analog of contact_products: personal relationships don't
have a product catalog, they have shared history. Mirrors
event_extractor.py's dedup-by-recent-window pattern rather than
business_facts.py's confidence accumulation, since a life event either
happened or didn't — there's nothing to reinforce, just avoid double-
logging the same event across nearby messages that both reference it.
"""

import structlog
from ..database import get_pool
from ..models import LifeEventMention

log = structlog.get_logger()

_VALID_TYPES = {
    'new_job', 'moved', 'had_child', 'got_married',
    'health_issue', 'loss', 'achievement', 'started_business',
}


class LifeEventService:
    async def record_mentions(
        self, user_id: str, contact_id: str, message_id: str, mentions: list[LifeEventMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            for mention in mentions:
                event_type = mention.event_type
                if event_type not in _VALID_TYPES:
                    continue
                title = mention.title.strip()
                if not title:
                    continue

                existing = await conn.fetchval(
                    """SELECT id FROM contact_life_events
                       WHERE contact_id = $1 AND user_id = $2 AND event_type = $3
                         AND title ILIKE $4
                         AND created_at > NOW() - INTERVAL '30 days'""",
                    contact_id, user_id, event_type, f'%{title[:50]}%',
                )
                if existing:
                    continue

                await conn.execute(
                    """INSERT INTO contact_life_events
                           (user_id, contact_id, event_type, title, event_date, source_message_ids)
                       VALUES ($1, $2, $3, $4, $5, $6)""",
                    user_id, contact_id, event_type, title[:255], mention.date, [message_id],
                )
                log.info('life_event_recorded', user_id=user_id, contact_id=contact_id, event_type=event_type)
