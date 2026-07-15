import structlog
from datetime import datetime, timedelta, timezone
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_TEMPORAL_NUDGE
from ..database import get_pool
from ..memory import retrieval_service as memory
from ..models import OpportunityMention
from .opportunities import OpportunityService
from .credits import try_consume_credit

log = structlog.get_logger()
_opportunities = OpportunityService()

_VALID_SUGGESTION_TYPES = {
    'check_in', 'birthday_message', 'follow_up', 'congratulate',
    'condolence', 'reconnect', 'respond_to_event', 'relationship_maintenance',
}


class ClockEngine:
    async def evaluate_for_user(self, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )

            # Clocks due for checking (not checked in last 4 hours)
            clocks = await conn.fetch(
                """SELECT rc.id, rc.contact_id, rc.clock_type,
                          rc.avg_days_between_messages, rc.std_dev_days,
                          rc.check_interval_days, rc.last_nudge_at,
                          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                          r.relationship_type, r.importance_tier,
                          r.health_score, r.health_trend, r.last_interaction_at
                   FROM relationship_clocks rc
                   JOIN contacts co ON co.id = rc.contact_id
                   JOIN relationships r ON r.contact_id = rc.contact_id AND r.user_id = $1
                   WHERE rc.user_id = $1
                     AND rc.is_active = TRUE
                     AND (rc.last_checked_at IS NULL
                          OR rc.last_checked_at < NOW() - INTERVAL '4 hours')
                   ORDER BY r.importance_tier ASC, r.health_score ASC
                   LIMIT 50""",
                user_id,
            )

        if not clocks:
            return 0

        user_name = user['name'] if user else 'User'
        client = get_ai_client()
        nudged = 0

        for clock in clocks:
            contact_id = str(clock['contact_id'])
            clock_id = str(clock['id'])

            now = datetime.now(tz=timezone.utc)

            # Days since last interaction
            days_silent = 999
            if clock['last_interaction_at']:
                delta = now - clock['last_interaction_at'].replace(tzinfo=timezone.utc)
                days_silent = delta.days

            avg = float(clock['avg_days_between_messages'] or 14)
            std = float(clock['std_dev_days'] or avg * 0.5)
            check_interval = int(clock['check_interval_days'] or 7)

            # Should this clock fire?
            should_nudge = self._should_fire(
                clock_type=clock['clock_type'],
                days_silent=days_silent,
                avg_days=avg,
                std_dev=std,
                importance_tier=clock['importance_tier'],
            )

            # Don't re-nudge within check_interval
            if should_nudge and clock['last_nudge_at']:
                days_since_nudge = (now - clock['last_nudge_at'].replace(tzinfo=timezone.utc)).days
                if days_since_nudge < check_interval:
                    should_nudge = False

            # Don't nudge if there's already a pending item for this contact today
            pool2 = await get_pool()
            async with pool2.acquire() as conn:
                existing = await conn.fetchval(
                    """SELECT COUNT(*) FROM proactive_queue
                       WHERE contact_id = $1 AND user_id = $2
                         AND status = 'pending'
                         AND suggested_for_date = CURRENT_DATE""",
                    contact_id, user_id,
                )

            if existing and int(existing) > 0:
                should_nudge = False

            if should_nudge:
                # Fetch context — via the shared retrieval service, not the
                # context_snapshots table (schema-only, never written by any
                # code, so this always fell back to 'No recent context').
                contact_summary_data = await memory.get_contact_summary(user_id, contact_id)
                rel_mem_text = memory.format_relationship_memory(
                    await memory.get_relationship_memory(user_id, contact_id)
                )
                context_parts = [
                    contact_summary_data['personality_summary'] or '',
                    contact_summary_data['current_life_context'] or '',
                    rel_mem_text,
                ]
                context = ('\n'.join(p for p in context_parts if p) or 'No recent context')[:400]

                pool3 = await get_pool()
                async with pool3.acquire() as conn:
                    upcoming = await conn.fetch(
                        """SELECT title, event_date FROM events
                           WHERE contact_id = $1 AND user_id = $2
                             AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
                           ORDER BY event_date ASC LIMIT 3""",
                        contact_id, user_id,
                    )
                upcoming_events = ', '.join(
                    f"{e['title']} on {e['event_date']}" for e in upcoming
                ) or 'none'

                prompt = GENERATE_TEMPORAL_NUDGE.format(
                    user_name=user_name,
                    contact_name=clock['contact_name'],
                    days_silent=days_silent,
                    avg_days=avg,
                    std_dev=std,
                    relationship_type=clock['relationship_type'],
                    importance_tier=clock['importance_tier'],
                    health_score=clock['health_score'],
                    health_trend=clock['health_trend'],
                    clock_type=clock['clock_type'],
                    context=context,
                    upcoming_events=upcoming_events,
                )

                try:
                    raw = await client.complete_json(
                        [{'role': 'user', 'content': prompt}],
                        service='intelligence', feature='proactive_nudge', user_id=user_id,
                    )
                    stype = raw.get('suggestion_type', 'check_in')
                    if stype not in _VALID_SUGGESTION_TYPES:
                        stype = 'check_in'
                    priority = max(1, min(5, int(raw.get('priority', 3))))

                    if not await try_consume_credit(user_id, 'nudge'):
                        log.info('temporal_nudge_skipped_no_credits', user_id=user_id, contact_id=contact_id)
                        continue

                    pool4 = await get_pool()
                    async with pool4.acquire() as conn:
                        await conn.execute(
                            """INSERT INTO proactive_queue (
                                   user_id, contact_id, suggestion_type,
                                   title, body, draft_message,
                                   priority, suggested_for_date
                               ) VALUES ($1, $2, $3::suggestion_type, $4, $5, $6, $7, CURRENT_DATE)""",
                            user_id, contact_id, stype,
                            raw.get('title', 'Stay in touch'),
                            raw.get('body', ''),
                            raw.get('draft_message'),
                            priority,
                        )

                    # Update clock state
                    pool5 = await get_pool()
                    async with pool5.acquire() as conn:
                        next_check = now + timedelta(days=check_interval)
                        await conn.execute(
                            """UPDATE relationship_clocks
                               SET last_checked_at = NOW(),
                                   last_nudge_at = NOW(),
                                   next_check_at = $1,
                                   nudge_count = nudge_count + 1,
                                   updated_at = NOW()
                               WHERE id = $2""",
                            next_check, clock_id,
                        )

                    nudged += 1
                    log.info(
                        'temporal_nudge_created',
                        user_id=user_id,
                        contact_id=contact_id,
                        clock_type=clock['clock_type'],
                        days_silent=days_silent,
                    )

                except Exception as exc:
                    log.warning('clock_nudge_failed', clock_id=clock_id, error=str(exc))

            else:
                # Mark checked without firing
                pool6 = await get_pool()
                async with pool6.acquire() as conn:
                    next_check = now + timedelta(hours=4)
                    await conn.execute(
                        """UPDATE relationship_clocks
                           SET last_checked_at = NOW(),
                               next_check_at = $1,
                               updated_at = NOW()
                           WHERE id = $2""",
                        next_check, clock_id,
                    )

        log.info('clock_evaluation_done', user_id=user_id, nudged=nudged, checked=len(clocks))
        return nudged

    def _should_fire(
        self,
        clock_type: str,
        days_silent: int,
        avg_days: float,
        std_dev: float,
        importance_tier: int,
    ) -> bool:
        if clock_type == 'dormancy_watch':
            threshold = avg_days + max(std_dev * 1.5, avg_days * 0.5)
            return days_silent > threshold

        if clock_type == 'weekly_touchpoint':
            # For close contacts (tier <= 2), nudge if silent more than check interval
            tier_threshold = {1: 3, 2: 7}.get(importance_tier, 14)
            return days_silent > tier_threshold

        if clock_type == 'daily_checkin':
            return days_silent > 2 and importance_tier == 1

        return False

    async def evaluate_all_users(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT DISTINCT rc.user_id
                   FROM relationship_clocks rc
                   WHERE rc.is_active = TRUE
                     AND (rc.last_checked_at IS NULL
                          OR rc.last_checked_at < NOW() - INTERVAL '4 hours')""",
            )

        for user in users:
            try:
                await self.evaluate_for_user(str(user['user_id']))
            except Exception as exc:
                log.error('clock_user_failed', user_id=user['user_id'], error=str(exc))

        try:
            await self.check_product_replacements()
        except Exception as exc:
            log.error('product_replacement_check_failed', error=str(exc))

    async def check_product_replacements(self) -> int:
        """Wire replacement-date prediction into opportunities (§5.6/§5.8) —
        this is the one place in the codebase that runs on a wall-clock
        timer rather than reacting to an incoming message, so it's the
        natural home for "is X's predicted replacement date coming up"
        rather than a new scheduler. OpportunityService's own dedup (one
        open renewal_due per contact within its shelf life) keeps this
        idempotent across repeated 15-minute runs."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            due = await conn.fetch(
                """SELECT cp.id, cp.user_id, cp.contact_id, cp.replacement_predicted_at, p.name AS product_name
                   FROM contact_products cp
                   JOIN products p ON p.id = cp.product_id
                   WHERE cp.replacement_predicted_at IS NOT NULL
                     AND cp.replacement_predicted_at <= CURRENT_DATE + INTERVAL '14 days'
                     AND cp.replacement_predicted_at >= CURRENT_DATE - INTERVAL '3 days'""",
            )

        for row in due:
            await _opportunities.record_candidates(
                str(row['user_id']), str(row['contact_id']), f"replacement-{row['id']}",
                [OpportunityMention(
                    opportunity_type='renewal_due',
                    title=f"{row['product_name']} likely needs replacing",
                    description=f"Predicted replacement date: {row['replacement_predicted_at']}",
                    confidence=0.6,
                )],
            )

        if due:
            log.info('product_replacements_checked', count=len(due))
        return len(due)
