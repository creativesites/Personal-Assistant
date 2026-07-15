-- Business OS Phase G — inventory forecasting (see docs/BUSINESS_OS_PLAN.md
-- §7.3). Not a new movement source: a scheduled intelligence-service job
-- computes sales velocity from existing stock_movements ('sale' rows) and
-- writes one row per product here, upserted on every run. studio/insights
-- reads this instead of a raw low-stock threshold for "will stock out soon."

CREATE TABLE IF NOT EXISTS inventory_forecasts (
  product_id             UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  expected_stockout_date DATE,
  recommended_order_qty  INT,
  recommended_order_date DATE,
  cash_required          DECIMAL(12,2),
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_forecasts_stockout ON inventory_forecasts(expected_stockout_date)
  WHERE expected_stockout_date IS NOT NULL;
