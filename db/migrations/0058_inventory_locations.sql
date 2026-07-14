-- Business OS Phase C — multi-location inventory. See docs/BUSINESS_OS_PLAN.md §7.
--
-- Single-location businesses (the common case) never see a location
-- picker: every user gets one auto-created "Main" default location here,
-- backfilled with their current products.stock/reserved, so nothing
-- changes for them. products.stock/reserved/available stay the
-- cross-location aggregate, kept in sync by the API layer on every
-- movement — same denormalized-cache convention deals.pipeline_stage
-- already established, not a DB trigger.

CREATE TABLE IF NOT EXISTS inventory_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_default
  ON inventory_locations(user_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS product_stock_by_location (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  stock       INT NOT NULL DEFAULT 0,
  reserved    INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_by_location_location ON product_stock_by_location(location_id);

-- Backfill: one default "Main" location per existing user...
INSERT INTO inventory_locations (user_id, name, is_default)
SELECT id, 'Main', true FROM users
ON CONFLICT (user_id, name) DO NOTHING;

-- ...and one stock-by-location row per existing product, seeded from its
-- current aggregate stock/reserved.
INSERT INTO product_stock_by_location (product_id, location_id, stock, reserved)
SELECT p.id, l.id, p.stock, p.reserved
FROM products p
JOIN inventory_locations l ON l.user_id = p.user_id AND l.is_default = true
ON CONFLICT (product_id, location_id) DO NOTHING;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(location_id) WHERE location_id IS NOT NULL;

-- Expanded movement vocabulary (in_transit already added in migration 0057).
-- `damaged` stays folded into `waste` per plan §19 open-decision #3 — not
-- worth a migration until a user actually asks to distinguish them.
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'committed';
