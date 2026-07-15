"""Inventory forecasting (plan §7.3) — periodic SQL aggregation over
stock_movements 'sale' rows, extrapolated against current stock and
supplier lead time. Deliberately not an AI call, same reasoning as
pricing_benchmarks.py and document_followups.py: a sales-velocity
extrapolation is a plain rate computation, not something that needs an LLM
to do honestly.

Explicitly deferred-but-built: the plan notes this needs 2-3 months of real
stock_movements history to be useful (§18) — it degrades gracefully to "no
forecast" for products with no sale movements in the trailing window
rather than guessing from nothing.
"""
import structlog
from datetime import date, timedelta

from ..database import get_pool

log = structlog.get_logger()

_VELOCITY_WINDOW_DAYS = 30
_SAFETY_BUFFER_DAYS = 14  # order enough to cover lead time plus this much cushion
_DEFAULT_LEAD_TIME_DAYS = 5


class InventoryForecastService:
    async def generate_for_all_users(self) -> int:
        pool = await get_pool()
        updated = 0

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id AS product_id, p.available, p.purchase_cost, p.supplier_lead_time,
                       SUM(-sm.quantity_delta)::float / $1 AS daily_velocity
                FROM products p
                JOIN stock_movements sm ON sm.product_id = p.id
                  AND sm.movement_type = 'sale'
                  AND sm.created_at > NOW() - make_interval(days => $1)
                WHERE p.item_type != 'service'
                GROUP BY p.id, p.available, p.purchase_cost, p.supplier_lead_time
                HAVING SUM(-sm.quantity_delta) > 0
                """,
                _VELOCITY_WINDOW_DAYS,
            )

            today = date.today()

            for row in rows:
                velocity = row['daily_velocity']
                if velocity <= 0:
                    continue

                days_of_stock_left = row['available'] / velocity
                expected_stockout_date = today + timedelta(days=days_of_stock_left)
                lead_time = row['supplier_lead_time'] or _DEFAULT_LEAD_TIME_DAYS
                recommended_order_date = expected_stockout_date - timedelta(days=lead_time)

                coverage_days = lead_time + _SAFETY_BUFFER_DAYS
                target_qty = velocity * coverage_days
                recommended_order_qty = max(0, round(target_qty - row['available']))
                cash_required = round(recommended_order_qty * float(row['purchase_cost'] or 0), 2)

                await conn.execute(
                    """INSERT INTO inventory_forecasts
                         (product_id, expected_stockout_date, recommended_order_qty,
                          recommended_order_date, cash_required, computed_at)
                       VALUES ($1, $2, $3, $4, $5, NOW())
                       ON CONFLICT (product_id) DO UPDATE SET
                         expected_stockout_date = EXCLUDED.expected_stockout_date,
                         recommended_order_qty = EXCLUDED.recommended_order_qty,
                         recommended_order_date = EXCLUDED.recommended_order_date,
                         cash_required = EXCLUDED.cash_required,
                         computed_at = NOW()""",
                    row['product_id'], expected_stockout_date, recommended_order_qty,
                    recommended_order_date, cash_required,
                )
                updated += 1

        log.info('inventory_forecasts_refreshed', count=updated)
        return updated
