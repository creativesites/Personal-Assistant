import structlog
from datetime import datetime, timezone
from ..database import get_pool
from .opportunities import OpportunityService
from ..models import OpportunityMention

log = structlog.get_logger()

# Relative importance of each signal — see docs/RELATIONSHIP_OS_PLAN.md §5.1.
# Each signal is normalized to -1.0..+1.0 before being weighted, so the sum of
# weights bounds the maximum possible swing: at SCALE=30, a relationship
# where every signal is maximally negative drops 30 points from base; every
# signal maximally positive raises it 30 points.
WEIGHTS = {
    'recency': 0.30,
    'frequency': 0.20,
    'sentiment': 0.20,
    'responsiveness': 0.15,
    'pipeline_velocity': 0.15,
    # Added plan §15 Phase 4 — a small weight rather than rebalancing the
    # others, so existing scores don't shift for relationships with no
    # document activity (signal is 0.0 there, contributing nothing).
    'documents': 0.10,
}
SCALE = 30
BASE_SCORE = 70
PROACTIVE_BONUS = 2

STAGE_STALL_THRESHOLD_DAYS = {
    'discovery': 14, 'qualified': 14, 'proposal': 21, 'negotiation': 14,
}

FACTOR_LABELS = {
    'recency': 'time since last message',
    'frequency': 'message frequency',
    'sentiment': 'conversation tone',
    'responsiveness': 'reply speed',
    'pipeline_velocity': 'deal progress',
    'documents': 'document activity',
}


def _clamp(value: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


class RelationshipHealthService:
    async def recalculate(self, contact_id: str, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rel = await conn.fetchrow(
                """SELECT id, health_score, dormancy_alert_days, importance_tier
                   FROM relationships WHERE contact_id = $1 AND user_id = $2""",
                contact_id, user_id,
            )
            if not rel:
                return 70

            last_msg = await conn.fetchrow(
                """SELECT m.whatsapp_timestamp,
                          AVG(CASE ma.sentiment
                              WHEN 'positive' THEN 1.0
                              WHEN 'neutral'  THEN 0.5
                              WHEN 'mixed'    THEN 0.5
                              ELSE 0.0 END) AS avg_sentiment
                   FROM messages m
                   JOIN conversations c ON c.id = m.conversation_id
                   LEFT JOIN message_analyses ma ON ma.message_id = m.id
                   WHERE c.contact_id = $1 AND c.user_id = $2
                     AND m.whatsapp_timestamp > NOW() - INTERVAL '30 days'
                   ORDER BY m.whatsapp_timestamp DESC
                   LIMIT 1""",
                contact_id, user_id,
            )

            week_count = await conn.fetchval(
                """SELECT COUNT(*) FROM messages m
                   JOIN conversations c ON c.id = m.conversation_id
                   WHERE c.contact_id = $1 AND c.user_id = $2
                     AND m.whatsapp_timestamp > NOW() - INTERVAL '7 days'""",
                contact_id, user_id,
            )

            clock = await conn.fetchrow(
                """SELECT avg_days_between_messages FROM relationship_clocks
                   WHERE contact_id = $1 AND user_id = $2 AND clock_type = 'dormancy_watch'
                   LIMIT 1""",
                contact_id, user_id,
            )

            reply_latency = await conn.fetchrow(
                """WITH ordered AS (
                     SELECT m.whatsapp_timestamp, m.sender_type,
                            LAG(m.whatsapp_timestamp) OVER (ORDER BY m.whatsapp_timestamp) AS prev_ts,
                            LAG(m.sender_type) OVER (ORDER BY m.whatsapp_timestamp) AS prev_sender
                     FROM messages m
                     JOIN conversations c ON c.id = m.conversation_id
                     WHERE c.contact_id = $1 AND c.user_id = $2 AND m.is_deleted = false
                       AND m.whatsapp_timestamp > NOW() - INTERVAL '74 days'
                   )
                   SELECT
                     AVG(EXTRACT(EPOCH FROM (whatsapp_timestamp - prev_ts)) / 3600)
                       FILTER (WHERE sender_type = 'contact' AND prev_sender = 'user'
                                 AND whatsapp_timestamp > NOW() - INTERVAL '14 days') AS recent_hours,
                     AVG(EXTRACT(EPOCH FROM (whatsapp_timestamp - prev_ts)) / 3600)
                       FILTER (WHERE sender_type = 'contact' AND prev_sender = 'user'
                                 AND whatsapp_timestamp <= NOW() - INTERVAL '14 days') AS baseline_hours
                   FROM ordered""",
                contact_id, user_id,
            )

            open_deal = await conn.fetchrow(
                """SELECT stage, entered_stage_at FROM deals
                   WHERE contact_id = $1 AND user_id = $2 AND stage NOT IN ('closed_won', 'closed_lost')
                   ORDER BY updated_at DESC LIMIT 1""",
                contact_id, user_id,
            )

            recent_proactive = await conn.fetchval(
                """SELECT COUNT(*) FROM proactive_queue
                   WHERE contact_id = $1 AND user_id = $2 AND status IN ('approved', 'sent')
                     AND updated_at > NOW() - INTERVAL '7 days'""",
                contact_id, user_id,
            )

            # Documents (plan §15 Phase 4) — an overdue unpaid invoice or a
            # recently accepted quotation/proposal is a stronger relationship
            # signal than most messages, so it feeds health directly.
            document_signal = await conn.fetchrow(
                """SELECT
                     EXISTS (
                       SELECT 1 FROM documents
                       WHERE contact_id = $1 AND user_id = $2 AND document_type = 'invoice'
                         AND status NOT IN ('paid', 'archived')
                         AND structured_data->>'dueDate' IS NOT NULL
                         AND (structured_data->>'dueDate')::date < CURRENT_DATE
                     ) AS has_overdue_invoice,
                     EXISTS (
                       SELECT 1 FROM documents
                       WHERE contact_id = $1 AND user_id = $2 AND document_type IN ('quotation', 'proposal')
                         AND status = 'accepted' AND updated_at > NOW() - INTERVAL '30 days'
                     ) AS has_recent_acceptance""",
                contact_id, user_id,
            )

        now = datetime.now(tz=timezone.utc)
        dormancy = rel['dormancy_alert_days'] or 30
        old_score = rel['health_score'] or 70

        if last_msg and last_msg['whatsapp_timestamp']:
            days_silent = (now - last_msg['whatsapp_timestamp'].replace(tzinfo=timezone.utc)).days
        else:
            days_silent = 999

        signals: dict[str, float] = {}
        notes: dict[str, str] = {}

        # Recency
        if days_silent <= 3:
            signals['recency'] = 1.0
            notes['recency'] = f'Messaged {days_silent} day(s) ago'
        elif days_silent <= 7:
            signals['recency'] = 0.5
            notes['recency'] = f'Last messaged {days_silent} days ago'
        elif days_silent <= dormancy:
            signals['recency'] = 0.0
            notes['recency'] = f'{days_silent} days since last message'
        elif days_silent <= dormancy * 2:
            signals['recency'] = -0.5
            notes['recency'] = f'{days_silent} days of silence — past the usual gap'
        else:
            signals['recency'] = -1.0
            notes['recency'] = f'{days_silent} days of silence — well past the usual gap'

        # Sentiment
        avg_sent = float(last_msg['avg_sentiment'] or 0.5) if last_msg else 0.5
        signals['sentiment'] = _clamp((avg_sent - 0.5) * 2)
        if signals['sentiment'] > 0.2:
            notes['sentiment'] = 'Mostly positive tone recently'
        elif signals['sentiment'] < -0.2:
            notes['sentiment'] = 'Negative tone detected recently'
        else:
            notes['sentiment'] = 'Neutral tone recently'

        # Frequency — this week vs this relationship's own learned cadence
        avg_days_between = float(clock['avg_days_between_messages']) if clock and clock['avg_days_between_messages'] else None
        if avg_days_between and avg_days_between > 0:
            expected_per_week = 7 / avg_days_between
            actual_per_week = int(week_count or 0)
            signals['frequency'] = _clamp((actual_per_week - expected_per_week) / max(expected_per_week, 1))
            diff = actual_per_week - expected_per_week
            if diff >= 1:
                notes['frequency'] = f'More messages this week than usual ({actual_per_week} vs ~{expected_per_week:.0f})'
            elif diff <= -1:
                notes['frequency'] = f'Fewer messages this week than usual ({actual_per_week} vs ~{expected_per_week:.0f})'
            else:
                notes['frequency'] = 'Messaging at the usual rate'
        else:
            signals['frequency'] = 0.0
            notes['frequency'] = 'Not enough history yet to know the usual rate'

        # Responsiveness — are their replies to the user slowing down
        recent_hours = float(reply_latency['recent_hours']) if reply_latency and reply_latency['recent_hours'] else None
        baseline_hours = float(reply_latency['baseline_hours']) if reply_latency and reply_latency['baseline_hours'] else None
        if recent_hours is not None and baseline_hours is not None and baseline_hours > 0:
            signals['responsiveness'] = _clamp((baseline_hours - recent_hours) / baseline_hours)
            if signals['responsiveness'] < -0.2:
                notes['responsiveness'] = 'Replies taking longer than usual'
            elif signals['responsiveness'] > 0.2:
                notes['responsiveness'] = 'Replying faster than usual'
            else:
                notes['responsiveness'] = 'Replying at the usual speed'
        else:
            signals['responsiveness'] = 0.0
            notes['responsiveness'] = 'Not enough reply history yet'

        # Pipeline velocity — business relationships with an open deal only
        if open_deal:
            threshold = STAGE_STALL_THRESHOLD_DAYS.get(open_deal['stage'], 14)
            days_in_stage = (now - open_deal['entered_stage_at'].replace(tzinfo=timezone.utc)).days
            signals['pipeline_velocity'] = _clamp((threshold - days_in_stage) / threshold)
            if days_in_stage > threshold:
                notes['pipeline_velocity'] = f"Deal stalled in {open_deal['stage']} for {days_in_stage} days"
            else:
                notes['pipeline_velocity'] = f"Deal progressing normally ({open_deal['stage']})"
        else:
            signals['pipeline_velocity'] = 0.0
            notes['pipeline_velocity'] = 'No open deal'

        # Documents
        has_overdue = document_signal['has_overdue_invoice']
        has_accepted = document_signal['has_recent_acceptance']
        if has_overdue and has_accepted:
            signals['documents'] = 0.0
            notes['documents'] = 'Mixed — an overdue invoice alongside a recent acceptance'
        elif has_overdue:
            signals['documents'] = -1.0
            notes['documents'] = 'Has an overdue unpaid invoice'
        elif has_accepted:
            signals['documents'] = 1.0
            notes['documents'] = 'Recently accepted a quotation/proposal'
        else:
            signals['documents'] = 0.0
            notes['documents'] = 'No notable document activity'

        weighted = {k: WEIGHTS[k] * signals[k] * SCALE for k in WEIGHTS}
        proactive_bonus = PROACTIVE_BONUS if recent_proactive else 0
        delta = sum(weighted.values()) + proactive_bonus

        new_score = max(0, min(100, round(BASE_SCORE + delta)))

        if new_score > old_score + 3:
            trend = 'improving'
        elif new_score < old_score - 3:
            trend = 'declining'
        else:
            trend = 'stable'

        # "Always tell them why" — pick the 1-2 factors that moved the score
        # the most and phrase them in plain English, instead of a bare number.
        top_factors = sorted(weighted.items(), key=lambda kv: abs(kv[1]), reverse=True)
        top_factors = [(k, v) for k, v in top_factors if abs(v) >= 1]
        if top_factors:
            change_reason = '; '.join(notes[k] for k, _ in top_factors[:2])
        else:
            change_reason = 'Stable — no significant change in ' + ', '.join(FACTOR_LABELS.values())

        contributing_factors = {
            'signals': {k: round(v, 2) for k, v in signals.items()},
            'weighted': {k: round(v, 2) for k, v in weighted.items()},
            'notes': notes,
            'proactiveBonus': proactive_bonus,
            'summary': change_reason,
        }

        churn_flag = False
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE relationships
                   SET health_score = $1, health_trend = $2,
                       last_interaction_at = (
                           SELECT MAX(m.whatsapp_timestamp)
                           FROM messages m
                           JOIN conversations c ON c.id = m.conversation_id
                           WHERE c.contact_id = $4 AND c.user_id = $5
                       ),
                       updated_at = NOW()
                   WHERE id = $3""",
                new_score, trend, rel['id'], contact_id, user_id,
            )
            if new_score != old_score:
                import json

                # Churn/drift risk (§5.9/§6.8) is a presentation change over
                # health decline, not a separate model: flag it once the
                # relationship has declined for 2 consecutive recalculations
                # with negative sentiment or lengthening recency behind it.
                if trend == 'declining' and (signals['sentiment'] < 0 or signals['recency'] < 0):
                    prev_log = await conn.fetchrow(
                        """SELECT health_score, previous_score FROM relationship_health_logs
                           WHERE relationship_id = $1 ORDER BY logged_at DESC LIMIT 1""",
                        rel['id'],
                    )
                    if prev_log and prev_log['previous_score'] is not None and prev_log['health_score'] < prev_log['previous_score']:
                        churn_flag = True

                await conn.execute(
                    """INSERT INTO relationship_health_logs
                       (relationship_id, health_score, previous_score, change_reason, contributing_factors)
                       VALUES ($1, $2, $3, $4, $5)""",
                    rel['id'], new_score, old_score, change_reason, json.dumps(contributing_factors),
                )

        if churn_flag:
            await OpportunityService().record_candidates(
                user_id, contact_id, f'health-decline-{rel["id"]}',
                [OpportunityMention(
                    opportunity_type='churn_risk',
                    title='Health declining for two straight check-ins',
                    description=change_reason,
                    confidence=0.6,
                )],
            )

        log.info('health_recalculated', contact_id=contact_id, score=new_score, trend=trend, reason=change_reason, churn_flag=churn_flag)
        return new_score
