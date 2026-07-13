"""Pricing benchmarks (plan §9/§15 Phase 4) — periodic SQL aggregation over
documents.structured_data, grouped by contacts.industry, written as
business_facts rows under category='pricing_benchmark'. Deliberately not an
AI call, same reasoning as document_followups.py: an average discount is a
plain aggregate, not something that needs an LLM to compute honestly.

Re-run daily: existing rows for each (user_id, fact_key) are replaced rather
than corroborated via BusinessFactService.record_candidates, since a
discount average naturally drifts run to run and isn't a single-message
"mention" that should raise confidence through repetition.
"""
import structlog

from ..database import get_pool

log = structlog.get_logger()

_MIN_SAMPLE_SIZE = 3  # don't publish a benchmark until there's enough evidence to mean anything


def _benchmark_key(industry: str) -> str:
    return f"pricing_benchmark_discount_{(industry or 'general').lower().replace(' ', '_')}"


class PricingBenchmarkService:
    async def refresh_for_all_users(self) -> int:
        pool = await get_pool()
        updated = 0

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT d.user_id, COALESCE(c.industry, 'general') AS industry,
                       COUNT(*) AS sample_size,
                       AVG(
                         CASE WHEN d.subtotal_cents > 0
                              THEN d.discount_cents::float / d.subtotal_cents * 100
                              ELSE 0 END
                       ) AS avg_discount_pct
                FROM documents d
                LEFT JOIN contacts c ON c.id = d.contact_id
                WHERE d.document_type IN ('quotation', 'invoice')
                  AND d.status NOT IN ('draft', 'archived')
                  AND d.created_at > NOW() - INTERVAL '180 days'
                GROUP BY d.user_id, COALESCE(c.industry, 'general')
                HAVING COUNT(*) >= $1
                """,
                _MIN_SAMPLE_SIZE,
            )

            for row in rows:
                key = _benchmark_key(row['industry'])
                value = f"{row['avg_discount_pct']:.1f}% avg discount ({row['sample_size']} documents)"
                confidence = min(0.95, 0.5 + 0.05 * row['sample_size'])

                await conn.execute(
                    "DELETE FROM business_facts WHERE user_id = $1 AND fact_key = $2", row['user_id'], key,
                )
                await conn.execute(
                    """INSERT INTO business_facts
                         (user_id, category, fact_key, fact_value, confidence, evidence_count,
                          source, is_approved, approved_at)
                       VALUES ($1, 'pricing_benchmark', $2, $3, $4, $5, 'aggregation', TRUE, NOW())""",
                    row['user_id'], key, value, confidence, row['sample_size'],
                )
                updated += 1

        log.info('pricing_benchmarks_refreshed', count=updated)
        return updated
