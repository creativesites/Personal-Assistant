"""
Lead scoring — heuristic, not agent-gated.

Before this, contacts.lead_score was ONLY ever written by an AI agent's
update_lead_score tool call (services/intelligence/app/services/agent_engine.py),
which only runs when the message routes to an agent (orchestrator.py requires
an active agent_assignments row). Almost nobody configures an agent, so
lead_score stayed 0 for every contact regardless of real buying-signal
activity — silently emptying every "Opportunities"/"Buying Signals"/pipeline
view in apps/web/src/app/(dashboard)/analytics/* that reads it.

This computes lead_score directly from the opportunities table (Phase 2 of
docs/RELATIONSHIP_OS_PLAN.md), which already detects buying signals from
every message with no agent/opt-in required. Score is simply the strongest
open business-type opportunity's confidence, scaled to 0-100 — a contact
with no detected buying signal scores 0, exactly reflecting "no signal
detected" rather than an agent never having run.
"""

import structlog
from ..database import get_pool

log = structlog.get_logger()

_BUSINESS_OPPORTUNITY_TYPES = ('buying_signal', 'expansion', 'referral_moment', 'renewal_due')


class LeadScoreService:
    async def recompute(self, contact_id: str, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            max_confidence = await conn.fetchval(
                """SELECT MAX(confidence) FROM opportunities
                   WHERE contact_id = $1 AND user_id = $2 AND status = 'open'
                     AND opportunity_type = ANY($3::text[])
                     AND (expires_at IS NULL OR expires_at > NOW())""",
                contact_id, user_id, list(_BUSINESS_OPPORTUNITY_TYPES),
            )
            score = round(float(max_confidence) * 100) if max_confidence is not None else 0

            await conn.execute(
                'UPDATE contacts SET lead_score = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
                score, contact_id, user_id,
            )

        log.info('lead_score_recomputed', contact_id=contact_id, score=score)
        return score
