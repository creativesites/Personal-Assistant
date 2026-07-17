"""Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
— reuses business_events + the existing "Zuri Noticed" render pattern
rather than a new table. These are the feed-worthy detectors that don't
already have a natural home elsewhere: project-percent-crossing at 100%
(project_progress.py already covers the mid-project 75% nudge),
repeat-product-mention (a product enough distinct contacts have brought
up to be worth noting, regardless of whether anyone's bought it — the
purchased-or-not distinction belongs to §5.4's unmet-demand check, not
here), and contact-gone-quiet (a contact who used to message often has
gone unusually silent — detect-and-surface only, same posture as Reality
Engine's contradiction checks, no proactive_queue nudge). Payment-posted
and the invoice/deal milestone-counter-crossing events live in Node
(business-feed.ts) since documents.ts/deals.ts already own those writes.

Plain SQL, no LLM call — same discipline as every other deterministic
detector in this codebase.
"""
import structlog

from ..database import get_pool
from .business_events import BusinessEventService

log = structlog.get_logger()

_business_events = BusinessEventService()
_MENTION_THRESHOLDS = (5, 10, 25, 50, 100)


class BusinessFeedDetectorService:
    async def detect_project_completions(self) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.user_id, p.contact_id, p.title,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM projects p
                JOIN contacts c ON c.id = p.contact_id
                JOIN project_tasks pt ON pt.project_id = p.id
                WHERE p.status = 'active'
                  AND NOT EXISTS (
                    SELECT 1 FROM project_events pe
                    WHERE pe.project_id = p.id AND pe.event_type = 'feed_completion_posted'
                  )
                GROUP BY p.id, p.user_id, p.contact_id, p.title, c.custom_name, c.display_name, c.phone_number
                HAVING COUNT(pt.id) > 0 AND COUNT(pt.id) FILTER (WHERE pt.status = 'done') = COUNT(pt.id)
                """
            )
            for row in rows:
                await _business_events.record(
                    str(row['user_id']), 'project_completed', contact_id=str(row['contact_id']),
                    evidence=[f"Project \"{row['title']}\" ({row['contact_name']}) reached 100% task completion"],
                    payload={'projectId': str(row['id']), 'title': row['title']},
                )
                await conn.execute(
                    """INSERT INTO project_events (project_id, event_type, metadata)
                       VALUES ($1, 'feed_completion_posted', '{}'::jsonb)""",
                    row['id'],
                )
                created += 1
        log.info('business_feed_project_completions', count=created)
        return created

    async def detect_repeat_product_mentions(self) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT cp.product_id, cp.user_id, p.name, COUNT(DISTINCT cp.contact_id) AS mention_count
                FROM contact_products cp
                JOIN products p ON p.id = cp.product_id
                GROUP BY cp.product_id, cp.user_id, p.name
                HAVING COUNT(DISTINCT cp.contact_id) = ANY($1::int[])
                """,
                list(_MENTION_THRESHOLDS),
            )
            for row in rows:
                count = row['mention_count']
                dup = await conn.fetchval(
                    """SELECT 1 FROM business_events
                       WHERE user_id = $1 AND event_type = 'repeat_product_mention'
                         AND payload->>'productId' = $2 AND (payload->>'count')::int = $3""",
                    row['user_id'], str(row['product_id']), count,
                )
                if dup:
                    continue
                await _business_events.record(
                    str(row['user_id']), 'repeat_product_mention',
                    evidence=[f"\"{row['name']}\" has now come up with {count} different contacts"],
                    payload={'productId': str(row['product_id']), 'name': row['name'], 'count': count},
                )
                created += 1
        log.info('business_feed_repeat_mentions', count=created)
        return created

    async def detect_contact_gone_quiet(self) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT rc.contact_id, rc.user_id, rc.avg_days_between_messages, r.last_interaction_at,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM relationship_clocks rc
                JOIN relationships r ON r.contact_id = rc.contact_id AND r.user_id = rc.user_id
                JOIN contacts c ON c.id = rc.contact_id
                WHERE rc.is_active = TRUE
                  AND rc.avg_days_between_messages IS NOT NULL AND rc.avg_days_between_messages < 7
                  AND r.last_interaction_at IS NOT NULL
                  AND r.last_interaction_at < NOW() - (rc.avg_days_between_messages * 3 || ' days')::interval
                  AND r.last_interaction_at > NOW() - INTERVAL '90 days'
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = rc.user_id AND be.event_type = 'contact_gone_quiet'
                      AND be.contact_id = rc.contact_id AND be.created_at > NOW() - INTERVAL '14 days'
                  )
                """
            )
            for row in rows:
                days_silent = (await conn.fetchval('SELECT EXTRACT(DAY FROM NOW() - $1::timestamptz)::int', row['last_interaction_at']))
                await _business_events.record(
                    str(row['user_id']), 'contact_gone_quiet', contact_id=str(row['contact_id']), confidence=0.7,
                    evidence=[f"{row['contact_name']} usually messages every ~{round(row['avg_days_between_messages'])} day(s), but it's been {days_silent}"],
                    payload={'contactId': str(row['contact_id']), 'daysSilent': days_silent},
                )
                created += 1
        log.info('business_feed_contact_gone_quiet', count=created)
        return created

    async def generate_for_all_users(self) -> int:
        return (
            await self.detect_project_completions()
            + await self.detect_repeat_product_mentions()
            + await self.detect_contact_gone_quiet()
        )


_business_feed_detectors = BusinessFeedDetectorService()


def get_business_feed_detectors() -> BusinessFeedDetectorService:
    return _business_feed_detectors
