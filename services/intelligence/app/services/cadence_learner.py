import math
import structlog
from ..database import get_pool

log = structlog.get_logger()

# Default check intervals (days) by importance tier
_TIER_INTERVALS = {1: 3, 2: 7, 3: 14, 4: 30, 5: 60}


class CadenceLearner:
    async def learn(self, contact_id: str, user_id: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rel = await conn.fetchrow(
                """SELECT id, importance_tier, last_interaction_at
                   FROM relationships WHERE contact_id = $1 AND user_id = $2""",
                contact_id, user_id,
            )
            if not rel:
                return

            timestamps = await conn.fetch(
                """SELECT m.whatsapp_timestamp AS ts
                   FROM messages m
                   JOIN conversations c ON c.id = m.conversation_id
                   WHERE c.contact_id = $1 AND c.user_id = $2
                     AND m.whatsapp_timestamp IS NOT NULL
                   ORDER BY m.whatsapp_timestamp ASC""",
                contact_id, user_id,
            )

        if len(timestamps) < 3:
            # Not enough data — create a default clock and return
            await self._upsert_clock(
                contact_id, user_id,
                avg_days=_TIER_INTERVALS.get(rel['importance_tier'] or 3, 14),
                std_dev=0.0,
                peak_hours={},
                typical_dow={},
                importance_tier=rel['importance_tier'] or 3,
                last_interaction_at=rel['last_interaction_at'],
            )
            return

        # Compute intervals between consecutive messages
        times = [row['ts'] for row in timestamps]
        intervals = []
        for i in range(1, len(times)):
            delta = (times[i] - times[i - 1]).total_seconds() / 86400
            if delta > 0:
                intervals.append(delta)

        if not intervals:
            return

        avg_days = sum(intervals) / len(intervals)
        variance = sum((x - avg_days) ** 2 for x in intervals) / len(intervals)
        std_dev = math.sqrt(variance)

        # Peak hour distribution (hour of day → frequency)
        hour_counts: dict[int, int] = {}
        for row in timestamps:
            h = row['ts'].hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
        total = sum(hour_counts.values()) or 1
        peak_hours = {str(h): round(c / total, 3) for h, c in hour_counts.items()}

        # Typical day of week
        dow_counts: dict[int, int] = {}
        for row in timestamps:
            d = row['ts'].weekday()
            dow_counts[d] = dow_counts.get(d, 0) + 1
        typical_dow = {str(d): round(c / total, 3) for d, c in dow_counts.items()}

        await self._upsert_clock(
            contact_id, user_id,
            avg_days=avg_days,
            std_dev=std_dev,
            peak_hours=peak_hours,
            typical_dow=typical_dow,
            importance_tier=rel['importance_tier'] or 3,
            last_interaction_at=rel['last_interaction_at'],
        )

        log.info(
            'cadence_learned',
            contact_id=contact_id,
            avg_days=round(avg_days, 1),
            std_dev=round(std_dev, 1),
            samples=len(intervals),
        )

    async def _upsert_clock(
        self,
        contact_id: str,
        user_id: str,
        avg_days: float,
        std_dev: float,
        peak_hours: dict,
        typical_dow: dict,
        importance_tier: int,
        last_interaction_at,
    ) -> None:
        from datetime import datetime, timedelta, timezone

        check_interval = _TIER_INTERVALS.get(importance_tier, 14)
        # Next check: last interaction + (avg + 1 std_dev), or 1 day from now if no data
        if last_interaction_at and avg_days > 0:
            next_check = last_interaction_at.replace(tzinfo=timezone.utc) + timedelta(
                days=max(avg_days - std_dev, check_interval * 0.5)
            )
        else:
            next_check = datetime.now(tz=timezone.utc) + timedelta(days=check_interval)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO relationship_clocks
                     (user_id, contact_id, clock_type,
                      avg_days_between_messages, std_dev_days,
                      peak_hours, typical_day_of_week,
                      check_interval_days, next_check_at, updated_at)
                   VALUES ($1, $2, 'dormancy_watch', $3, $4, $5, $6, $7, $8, NOW())
                   ON CONFLICT (user_id, contact_id, clock_type) DO UPDATE SET
                     avg_days_between_messages = EXCLUDED.avg_days_between_messages,
                     std_dev_days = EXCLUDED.std_dev_days,
                     peak_hours = EXCLUDED.peak_hours,
                     typical_day_of_week = EXCLUDED.typical_day_of_week,
                     check_interval_days = EXCLUDED.check_interval_days,
                     next_check_at = CASE
                       WHEN relationship_clocks.is_manually_configured THEN relationship_clocks.next_check_at
                       ELSE EXCLUDED.next_check_at
                     END,
                     updated_at = NOW()
                   WHERE NOT relationship_clocks.is_manually_configured
                      OR relationship_clocks.avg_days_between_messages IS NULL""",
                user_id, contact_id,
                avg_days, std_dev,
                peak_hours, typical_dow,
                check_interval, next_check,
            )

            # Also ensure weekly_touchpoint clock exists for tier <= 2
            if importance_tier <= 2:
                tier_interval = _TIER_INTERVALS.get(importance_tier, 7)
                wt_next = datetime.now(tz=timezone.utc) + timedelta(days=tier_interval)
                await conn.execute(
                    """INSERT INTO relationship_clocks
                         (user_id, contact_id, clock_type, check_interval_days,
                          avg_days_between_messages, next_check_at, updated_at)
                       VALUES ($1, $2, 'weekly_touchpoint', $3, $4, $5, NOW())
                       ON CONFLICT (user_id, contact_id, clock_type) DO NOTHING""",
                    user_id, contact_id, tier_interval, avg_days, wt_next,
                )
