-- Services Management System (see docs/SERVICES_PROJECTS_PLAN.md). Activates
-- item_type='service' (migration 0049, already CHECK-constrained but never
-- conditioned on anywhere) rather than introducing a parallel services
-- table — products already carries everything an "offering" needs (images,
-- tags, family/attributes, WhatsApp catalog sync, AI negotiation bounds).
--
-- track_inventory is the single conditional that fixes the "services get
-- treated as stocked physical goods" bug across Studio's inventory UI,
-- insights, and forecast job. pricing_model drives the service pricing-model
-- picker; multi-row structures (packages/milestones/capacity/workflow) get
-- their own tables since they're listed/filtered/compared, not edited as a
-- single JSONB blob.

ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(30)
  CHECK (pricing_model IN ('fixed','hourly','daily','subscription','milestone','quote','recurring'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;

-- Backfill: every existing row is a product/bundle today (services didn't
-- exist as a real concept until this migration), so this is a no-op for
-- almost everyone, but it's the correct derivation going forward too.
UPDATE products SET track_inventory = (item_type IN ('product', 'bundle'));

-- Packages (Photography: Basic/Premium/Wedding) and milestone-based pricing
-- (Software Development: Discovery/UI/Backend/Testing/Deployment) share the
-- same shape — a named, priced, orderable row under a service — hence one
-- table with a `kind` discriminator rather than two near-identical tables.
CREATE TABLE IF NOT EXISTS service_pricing_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind        VARCHAR(20) NOT NULL DEFAULT 'package' CHECK (kind IN ('package', 'milestone')),
  name        VARCHAR(255) NOT NULL,
  price       DECIMAL(12,2),
  currency    VARCHAR(10) NOT NULL DEFAULT 'ZMW',
  duration    VARCHAR(100),
  features    JSONB NOT NULL DEFAULT '[]',
  extras      JSONB NOT NULL DEFAULT '[]',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_pricing_tiers_product ON service_pricing_tiers(product_id, sort_order);

-- Capacity ledger — directly mirrors stock_movements (migration 0055)'s
-- proven pattern for physical inventory, applied to "40 hrs/week, 32 booked,
-- 8 available" style capacity instead of unit stock. `available` is a
-- generated column so it can never drift from total_capacity/booked.
CREATE TABLE IF NOT EXISTS service_capacity (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  capacity_unit  VARCHAR(20) NOT NULL DEFAULT 'slots'
                   CHECK (capacity_unit IN ('hours', 'slots', 'bays', 'seats', 'staff', 'days')),
  period_type    VARCHAR(20) NOT NULL DEFAULT 'week'
                   CHECK (period_type IN ('day', 'week', 'month', 'ongoing')),
  total_capacity NUMERIC(10,2) NOT NULL DEFAULT 0,
  booked         NUMERIC(10,2) NOT NULL DEFAULT 0,
  available      NUMERIC(10,2) GENERATED ALWAYS AS (total_capacity - booked) STORED,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, period_type)
);
CREATE INDEX IF NOT EXISTS idx_service_capacity_product ON service_capacity(product_id);

CREATE TABLE IF NOT EXISTS service_capacity_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capacity_id     UUID NOT NULL REFERENCES service_capacity(id) ON DELETE CASCADE,
  movement_type   VARCHAR(20) NOT NULL CHECK (movement_type IN ('book', 'release', 'adjust')),
  quantity_delta  NUMERIC(10,2) NOT NULL,
  previous_booked NUMERIC(10,2) NOT NULL,
  new_booked      NUMERIC(10,2) NOT NULL,
  reason          TEXT,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_capacity_movements_capacity ON service_capacity_movements(capacity_id, created_at DESC);

-- Ordered workflow template (e.g. Requirements -> Proposal -> Contract ->
-- Development -> Testing -> Deployment). Selling a service copies these
-- stage names into project_tasks rows on the existing projects table
-- (POST /api/products/:id/start-project) — this table only stores the
-- template, not per-sale instances.
CREATE TABLE IF NOT EXISTS service_workflow_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_workflow_stages_product ON service_workflow_stages(product_id, sort_order);
