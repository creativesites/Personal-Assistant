"""
Relationship Memory — aggregated, separate from the AI-generated contact
profile. Built entirely from data already captured per-message (promises,
topics, extracted events); no new LLM calls needed.

"Outstanding" promises use a recency heuristic (detected within the lookback
window, most recent per exact text kept) rather than true fulfillment
tracking — there's no signal today that says a promise was kept, only that
one was made. That's a known limitation, not an oversight.
"""

from datetime import datetime, timezone
import structlog
from ..database import get_pool

log = structlog.get_logger()

_LOOKBACK_MESSAGES = 200
_PROMISE_LOOKBACK_DAYS = 30
_MAX_THEMES = 5


class RelationshipMemoryService:
    async def recompute(self, contact_id: str, user_id: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ma.promises_detected, ma.topics, m.sender_type, m.whatsapp_timestamp
                FROM message_analyses ma
                JOIN messages m ON m.id = ma.message_id
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.contact_id = $1 AND c.user_id = $2
                ORDER BY m.whatsapp_timestamp DESC
                LIMIT $3
                """,
                contact_id, user_id, _LOOKBACK_MESSAGES,
            )
            first_message_at = await conn.fetchval(
                """
                SELECT MIN(m.whatsapp_timestamp)
                FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE c.contact_id = $1 AND c.user_id = $2
                """,
                contact_id, user_id,
            )
            nudge_total = await conn.fetchval(
                'SELECT COALESCE(SUM(nudge_count), 0) FROM relationship_clocks'
                ' WHERE contact_id = $1 AND user_id = $2',
                contact_id, user_id,
            )
            upcoming_events = await conn.fetch(
                """
                SELECT title, event_type, event_date, is_recurring
                FROM events
                WHERE contact_id = $1 AND user_id = $2
                  AND event_type IN ('birthday', 'anniversary')
                ORDER BY event_date NULLS LAST
                LIMIT 10
                """,
                contact_id, user_id,
            )

        outstanding_promises: dict[str, dict] = {}
        topic_counts: dict[str, int] = {}
        for row in rows:
            if row['whatsapp_timestamp']:
                age_days = (datetime.now(timezone.utc) - row['whatsapp_timestamp']).days
                if age_days <= _PROMISE_LOOKBACK_DAYS:
                    for promise in (row['promises_detected'] or []):
                        outstanding_promises[promise['text']] = {
                            'text': promise['text'],
                            'type': promise.get('type', 'commitment'),
                            'made_by': row['sender_type'],
                        }
            for topic in (row['topics'] or []):
                topic_counts[topic] = topic_counts.get(topic, 0) + 1

        conversation_themes = [
            t for t, _ in sorted(topic_counts.items(), key=lambda kv: kv[1], reverse=True)[:_MAX_THEMES]
        ]
        important_dates = [
            {
                'title': e['title'],
                'type': e['event_type'],
                'date': e['event_date'].isoformat() if e['event_date'] else None,
                'is_recurring': e['is_recurring'],
            }
            for e in upcoming_events
        ]

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO relationship_memory (
                    user_id, contact_id, outstanding_promises, missed_followups_count,
                    conversation_themes, important_dates, shared_history_since, last_computed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (user_id, contact_id) DO UPDATE SET
                    outstanding_promises   = EXCLUDED.outstanding_promises,
                    missed_followups_count = EXCLUDED.missed_followups_count,
                    conversation_themes    = EXCLUDED.conversation_themes,
                    important_dates        = EXCLUDED.important_dates,
                    shared_history_since    = COALESCE(relationship_memory.shared_history_since, EXCLUDED.shared_history_since),
                    last_computed_at        = NOW(),
                    updated_at               = NOW()
                """,
                user_id,
                contact_id,
                list(outstanding_promises.values()),
                int(nudge_total or 0),
                conversation_themes,
                important_dates,
                first_message_at,
            )

        log.info(
            'relationship_memory_recomputed',
            contact_id=contact_id,
            outstanding_promises=len(outstanding_promises),
            themes=conversation_themes,
        )
