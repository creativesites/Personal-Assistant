"""
Analytics Engine — Phase 9.

Generates periodic analytics snapshots and proactive impact reports.
Handles suggestion acceptance rate computation, monthly digests, and
funnel conversion tracking.
"""

import structlog
from datetime import datetime, timezone, timedelta
from ..database import get_pool

log = structlog.get_logger()


async def compute_suggestion_acceptance_rate(user_id: str, days: int = 30) -> dict:
    """
    Compute how often the user accepts, edits, rejects, or ignores AI reply suggestions.

    Queries suggestion_outcomes for the rolling window defined by `days`.
    Returns a dict with keys: approved, edited, rejected, ignored, total, acceptance_rate.
    acceptance_rate is (approved + edited) / total, representing useful AI suggestions.
    """
    pool = await get_pool()
    since = datetime.now(tz=timezone.utc) - timedelta(days=days)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT outcome, COUNT(*) AS count
            FROM suggestion_outcomes
            WHERE user_id = $1 AND created_at >= $2
            GROUP BY outcome
            """,
            user_id,
            since,
        )

    counts: dict[str, int] = {
        'approved': 0,
        'edited': 0,
        'rejected': 0,
        'ignored': 0,
    }
    for row in rows:
        outcome = row['outcome']
        if outcome in counts:
            counts[outcome] = int(row['count'])

    total = sum(counts.values())
    # Approved + edited = AI suggestion was useful to the user
    acceptance_rate = round((counts['approved'] + counts['edited']) / total, 4) if total > 0 else 0.0

    result = {
        **counts,
        'total': total,
        'acceptance_rate': acceptance_rate,
        'period_days': days,
    }

    log.info(
        'suggestion_acceptance_rate_computed',
        user_id=user_id,
        days=days,
        total=total,
        acceptance_rate=acceptance_rate,
    )
    return result


async def generate_monthly_digest(user_id: str) -> dict:
    """
    Compile a monthly activity and impact digest for the user.

    Aggregates: new contacts, messages processed, suggestions generated and accepted,
    proactive items approved, and relationship health changes over the past 30 days.
    Stores the result in analytics_snapshots and returns the digest dict.
    """
    pool = await get_pool()
    now = datetime.now(tz=timezone.utc)
    period_start = now - timedelta(days=30)

    async with pool.acquire() as conn:
        # New contacts added this month
        new_contacts = await conn.fetchval(
            'SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND created_at >= $2',
            user_id,
            period_start,
        )

        # Messages processed (inbound from contacts)
        messages_processed = await conn.fetchval(
            """
            SELECT COUNT(m.id)
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = $1
              AND m.sender_type = 'contact'
              AND m.created_at >= $2
            """,
            user_id,
            period_start,
        )

        # Suggestions generated
        suggestions_generated = await conn.fetchval(
            """
            SELECT COUNT(sr.id)
            FROM suggested_replies sr
            JOIN messages m ON m.id = sr.message_id
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = $1 AND sr.created_at >= $2
            """,
            user_id,
            period_start,
        )

        # Suggestions accepted or edited (from suggestion_outcomes)
        suggestions_accepted = await conn.fetchval(
            """
            SELECT COUNT(*) FROM suggestion_outcomes
            WHERE user_id = $1
              AND outcome IN ('approved', 'edited')
              AND created_at >= $2
            """,
            user_id,
            period_start,
        )

        # Proactive items approved
        proactive_approved = await conn.fetchval(
            """
            SELECT COUNT(*) FROM proactive_queue
            WHERE user_id = $1
              AND status = 'approved'
              AND updated_at >= $2
            """,
            user_id,
            period_start,
        )

        # Average relationship health score now vs 30 days ago
        health_now = await conn.fetchval(
            'SELECT ROUND(AVG(health_score), 1) FROM relationships WHERE user_id = $1',
            user_id,
        )
        # Previous average: latest log entry per relationship before period_start
        health_prev = await conn.fetchval(
            """
            SELECT ROUND(AVG(latest_score), 1)
            FROM (
                SELECT DISTINCT ON (r.id)
                    rhl.health_score AS latest_score
                FROM relationships r
                JOIN relationship_health_logs rhl ON rhl.relationship_id = r.id
                WHERE r.user_id = $1 AND rhl.logged_at <= $2
                ORDER BY r.id, rhl.logged_at DESC
            ) sub
            """,
            user_id,
            period_start,
        )

        # Number of relationships with improved health over the period
        health_improved = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT r.id)
            FROM relationships r
            JOIN LATERAL (
                SELECT health_score
                FROM relationship_health_logs rhl
                WHERE rhl.relationship_id = r.id AND rhl.logged_at <= $2
                ORDER BY rhl.logged_at DESC
                LIMIT 1
            ) prev_log ON true
            WHERE r.user_id = $1 AND r.health_score > prev_log.health_score
            """,
            user_id,
            period_start,
        )

    health_delta = None
    if health_now is not None and health_prev is not None:
        health_delta = float(health_now) - float(health_prev)

    digest = {
        'period_start': period_start.isoformat(),
        'period_end': now.isoformat(),
        'new_contacts': int(new_contacts or 0),
        'messages_processed': int(messages_processed or 0),
        'suggestions_generated': int(suggestions_generated or 0),
        'suggestions_accepted': int(suggestions_accepted or 0),
        'proactive_approved': int(proactive_approved or 0),
        'avg_health_score_now': float(health_now) if health_now is not None else None,
        'avg_health_score_prev': float(health_prev) if health_prev is not None else None,
        'avg_health_delta': round(health_delta, 1) if health_delta is not None else None,
        'relationships_health_improved': int(health_improved or 0),
    }

    # Persist snapshot
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO analytics_snapshots (user_id, snapshot_type, period_start, period_end, data)
            VALUES ($1, 'monthly_digest', $2, $3, $4)
            """,
            user_id,
            period_start,
            now,
            digest,
        )

    log.info(
        'monthly_digest_generated',
        user_id=user_id,
        messages_processed=digest['messages_processed'],
        suggestions_accepted=digest['suggestions_accepted'],
    )
    return digest


async def track_funnel_conversion(user_id: str) -> list[dict]:
    """
    Compute conversion rates across the sales/relationship funnel stages.

    Queries conversation_funnel_stages to count how many conversations are in
    each stage, how many exited (moved to the next), and the conversion rate
    between adjacent stages.

    Returns a list of dicts ordered by funnel progression, each with:
    stage, count, exited_count, conversion_rate (exited / count).
    """
    # Canonical funnel order
    funnel_order = [
        'lead',
        'qualified',
        'opportunity',
        'proposal',
        'closed_won',
        'closed_lost',
        'churned',
    ]

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                stage,
                COUNT(*) AS total_entered,
                COUNT(exited_at) AS total_exited
            FROM conversation_funnel_stages
            WHERE user_id = $1
            GROUP BY stage
            """,
            user_id,
        )

    stage_map: dict[str, dict] = {}
    for row in rows:
        stage_map[row['stage']] = {
            'stage': row['stage'],
            'count': int(row['total_entered']),
            'exited_count': int(row['total_exited']),
        }

    result: list[dict] = []
    for stage in funnel_order:
        entry = stage_map.get(stage, {'stage': stage, 'count': 0, 'exited_count': 0})
        count = entry['count']
        exited = entry['exited_count']
        conversion_rate = round(exited / count, 4) if count > 0 else 0.0
        result.append({
            'stage': stage,
            'count': count,
            'exited_count': exited,
            'conversion_rate': conversion_rate,
        })

    # Append any custom stages not in the canonical order
    for stage, entry in stage_map.items():
        if stage not in funnel_order:
            count = entry['count']
            exited = entry['exited_count']
            result.append({
                'stage': stage,
                'count': count,
                'exited_count': exited,
                'conversion_rate': round(exited / count, 4) if count > 0 else 0.0,
            })

    log.info(
        'funnel_conversion_computed',
        user_id=user_id,
        stages=len(result),
    )
    return result
