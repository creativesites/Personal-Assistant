import structlog
from ..database import get_pool
from ..models import MessageAnalysis

log = structlog.get_logger()

_VALID_EVENT_TYPES = {
    'birthday', 'anniversary', 'job_change', 'life_event',
    'travel', 'appointment', 'deadline', 'celebration', 'loss', 'other',
}


class EventExtractor:
    async def extract_from_analysis(
        self,
        message_id: str,
        contact_id: str,
        user_id: str,
        analysis: MessageAnalysis,
    ) -> int:
        if not analysis.events_detected:
            return 0

        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            for ev in analysis.events_detected:
                event_type = ev.type if ev.type in _VALID_EVENT_TYPES else 'other'
                # Skip events with no useful title
                if not ev.title or len(ev.title.strip()) < 3:
                    continue

                # Check for duplicate (same contact + title + type within 7 days)
                existing = await conn.fetchval(
                    """SELECT id FROM events
                       WHERE contact_id = $1 AND user_id = $2
                         AND event_type = $3::event_type
                         AND title ILIKE $4
                         AND created_at > NOW() - INTERVAL '7 days'""",
                    contact_id, user_id, event_type, f'%{ev.title[:50]}%',
                )
                if existing:
                    continue

                await conn.execute(
                    """INSERT INTO events (
                           user_id, contact_id, event_type, title,
                           event_date, is_recurring, source, source_message_id, confidence_score
                       ) VALUES ($1, $2, $3::event_type, $4, $5, $6, 'message_extraction', $7, 0.7)""",
                    user_id, contact_id, event_type, ev.title,
                    ev.date, ev.is_recurring, message_id,
                )
                created += 1

        if created:
            log.info('events_extracted', message_id=message_id, count=created)
        return created
