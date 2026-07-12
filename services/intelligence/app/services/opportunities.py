"""
Opportunity Detection — see docs/RELATIONSHIP_OS_PLAN.md §5.8/§6.7.

Promotes what used to be an ad-hoc insight_key naming convention
(OPPORTUNITY_KEYS, string-matched by the frontend) into a real, listable,
expirable table. Each opportunity_type gets a shelf life after which it's
no longer worth surfacing (a "buying signal" from six weeks ago isn't
actionable the same way one from yesterday is) — expiry is enforced by
readers filtering on expires_at, not a cron job.

Unlike business_facts, there's no evidence-count accumulation here: a
repeated mention of the same open opportunity just refreshes it (extends
expires_at, appends the message id) rather than building confidence over
time, since the plan's schema has no evidence_count column for this table.
"""

import structlog
from datetime import timedelta
from ..database import get_pool
from ..models import OpportunityMention

log = structlog.get_logger()

_VALID_TYPES = {
    'buying_signal', 'expansion', 'referral_moment', 'renewal_due',
    'life_event', 'reconnect_window', 'churn_risk', 'support_needed',
}
_PERSONAL_TYPES = {'life_event', 'reconnect_window', 'support_needed'}

_SHELF_LIFE_DAYS = {
    'buying_signal': 30, 'expansion': 45, 'referral_moment': 21, 'renewal_due': 60,
    'life_event': 14, 'reconnect_window': 14, 'churn_risk': 21, 'support_needed': 14,
}


class OpportunityService:
    async def record_candidates(
        self, user_id: str, contact_id: str, message_id: str, mentions: list[OpportunityMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            for mention in mentions:
                opp_type = mention.opportunity_type
                if opp_type not in _VALID_TYPES:
                    continue
                title = mention.title.strip()
                if not title:
                    continue

                estimated_value = None if opp_type in _PERSONAL_TYPES else mention.estimated_value_cents
                shelf_life = _SHELF_LIFE_DAYS.get(opp_type, 21)

                existing = await conn.fetchrow(
                    """SELECT id, source_message_ids FROM opportunities
                       WHERE user_id = $1 AND contact_id = $2 AND opportunity_type = $3 AND status = 'open'
                       ORDER BY detected_at DESC LIMIT 1""",
                    user_id, contact_id, opp_type,
                )

                if existing:
                    source_ids = list(existing['source_message_ids'] or []) + [message_id]
                    await conn.execute(
                        """UPDATE opportunities SET
                               source_message_ids = $1,
                               expires_at = NOW() + $2::interval,
                               updated_at = NOW()
                           WHERE id = $3""",
                        source_ids, f'{shelf_life} days', existing['id'],
                    )
                    continue

                await conn.execute(
                    """INSERT INTO opportunities (
                           user_id, contact_id, opportunity_type, title, description,
                           estimated_value_cents, confidence, source_message_ids, expires_at
                       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + $9::interval)""",
                    user_id, contact_id, opp_type, title[:255], mention.description or None,
                    estimated_value, mention.confidence, [message_id], f'{shelf_life} days',
                )
                log.info('opportunity_detected', user_id=user_id, contact_id=contact_id, type=opp_type)
