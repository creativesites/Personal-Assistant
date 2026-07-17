"""Zuri Neural Layer — Reflection Engine (docs/NEURAL_LAYER_PLAN.md §4.7).

Fully net-new: nothing like this existed before this phase. A weekly job
synthesizes what changed for a user, purely from signal sources every
other engine already produces — no new detection pass, no LLM call. Each
highlight only appears if the underlying signal actually crossed a
meaningful threshold; a quiet week produces fewer highlights, not
padded/invented ones.
"""
import json
import structlog
from datetime import date, timedelta

from ..database import get_pool

log = structlog.get_logger()

_MIN_EMOTIONAL_SIGNALS = 3
_EMOTIONAL_DELTA_THRESHOLD = 0.15
_LATENCY_CHANGE_THRESHOLD = 0.2  # 20% faster/slower to be worth mentioning
_MIN_SAMPLE_PER_BUCKET = 3  # quote-latency-vs-conversion insight (§7.1)


class ReflectionService:
    async def generate_for_all_users(self, period_type: str = 'weekly') -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user_ids = await conn.fetch('SELECT id FROM users')

        generated = 0
        for row in user_ids:
            highlights = await self._build_highlights(str(row['id']), period_type)
            await self._save(str(row['id']), period_type, highlights)
            generated += 1

        log.info('reflection_summaries_generated', period_type=period_type, count=generated)
        return generated

    async def _period_bounds(self, period_type: str) -> tuple[date, date]:
        today = date.today()
        if period_type == 'quarterly':
            return today - timedelta(days=90), today
        if period_type == 'monthly':
            return today - timedelta(days=30), today
        if period_type == 'daily':
            return today - timedelta(days=1), today
        return today - timedelta(days=7), today  # weekly (default)

    async def _build_highlights(self, user_id: str, period_type: str) -> list[dict]:
        period_start, period_end = await self._period_bounds(period_type)
        window_days = (period_end - period_start).days
        highlights: list[dict] = []

        pool = await get_pool()
        async with pool.acquire() as conn:
            # Emotional trend — reuses emotional_signals (Neural Layer Phase 1),
            # no new signal invented.
            emo = await conn.fetchrow(
                """SELECT
                     AVG(valence) FILTER (WHERE created_at >= $2) AS current_avg,
                     AVG(valence) FILTER (WHERE created_at < $2 AND created_at >= $2 - ($3 || ' days')::interval) AS prior_avg,
                     COUNT(*) FILTER (WHERE created_at >= $2) AS current_count
                   FROM emotional_signals WHERE user_id = $1""",
                user_id, period_start, window_days,
            )
            if emo and emo['current_count'] and emo['current_count'] >= _MIN_EMOTIONAL_SIGNALS and emo['prior_avg'] is not None:
                delta = float(emo['current_avg']) - float(emo['prior_avg'])
                if delta > _EMOTIONAL_DELTA_THRESHOLD:
                    highlights.append({
                        'category': 'emotional', 'text': 'Your conversations trended more positive this period.',
                        'evidence': [f"Average tone moved from {float(emo['prior_avg']):.2f} to {float(emo['current_avg']):.2f} (valence, -1..1)"],
                    })
                elif delta < -_EMOTIONAL_DELTA_THRESHOLD:
                    highlights.append({
                        'category': 'emotional', 'text': 'Things felt a bit heavier in your conversations this period.',
                        'evidence': [f"Average tone moved from {float(emo['prior_avg']):.2f} to {float(emo['current_avg']):.2f} (valence, -1..1)"],
                    })

            # Relationship health improvements — relationship_health_logs
            # (rOS, shipped), top 3 by total positive delta in the window.
            improved = await conn.fetch(
                """SELECT COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                          SUM(rhl.health_score - rhl.previous_score) AS total_delta
                   FROM relationship_health_logs rhl
                   JOIN relationships r ON r.id = rhl.relationship_id
                   JOIN contacts c ON c.id = r.contact_id
                   WHERE r.user_id = $1 AND rhl.logged_at >= $2
                   GROUP BY contact_name
                   HAVING SUM(rhl.health_score - rhl.previous_score) > 0
                   ORDER BY total_delta DESC LIMIT 3""",
                user_id, period_start,
            )
            for row in improved:
                highlights.append({
                    'category': 'relationship',
                    'text': f"Your relationship with {row['contact_name']} improved.",
                    'evidence': [f"Health score up {int(row['total_delta'])} points this period"],
                })

            # Response latency trend — same reply-latency computation
            # health.py already does per-relationship, applied globally.
            latency = await conn.fetchrow(
                """WITH ordered AS (
                     SELECT m.whatsapp_timestamp, m.sender_type,
                            LAG(m.whatsapp_timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.whatsapp_timestamp) AS prev_ts,
                            LAG(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.whatsapp_timestamp) AS prev_sender
                     FROM messages m
                     JOIN conversations c ON c.id = m.conversation_id
                     WHERE c.user_id = $1 AND m.is_deleted = false
                       AND m.whatsapp_timestamp > $2 - ($3 || ' days')::interval
                   )
                   SELECT
                     AVG(EXTRACT(EPOCH FROM (whatsapp_timestamp - prev_ts)) / 3600)
                       FILTER (WHERE sender_type = 'user' AND prev_sender = 'contact' AND whatsapp_timestamp >= $2) AS current_hours,
                     AVG(EXTRACT(EPOCH FROM (whatsapp_timestamp - prev_ts)) / 3600)
                       FILTER (WHERE sender_type = 'user' AND prev_sender = 'contact' AND whatsapp_timestamp < $2) AS prior_hours
                   FROM ordered""",
                user_id, period_start, window_days,
            )
            if latency and latency['current_hours'] and latency['prior_hours']:
                current_h = float(latency['current_hours'])
                prior_h = float(latency['prior_hours'])
                if current_h < prior_h * (1 - _LATENCY_CHANGE_THRESHOLD):
                    highlights.append({
                        'category': 'responsiveness', 'text': "You've been replying faster than usual.",
                        'evidence': [f"Average reply time dropped from {prior_h:.1f}h to {current_h:.1f}h"],
                    })
                elif current_h > prior_h * (1 + _LATENCY_CHANGE_THRESHOLD):
                    highlights.append({
                        'category': 'responsiveness', 'text': 'Your replies have been slower than usual.',
                        'evidence': [f"Average reply time rose from {prior_h:.1f}h to {current_h:.1f}h"],
                    })

            # Completed tasks — project_tasks.completed_at (this migration).
            done_count = await conn.fetchval(
                """SELECT COUNT(*) FROM project_tasks pt
                   JOIN projects p ON p.id = pt.project_id
                   WHERE p.user_id = $1 AND pt.completed_at >= $2""",
                user_id, period_start,
            )
            if done_count:
                highlights.append({
                    'category': 'projects',
                    'text': f"You completed {done_count} task{'s' if done_count != 1 else ''} this period.",
                    'evidence': [],
                })

            # Goal progress — achieved goals first, else just an activity count.
            achieved = await conn.fetch(
                """SELECT title FROM goal_profiles
                   WHERE user_id = $1 AND status = 'achieved' AND updated_at >= $2""",
                user_id, period_start,
            )
            for row in achieved:
                highlights.append({'category': 'goals', 'text': f"You achieved your goal: {row['title']}.", 'evidence': []})

            if not achieved:
                event_count = await conn.fetchval(
                    """SELECT COUNT(*) FROM goal_events ge
                       JOIN goal_profiles gp ON gp.id = ge.goal_id
                       WHERE gp.user_id = $1 AND ge.created_at >= $2""",
                    user_id, period_start,
                )
                if event_count:
                    highlights.append({
                        'category': 'goals',
                        'text': f"{event_count} update{'s' if event_count != 1 else ''} on your goals this period.",
                        'evidence': [],
                    })

            # Deals closed — revenue_events (already exists).
            deal_row = await conn.fetchrow(
                """SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_cents), 0) AS total_cents
                   FROM revenue_events WHERE user_id = $1 AND event_type = 'deal_closed' AND created_at >= $2""",
                user_id, period_start,
            )
            if deal_row and deal_row['cnt']:
                amount = float(deal_row['total_cents']) / 100
                highlights.append({
                    'category': 'business',
                    'text': f"You closed {deal_row['cnt']} deal{'s' if deal_row['cnt'] != 1 else ''} this period.",
                    'evidence': [f"Total value {amount:,.2f}"],
                })

            # Career & Growth Engine Phase 7 (docs/CAREER_GROWTH_ENGINE_PLAN.md
            # §12) — opportunities detected/applied/interviewed this period.
            # Same "reuse an existing signal, no new detection pass"
            # discipline as every other category above.
            career_row = await conn.fetchrow(
                """SELECT
                     COUNT(*) FILTER (WHERE created_at >= $2) AS detected_count,
                     COUNT(*) FILTER (WHERE status = 'applied' AND updated_at >= $2) AS applied_count
                   FROM career_opportunities WHERE user_id = $1""",
                user_id, period_start,
            )
            interview_count = await conn.fetchval(
                'SELECT COUNT(*) FROM career_interviews WHERE user_id = $1 AND created_at >= $2',
                user_id, period_start,
            )
            career_parts = []
            if career_row and career_row['detected_count']:
                career_parts.append(f"{career_row['detected_count']} new opportunit{'ies' if career_row['detected_count'] != 1 else 'y'} detected")
            if career_row and career_row['applied_count']:
                career_parts.append(f"{career_row['applied_count']} application{'s' if career_row['applied_count'] != 1 else ''} submitted")
            if interview_count:
                career_parts.append(f"{interview_count} interview round{'s' if interview_count != 1 else ''} logged")
            if career_parts:
                highlights.append({
                    'category': 'career',
                    'text': f"Career activity this period: {', '.join(career_parts)}.",
                    'evidence': [],
                })

            # Platform Polish Phase 5 (§7.1) — business-facing highlights:
            # invoices sent/paid this period, and sales trend vs the prior
            # period of the same length. Same "reuse an existing signal"
            # discipline as every category above.
            invoice_row = await conn.fetchrow(
                """SELECT COUNT(*) FILTER (WHERE sent_at >= $2) AS sent_count,
                          COUNT(*) FILTER (WHERE paid_at >= $2) AS paid_count,
                          COALESCE(SUM(total_cents) FILTER (WHERE paid_at >= $2), 0) AS paid_cents
                   FROM documents WHERE user_id = $1 AND document_type = 'invoice'""",
                user_id, period_start,
            )
            if invoice_row and (invoice_row['sent_count'] or invoice_row['paid_count']):
                parts = []
                if invoice_row['sent_count']:
                    parts.append(f"{invoice_row['sent_count']} invoice{'s' if invoice_row['sent_count'] != 1 else ''} sent")
                if invoice_row['paid_count']:
                    parts.append(f"{invoice_row['paid_count']} paid ({float(invoice_row['paid_cents']) / 100:,.2f})")
                highlights.append({
                    'category': 'business',
                    'text': f"Invoicing this period: {', '.join(parts)}.",
                    'evidence': [],
                })

            sales_row = await conn.fetchrow(
                """SELECT
                     COALESCE(SUM(amount_cents) FILTER (WHERE created_at >= $2), 0) AS current_cents,
                     COALESCE(SUM(amount_cents) FILTER (WHERE created_at < $2 AND created_at >= $2 - ($3 || ' days')::interval), 0) AS prior_cents
                   FROM revenue_events WHERE user_id = $1""",
                user_id, period_start, window_days,
            )
            if sales_row and sales_row['prior_cents'] and sales_row['current_cents']:
                current_cents, prior_cents = float(sales_row['current_cents']), float(sales_row['prior_cents'])
                pct_change = (current_cents - prior_cents) / prior_cents * 100
                if abs(pct_change) >= 10:
                    direction = 'up' if pct_change > 0 else 'down'
                    highlights.append({
                        'category': 'business',
                        'text': f"Sales trended {direction} {abs(pct_change):.0f}% vs the prior period.",
                        'evidence': [f"{current_cents / 100:,.2f} this period vs {prior_cents / 100:,.2f} prior"],
                    })

            correlation = await self._quote_latency_conversion_insight(conn, user_id)
            if correlation:
                highlights.append(correlation)

        return highlights

    async def _quote_latency_conversion_insight(self, conn, user_id: str) -> dict | None:
        """The founder's own worked example (plan §7.1): "customers who
        received quotations within 30 minutes converted twice as often."
        One bounded, all-time aggregation — not a general correlation
        engine — bucketing quotations by how long they sat between being
        generated and actually sent, correlated with whether that contact's
        deal ultimately closed. Deliberately all-time rather than
        period-scoped, since a single week rarely has enough quotations per
        bucket to say anything honest."""
        row = await conn.fetchrow(
            """
            WITH quote_latency AS (
              SELECT d.contact_id, EXTRACT(EPOCH FROM (d.sent_at - d.created_at)) / 60 AS latency_minutes
              FROM documents d
              WHERE d.user_id = $1 AND d.document_type = 'quotation' AND d.sent_at IS NOT NULL AND d.contact_id IS NOT NULL
            ),
            bucketed AS (
              SELECT ql.contact_id, ql.latency_minutes < 30 AS is_fast,
                     EXISTS (
                       SELECT 1 FROM deals dl WHERE dl.contact_id = ql.contact_id AND dl.user_id = $1 AND dl.stage = 'closed_won'
                     ) AS closed_won
              FROM quote_latency ql
            )
            SELECT
              COUNT(*) FILTER (WHERE is_fast) AS fast_count,
              COUNT(*) FILTER (WHERE is_fast AND closed_won) AS fast_won,
              COUNT(*) FILTER (WHERE NOT is_fast) AS slow_count,
              COUNT(*) FILTER (WHERE NOT is_fast AND closed_won) AS slow_won
            FROM bucketed
            """,
            user_id,
        )
        if not row or row['fast_count'] < _MIN_SAMPLE_PER_BUCKET or row['slow_count'] < _MIN_SAMPLE_PER_BUCKET:
            return None
        fast_rate = row['fast_won'] / row['fast_count']
        slow_rate = row['slow_won'] / row['slow_count']
        if fast_rate <= slow_rate:
            return None  # only surface when the data actually supports "faster is better" — never invent the story
        return {
            'category': 'business',
            'text': f"Customers who got a quotation within 30 minutes converted at {fast_rate * 100:.0f}%, vs {slow_rate * 100:.0f}% for slower quotes.",
            'evidence': [f"{row['fast_count']} fast quote(s), {row['slow_count']} slower quote(s)"],
        }

    async def _save(self, user_id: str, period_type: str, highlights: list[dict]) -> None:
        period_start, period_end = await self._period_bounds(period_type)
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO reflection_summaries (user_id, period_type, period_start, period_end, highlights)
                   VALUES ($1, $2, $3, $4, $5)""",
                user_id, period_type, period_start, period_end, json.dumps(highlights),
            )
