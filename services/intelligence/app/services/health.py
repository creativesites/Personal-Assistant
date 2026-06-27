import structlog
from datetime import datetime, timezone
from ..database import get_pool

log = structlog.get_logger()


class RelationshipHealthService:
    async def recalculate(self, contact_id: str, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rel = await conn.fetchrow(
                """SELECT id, health_score, dormancy_alert_days, importance_tier
                   FROM relationships WHERE contact_id = $1 AND user_id = $2""",
                contact_id, user_id,
            )
            if not rel:
                return 70

            last_msg = await conn.fetchrow(
                """SELECT m.whatsapp_timestamp,
                          AVG(CASE ma.sentiment
                              WHEN 'positive' THEN 1.0
                              WHEN 'neutral'  THEN 0.5
                              WHEN 'mixed'    THEN 0.5
                              ELSE 0.0 END) AS avg_sentiment
                   FROM messages m
                   JOIN conversations c ON c.id = m.conversation_id
                   LEFT JOIN message_analyses ma ON ma.message_id = m.id
                   WHERE c.contact_id = $1 AND c.user_id = $2
                     AND m.whatsapp_timestamp > NOW() - INTERVAL '30 days'
                   ORDER BY m.whatsapp_timestamp DESC
                   LIMIT 1""",
                contact_id, user_id,
            )


        now = datetime.now(tz=timezone.utc)
        dormancy = rel['dormancy_alert_days'] or 30
        old_score = rel['health_score'] or 70

        # Days since last message
        if last_msg and last_msg['whatsapp_timestamp']:
            days_silent = (now - last_msg['whatsapp_timestamp'].replace(tzinfo=timezone.utc)).days
        else:
            days_silent = 999

        # Recency contribution (range: -30 to +20)
        if days_silent <= 3:
            recency = 20
        elif days_silent <= 7:
            recency = 10
        elif days_silent <= dormancy:
            recency = 0
        elif days_silent <= dormancy * 2:
            recency = -15
        else:
            recency = -30

        # Sentiment contribution (range: -10 to +10)
        avg_sent = float(last_msg['avg_sentiment'] or 0.5) if last_msg else 0.5
        sentiment = int((avg_sent - 0.5) * 20)

        new_score = max(0, min(100, 70 + recency + sentiment))

        # Trend
        if new_score > old_score + 3:
            trend = 'improving'
        elif new_score < old_score - 3:
            trend = 'declining'
        else:
            trend = 'stable'

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE relationships
                   SET health_score = $1, health_trend = $2,
                       last_interaction_at = (
                           SELECT MAX(m.whatsapp_timestamp)
                           FROM messages m
                           JOIN conversations c ON c.id = m.conversation_id
                           WHERE c.contact_id = $4 AND c.user_id = $5
                       ),
                       updated_at = NOW()
                   WHERE id = $3""",
                new_score, trend, rel['id'], contact_id, user_id,
            )
            if new_score != old_score:
                await conn.execute(
                    """INSERT INTO relationship_health_logs
                       (relationship_id, health_score, previous_score, change_reason)
                       VALUES ($1, $2, $3, $4)""",
                    rel['id'], new_score, old_score, 'automated_recalculation',
                )

        log.info('health_recalculated', contact_id=contact_id, score=new_score, trend=trend)
        return new_score
