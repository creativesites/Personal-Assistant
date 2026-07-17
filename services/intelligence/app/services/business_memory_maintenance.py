"""Platform Polish Phase 0 — business-side memory confidence decay. See
docs/PLATFORM_POLISH_PLAN.md §2.2.

`business_facts`/`contact_insights` confidence only ever rises today
(business_facts.py's reinforcement step is `min(MAX, existing+STEP)`), with
no decay counterpart — unlike `advisor_memories`, which already has one
(advisor_memory_learner.py's `_deactivate_weak_memories`, itself mirroring
neural/emotion.py's reconsolidation). This is the same "confidence decays
without reinforcement" principle, applied to the two business-side tables.
Never touches a human-approved fact (`is_approved = TRUE`) or a human's
explicit rejection (`is_active` already FALSE) — this only retires weak,
unreinforced AI inferences nobody ever confirmed or corrected.
"""
import structlog

from ..database import get_pool

log = structlog.get_logger()

_WEAK_CONFIDENCE = 0.3
_STALE_DAYS = 30


class BusinessMemoryMaintenanceService:
    async def deactivate_weak_facts(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            business_fact_rows = await conn.fetch(
                """UPDATE business_facts
                     SET is_active = false
                   WHERE is_active = true AND is_approved = false
                     AND confidence < $1 AND evidence_count <= 1
                     AND updated_at < NOW() - make_interval(days => $2)
                   RETURNING id, user_id""",
                _WEAK_CONFIDENCE, _STALE_DAYS,
            )
            contact_insight_rows = await conn.fetch(
                """UPDATE contact_insights
                     SET is_active = false
                   WHERE is_active = true
                     AND confidence < $1 AND evidence_count <= 1
                     AND observed_at < NOW() - make_interval(days => $2)
                   RETURNING id, user_id""",
                _WEAK_CONFIDENCE, _STALE_DAYS,
            )
        count = len(business_fact_rows) + len(contact_insight_rows)
        if count:
            log.info(
                'business_memory_weak_facts_deactivated',
                business_facts=len(business_fact_rows), contact_insights=len(contact_insight_rows),
            )
        return count


_instance: BusinessMemoryMaintenanceService | None = None


def get_business_memory_maintenance() -> BusinessMemoryMaintenanceService:
    global _instance
    if _instance is None:
        _instance = BusinessMemoryMaintenanceService()
    return _instance
