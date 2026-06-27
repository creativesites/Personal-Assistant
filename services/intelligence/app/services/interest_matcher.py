import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import MATCH_NEWS_TO_CONTACT, GENERATE_WORLD_EVENT_NUDGE
from ..database import get_pool
from .news_indexer import get_news_indexer

log = structlog.get_logger()


class InterestMatcher:
    async def match_for_user(self, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )
            contacts = await conn.fetch(
                """SELECT
                     co.id AS contact_id,
                     COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                     r.relationship_type,
                     r.importance_tier,
                     STRING_AGG(ci.insight_value, '; ') AS interests
                   FROM contacts co
                   JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
                   JOIN contact_insights ci
                     ON ci.contact_id = co.id AND ci.user_id = $1
                     AND ci.insight_key IN ('interests', 'hobbies', 'sports_teams', 'favorite_topics')
                     AND ci.is_active = true
                   WHERE co.user_id = $1 AND co.is_group = false
                   GROUP BY co.id, co.custom_name, co.display_name, co.phone_number,
                            r.relationship_type, r.importance_tier
                   LIMIT 50""",
                user_id,
            )

        if not contacts:
            return 0

        headlines = await get_news_indexer().get_headlines()
        if not headlines:
            return 0

        user_name = user['name'] if user else 'User'
        headlines_text = '\n'.join(
            f"- {h['title']}: {h['snippet'][:200]}" for h in headlines[:15]
        )

        client = get_ai_client()
        created = 0

        for c in contacts:
            contact_id = str(c['contact_id'])
            interests = (c['interests'] or '').strip()
            if not interests:
                continue

            pool2 = await get_pool()
            async with pool2.acquire() as conn:
                existing = await conn.fetchval(
                    """SELECT COUNT(*) FROM proactive_queue
                       WHERE contact_id = $1 AND user_id = $2
                         AND suggestion_type = 'respond_to_event'
                         AND suggested_for_date = CURRENT_DATE""",
                    contact_id, user_id,
                )
            if existing and int(existing) > 0:
                continue

            try:
                match = await client.complete_json([{
                    'role': 'user',
                    'content': MATCH_NEWS_TO_CONTACT.format(
                        contact_name=c['contact_name'],
                        interests=interests,
                        headlines=headlines_text,
                    ),
                }])

                if not match.get('matched'):
                    continue

                nudge = await client.complete_json([{
                    'role': 'user',
                    'content': GENERATE_WORLD_EVENT_NUDGE.format(
                        user_name=user_name,
                        contact_name=c['contact_name'],
                        relationship_type=c['relationship_type'],
                        interests=interests,
                        headline=match.get('headline', ''),
                        relevance_reason=match.get('relevance_reason', ''),
                        url=match.get('url', ''),
                    ),
                }])

                priority = max(1, min(5, int(nudge.get('priority', 3))))
                pool3 = await get_pool()
                async with pool3.acquire() as conn:
                    await conn.execute(
                        """INSERT INTO proactive_queue (
                               user_id, contact_id, suggestion_type,
                               title, body, draft_message,
                               priority, suggested_for_date
                           ) VALUES ($1, $2, $3::suggestion_type, $4, $5, $6, $7, CURRENT_DATE)""",
                        user_id, contact_id, 'respond_to_event',
                        nudge.get('title', f"News for {c['contact_name']}"),
                        nudge.get('body', match.get('relevance_reason', '')),
                        nudge.get('draft_message'),
                        priority,
                    )
                created += 1
                log.info('world_event_nudge_created', contact=c['contact_name'],
                         headline=match.get('headline', '')[:80])

            except Exception as exc:
                log.warning('interest_match_failed', contact_id=contact_id, error=str(exc))

        log.info('interest_matching_done', user_id=user_id, created=created)
        return created


class WorldKnowledgeEngine:
    def __init__(self) -> None:
        self._matcher = InterestMatcher()

    async def run_for_user(self, user_id: str) -> int:
        return await self._matcher.match_for_user(user_id)

    async def run_for_all_users(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT u.id FROM users u
                   JOIN whatsapp_instances wi ON wi.user_id = u.id
                   WHERE wi.status = 'connected'""",
            )
        for user in users:
            try:
                await self.run_for_user(str(user['id']))
            except Exception as exc:
                log.error('world_knowledge_user_failed', user_id=user['id'], error=str(exc))
