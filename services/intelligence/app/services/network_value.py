"""
Network Value (business) / Connection Value (personal) — see
docs/RELATIONSHIP_OS_PLAN.md §5.1/§6.4.

Recomputed alongside health_score into the same flexible-JSONB pattern as
contact_profiles.structured_attributes, since the business and personal
shapes are genuinely different rather than a dozen shared nullable columns.
Which shape a relationship gets is decided by whether it shows any
business signal at all (an open/closed deal, a revenue event, or a
business-flavoured customer_status) — the same "presence of data, not a
mode flag" approach health.py already uses for pipeline_velocity.
"""

import json
import structlog
from ..database import get_pool

log = structlog.get_logger()

_BUSINESS_STATUSES = {'lead', 'prospect', 'customer', 'vip'}
_DECISION_KEYWORDS_HIGH = ('owner', 'ceo', 'founder', 'director', 'president', 'managing')
_DECISION_KEYWORDS_MEDIUM = ('manager', 'head', 'lead')


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


class NetworkValueService:
    async def recompute(self, contact_id: str, user_id: str) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rel = await conn.fetchrow(
                """SELECT id, importance_tier, health_score FROM relationships
                   WHERE contact_id = $1 AND user_id = $2""",
                contact_id, user_id,
            )
            if not rel:
                return {}

            contact = await conn.fetchrow(
                'SELECT customer_status, job_title FROM contacts WHERE id = $1',
                contact_id,
            )
            deal_count = await conn.fetchval(
                'SELECT COUNT(*) FROM deals WHERE contact_id = $1 AND user_id = $2',
                contact_id, user_id,
            )
            revenue_cents = int(await conn.fetchval(
                'SELECT COALESCE(SUM(amount_cents), 0) FROM revenue_events WHERE contact_id = $1 AND user_id = $2',
                contact_id, user_id,
            ) or 0)

            is_business = (
                int(deal_count or 0) > 0
                or revenue_cents > 0
                or (contact is not None and contact['customer_status'] in _BUSINESS_STATUSES)
            )

            value = (
                await self._compute_business(conn, contact_id, user_id, rel, contact, revenue_cents)
                if is_business
                else await self._compute_personal(conn, contact_id, user_id, rel)
            )

            await conn.execute(
                'UPDATE relationships SET network_value = $1, updated_at = NOW() WHERE id = $2',
                json.dumps(value), rel['id'],
            )

        log.info('network_value_recomputed', contact_id=contact_id, is_business=is_business, overall=value.get('overallScore'))
        return value

    async def _compute_business(self, conn, contact_id, user_id, rel, contact, financial_value_cents: int) -> dict:
        connections = await conn.fetch(
            """SELECT connection_type, confidence,
                      CASE WHEN contact_a_id = $1 THEN contact_b_id ELSE contact_a_id END AS other_contact_id
               FROM relationship_connections
               WHERE user_id = $2 AND (contact_a_id = $1 OR contact_b_id = $1) AND is_active = TRUE""",
            contact_id, user_id,
        )
        referral_connections = [c for c in connections if c['connection_type'] in ('refers_to', 'introduced_by')]
        referral_contact_ids = [c['other_contact_id'] for c in referral_connections]

        referral_value_cents = 0
        if referral_contact_ids:
            referral_value_cents = int(await conn.fetchval(
                'SELECT COALESCE(SUM(amount_cents), 0) FROM revenue_events WHERE contact_id = ANY($1) AND user_id = $2',
                referral_contact_ids, user_id,
            ) or 0)

        open_deal = await conn.fetchrow(
            """SELECT probability FROM deals
               WHERE contact_id = $1 AND user_id = $2 AND stage NOT IN ('closed_won', 'closed_lost')
               ORDER BY updated_at DESC LIMIT 1""",
            contact_id, user_id,
        )

        importance_tier = rel['importance_tier'] or 3
        health_score = float(rel['health_score'] or 70)
        job_title = (contact['job_title'] or '').lower() if contact and contact['job_title'] else ''

        influence_score = _clamp((6 - importance_tier) * 15 + min(40, len(connections) * 10))
        decision_authority = (
            'high' if any(k in job_title for k in _DECISION_KEYWORDS_HIGH) else
            'medium' if any(k in job_title for k in _DECISION_KEYWORDS_MEDIUM) else
            'unknown' if not job_title else 'low'
        )
        likelihood_to_buy_again = _clamp(
            (health_score + float(open_deal['probability'])) / 2 if open_deal else health_score
        )
        referral_probability = _clamp(
            max((float(c['confidence']) * 100 for c in referral_connections), default=health_score * 0.6)
        )
        overall_score = round(_clamp(
            0.4 * likelihood_to_buy_again + 0.3 * influence_score + 0.3 * referral_probability
        ))
        strategic_value = (
            'very_high' if overall_score >= 85 else
            'high' if overall_score >= 65 else
            'medium' if overall_score >= 40 else 'low'
        )

        return {
            'financialValueCents': financial_value_cents,
            'referralValueCents': referral_value_cents,
            'influenceScore': round(influence_score),
            'decisionAuthority': decision_authority,
            'likelihoodToBuyAgain': round(likelihood_to_buy_again),
            'referralProbability': round(referral_probability),
            'strategicValue': strategic_value,
            'overallScore': overall_score,
        }

    async def _compute_personal(self, conn, contact_id, user_id, rel) -> dict:
        directions = await conn.fetch(
            """SELECT m.sender_type, ma.sentiment
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               LEFT JOIN message_analyses ma ON ma.message_id = m.id
               WHERE c.contact_id = $1 AND c.user_id = $2
                 AND m.whatsapp_timestamp > NOW() - INTERVAL '90 days'
               ORDER BY m.whatsapp_timestamp ASC""",
            contact_id, user_id,
        )
        user_msgs = sum(1 for d in directions if d['sender_type'] == 'user')
        contact_msgs = sum(1 for d in directions if d['sender_type'] == 'contact')
        total = user_msgs + contact_msgs

        reciprocity_score = (
            _clamp(100 - abs(user_msgs - contact_msgs) / total * 100) if total else 50.0
        )

        # "Showing up during hard times" — a negative-sentiment message from
        # one side followed within the next 3 messages by a reply from the
        # other side, in either direction.
        support_given = sum(
            1 for i, d in enumerate(directions)
            if d['sender_type'] == 'contact' and d['sentiment'] == 'negative'
            and any(o['sender_type'] == 'user' for o in directions[i + 1:i + 4])
        )
        support_received = sum(
            1 for i, d in enumerate(directions)
            if d['sender_type'] == 'user' and d['sentiment'] == 'negative'
            and any(o['sender_type'] == 'contact' for o in directions[i + 1:i + 4])
        )

        importance_tier = rel['importance_tier'] or 3
        health_score = float(rel['health_score'] or 70)
        closeness_score = _clamp((6 - importance_tier) * 15 + health_score * 0.4)
        social_influence = 'high' if importance_tier <= 2 else 'medium' if importance_tier == 3 else 'low'
        overall_score = round(_clamp(0.5 * closeness_score + 0.5 * reciprocity_score))

        return {
            'closenessScore': round(closeness_score),
            'reciprocityScore': round(reciprocity_score),
            'supportGivenCount': support_given,
            'supportReceivedCount': support_received,
            'socialInfluenceInYourLife': social_influence,
            'overallScore': overall_score,
        }
