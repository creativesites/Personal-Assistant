"""Zuri Neural Layer — Prediction Engine (docs/NEURAL_LAYER_PLAN.md §4.8).

Consolidates three predictors that already existed independently
(`inventory_forecast.py`'s stockout extrapolation, `clock_engine.py`'s
replacement-date prediction, `health.py`'s churn-risk flagging) behind one
shared contract, plus one genuinely new prediction (purchase-likelihood
scoring for CRM). The value here is the contract, not a shared algorithm —
stockout extrapolation and churn-risk scoring are legitimately different
math, so each existing predictor gets a thin read adapter over its
already-materialized result rather than being rewritten.
"""
from datetime import datetime, timezone

from pydantic import BaseModel

from ..database import get_pool


class Prediction(BaseModel):
    subject_type: str        # 'product' | 'contact' | 'project' | 'deal' | 'business_metric' | 'career_opportunity'
    subject_id: str | None
    prediction_type: str     # 'stockout' | 'purchase_likelihood' | 'renewal_due' | 'churn_risk' | 'interview_success_likelihood'
    predicted_value: dict
    confidence: float
    evidence: list[str]
    computed_at: datetime


class PredictionEngine:
    async def predict(self, prediction_type: str, subject_id: str, user_id: str) -> Prediction | None:
        if prediction_type == 'stockout':
            return await self._predict_stockout(subject_id, user_id)
        if prediction_type in ('renewal_due', 'churn_risk'):
            return await self._predict_from_opportunity(prediction_type, subject_id, user_id)
        if prediction_type == 'purchase_likelihood':
            return await self._predict_purchase_likelihood(subject_id, user_id)
        if prediction_type == 'interview_success_likelihood':
            return await self._predict_interview_success(subject_id, user_id)
        return None

    async def _predict_stockout(self, product_id: str, user_id: str) -> Prediction | None:
        """Thin adapter over inventory_forecast.py's already-materialized
        forecast row — no recomputation, just reshaping into the shared
        contract."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT f.expected_stockout_date, f.recommended_order_qty,
                          f.recommended_order_date, f.cash_required, f.computed_at
                   FROM inventory_forecasts f
                   JOIN products p ON p.id = f.product_id
                   WHERE f.product_id = $1 AND p.user_id = $2""",
                product_id, user_id,
            )
        if not row:
            return None
        evidence = ['Trailing 30-day sales velocity extrapolated against current stock']
        if row['expected_stockout_date']:
            evidence.append(f"Expected to stock out around {row['expected_stockout_date']}")
        return Prediction(
            subject_type='product', subject_id=product_id, prediction_type='stockout',
            predicted_value={
                'expectedStockoutDate': str(row['expected_stockout_date']) if row['expected_stockout_date'] else None,
                'recommendedOrderQty': row['recommended_order_qty'],
                'recommendedOrderDate': str(row['recommended_order_date']) if row['recommended_order_date'] else None,
                'cashRequired': float(row['cash_required']) if row['cash_required'] is not None else None,
            },
            confidence=0.7,  # inventory_forecast.py doesn't produce its own confidence value
            evidence=evidence,
            computed_at=row['computed_at'] or datetime.now(timezone.utc),
        )

    async def _predict_from_opportunity(self, prediction_type: str, contact_id: str, user_id: str) -> Prediction | None:
        """Thin adapter over an already-detected opportunity row —
        renewal_due comes from clock_engine.py's replacement-date
        prediction, churn_risk from health.py's inline churn-risk logic.
        Both write to `opportunities` with the same opportunity_type name."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT title, description, confidence, estimated_value_cents, detected_at
                   FROM opportunities
                   WHERE user_id = $1 AND contact_id = $2 AND opportunity_type = $3 AND status = 'open'
                   ORDER BY detected_at DESC LIMIT 1""",
                user_id, contact_id, prediction_type,
            )
        if not row:
            return None
        return Prediction(
            subject_type='contact', subject_id=contact_id, prediction_type=prediction_type,
            predicted_value={
                'title': row['title'],
                'description': row['description'],
                'estimatedValueCents': row['estimated_value_cents'],
            },
            confidence=float(row['confidence']),
            evidence=[row['description']] if row['description'] else [],
            computed_at=row['detected_at'],
        )

    async def _predict_purchase_likelihood(self, contact_id: str, user_id: str) -> Prediction:
        """Genuinely new prediction, built against the contract from day
        one (per the plan's own worked example). Deterministic heuristic —
        same "plain SQL aggregation, not an LLM call" convention as
        pricing_benchmarks.py/inventory_forecast.py — over recent
        contact_products purchase-intent signals and relationship health
        trend."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            signals = await conn.fetchrow(
                """SELECT
                     COUNT(*) FILTER (WHERE relation_type = 'quoted' AND updated_at >= NOW() - INTERVAL '14 days') AS recent_quotes,
                     COUNT(*) FILTER (WHERE relation_type = 'interested' AND updated_at >= NOW() - INTERVAL '30 days') AS recent_interest
                   FROM contact_products
                   WHERE user_id = $1 AND contact_id = $2""",
                user_id, contact_id,
            )
            health = await conn.fetchrow(
                """SELECT health_trend FROM relationships WHERE user_id = $1 AND contact_id = $2""",
                user_id, contact_id,
            )

        confidence = 0.2
        evidence: list[str] = []
        recent_quotes = signals['recent_quotes'] if signals else 0
        recent_interest = signals['recent_interest'] if signals else 0

        if recent_quotes:
            confidence += 0.35
            evidence.append(f"{recent_quotes} quotation(s) in the last 14 days")
        if recent_interest:
            confidence += 0.2
            evidence.append(f"{recent_interest} product(s) marked interested in the last 30 days")
        if health and health['health_trend'] == 'improving':
            confidence += 0.15
            evidence.append('Relationship health trending upward')
        elif health and health['health_trend'] == 'declining':
            confidence -= 0.15
            evidence.append('Relationship health trending downward')

        confidence = max(0.05, min(0.95, confidence))
        if not evidence:
            evidence.append('No recent purchase-intent signals found')

        return Prediction(
            subject_type='contact', subject_id=contact_id, prediction_type='purchase_likelihood',
            predicted_value={'likelihood': round(confidence, 2)},
            confidence=confidence,
            evidence=evidence,
            computed_at=datetime.now(timezone.utc),
        )

    async def _predict_interview_success(self, career_opportunity_id: str, user_id: str) -> Prediction | None:
        """Career & Growth Engine Phase 7 (docs/CAREER_GROWTH_ENGINE_PLAN.md
        §12/§14) — the plan's own named prediction_type adapter. Same
        deterministic-heuristic discipline as purchase_likelihood: plain SQL
        over the user's own past interview outcomes, scoped first to the
        same company (career_coach.py's interview-patterns lookup already
        established that's meaningful), falling back to the user's overall
        track record when there's no company-specific history yet."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            opportunity = await conn.fetchrow(
                'SELECT company_or_org FROM career_opportunities WHERE id = $1 AND user_id = $2',
                career_opportunity_id, user_id,
            )
            if not opportunity:
                return None

            company_stats = None
            if opportunity['company_or_org']:
                company_stats = await conn.fetchrow(
                    """SELECT COUNT(*) FILTER (WHERE ci.outcome = 'passed') AS passed,
                              COUNT(*) FILTER (WHERE ci.outcome IN ('passed', 'failed')) AS decided
                       FROM career_interviews ci JOIN career_opportunities co ON co.id = ci.career_opportunity_id
                       WHERE ci.user_id = $1 AND co.company_or_org ILIKE $2""",
                    user_id, opportunity['company_or_org'],
                )
            overall_stats = await conn.fetchrow(
                """SELECT COUNT(*) FILTER (WHERE outcome = 'passed') AS passed,
                          COUNT(*) FILTER (WHERE outcome IN ('passed', 'failed')) AS decided
                   FROM career_interviews WHERE user_id = $1""",
                user_id,
            )

        evidence: list[str] = []
        if company_stats and company_stats['decided']:
            likelihood = float(company_stats['passed']) / float(company_stats['decided'])
            confidence = 0.6
            evidence.append(f"{company_stats['passed']}/{company_stats['decided']} past round(s) at this company passed")
        elif overall_stats and overall_stats['decided']:
            likelihood = float(overall_stats['passed']) / float(overall_stats['decided'])
            confidence = 0.35
            evidence.append(f"{overall_stats['passed']}/{overall_stats['decided']} past interview round(s) passed overall")
        else:
            likelihood = 0.5
            confidence = 0.15
            evidence.append('No past interview history yet — a neutral baseline')

        return Prediction(
            subject_type='career_opportunity', subject_id=career_opportunity_id,
            prediction_type='interview_success_likelihood',
            predicted_value={'likelihood': round(likelihood, 2)},
            confidence=confidence,
            evidence=evidence,
            computed_at=datetime.now(timezone.utc),
        )
