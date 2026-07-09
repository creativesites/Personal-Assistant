import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_PROACTIVE_SUGGESTION
from ..database import get_pool
from ..memory import retrieval_service as memory

log = structlog.get_logger()

_VALID_TYPES = {
    'check_in', 'birthday_message', 'follow_up', 'congratulate',
    'condolence', 'reconnect', 'respond_to_event', 'relationship_maintenance',
}


class ProactiveService:
    async def generate_for_user(self, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )

            # Find contacts that need attention
            candidates = await conn.fetch(
                """SELECT
                     co.id AS contact_id,
                     COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                     r.relationship_type,
                     r.importance_tier,
                     r.health_score,
                     r.health_trend,
                     r.last_interaction_at,
                     r.dormancy_alert_days,
                     (SELECT COUNT(*) FROM proactive_queue pq
                      WHERE pq.contact_id = co.id AND pq.user_id = $1
                        AND pq.status = 'pending'
                        AND pq.suggested_for_date = CURRENT_DATE) AS already_pending
                   FROM contacts co
                   JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
                   WHERE co.user_id = $1 AND co.is_group = false
                     AND r.importance_tier <= 3
                   ORDER BY r.importance_tier ASC, r.health_score ASC
                   LIMIT 20""",
                user_id,
            )

            # Upcoming events in next 14 days
            upcoming_events = await conn.fetch(
                """SELECT contact_id, title, event_type,
                          event_date, event_datetime
                   FROM events
                   WHERE user_id = $1
                     AND (event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
                          OR (is_recurring = true AND
                              DATE_PART('doy', event_date) BETWEEN
                              DATE_PART('doy', CURRENT_DATE) AND
                              DATE_PART('doy', CURRENT_DATE) + 14))
                   ORDER BY event_date ASC""",
                user_id,
            )

        events_by_contact: dict[str, list[str]] = {}
        for ev in upcoming_events:
            cid = str(ev['contact_id'])
            events_by_contact.setdefault(cid, []).append(
                f"{ev['title']} on {ev['event_date']}"
            )

        user_name = user['name'] if user else 'User'
        created = 0
        client = get_ai_client()

        for c in candidates:
            if int(c['already_pending']) > 0:
                continue

            contact_id = str(c['contact_id'])
            days_silent = None
            if c['last_interaction_at']:
                from datetime import datetime, timezone
                delta = datetime.now(tz=timezone.utc) - c['last_interaction_at'].replace(tzinfo=timezone.utc)
                days_silent = delta.days

            # Skip if interacted recently (within 3 days) AND health is fine
            if days_silent is not None and days_silent < 3 and c['health_score'] >= 75:
                continue

            upcoming = events_by_contact.get(contact_id, [])
            last_interaction = (
                f"{days_silent} days ago" if days_silent is not None else "unknown"
            )

            # Recent context — via the shared retrieval service, not the
            # context_snapshots table (defined in schema, never written by any
            # code, so this always fell back to 'No recent context available').
            contact_summary_data = await memory.get_contact_summary(user_id, contact_id)
            rel_mem_text = memory.format_relationship_memory(
                await memory.get_relationship_memory(user_id, contact_id)
            )
            context_parts = [
                contact_summary_data['personality_summary'] or '',
                contact_summary_data['current_life_context'] or '',
                rel_mem_text,
            ]
            context = '\n'.join(p for p in context_parts if p) or 'No recent context available'

            prompt = GENERATE_PROACTIVE_SUGGESTION.format(
                user_name=user_name,
                contact_name=c['contact_name'],
                relationship_type=c['relationship_type'],
                importance_tier=str(c['importance_tier']),
                health_score=c['health_score'],
                health_trend=c['health_trend'],
                last_interaction=last_interaction,
                upcoming_events=', '.join(upcoming) or 'none',
                context=context[:500],
            )

            try:
                raw = await client.complete_json([{'role': 'user', 'content': prompt}])
                stype = raw.get('suggestion_type', 'check_in')
                if stype not in _VALID_TYPES:
                    stype = 'check_in'
                priority = max(1, min(5, int(raw.get('priority', 3))))

                pool3 = await get_pool()
                async with pool3.acquire() as conn:
                    await conn.execute(
                        """INSERT INTO proactive_queue (
                               user_id, contact_id, suggestion_type,
                               title, body, draft_message,
                               priority, suggested_for_date
                           ) VALUES ($1, $2, $3::suggestion_type, $4, $5, $6, $7, CURRENT_DATE)""",
                        user_id, contact_id, stype,
                        raw.get('title', 'Check in'),
                        raw.get('body', ''),
                        raw.get('draft_message'),
                        priority,
                    )
                created += 1

            except Exception as exc:
                log.warning('proactive_generation_failed', contact_id=contact_id, error=str(exc))

        log.info('proactive_generated', user_id=user_id, count=created)
        return created

    async def generate_for_all_users(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT u.id FROM users u
                   JOIN whatsapp_instances wi ON wi.user_id = u.id
                   WHERE wi.status = 'connected'""",
            )

        for user in users:
            try:
                await self.generate_for_user(str(user['id']))
            except Exception as exc:
                log.error('proactive_user_failed', user_id=user['id'], error=str(exc))
