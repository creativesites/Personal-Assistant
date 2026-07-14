-- Business OS Phase A — configurable product attributes & families.
-- See docs/BUSINESS_OS_PLAN.md §5. Schema-driven hybrid rather than pure EAV
-- or unstructured JSONB: product_families is the user-definable hierarchy
-- (Electronics > Phones > Android > Samsung), product_attribute_definitions
-- is the per-family "schema" a Studio form-builder reads to render the right
-- fields (and to know which attributes generate variants), and
-- products.attributes stores this product's actual values against that
-- schema. The existing service_details/inventory_details/pricing_details
-- JSONB columns on products stay as-is for module-specific config; this is
-- specifically for user-defined catalog attributes.

CREATE TABLE IF NOT EXISTS product_families (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES product_families(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  path       VARCHAR(1000),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_families_user ON product_families(user_id);
CREATE INDEX IF NOT EXISTS idx_product_families_parent ON product_families(parent_id);

CREATE TABLE IF NOT EXISTS product_attribute_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  key             VARCHAR(100) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  data_type       VARCHAR(20) NOT NULL DEFAULT 'text'
                    CHECK (data_type IN ('text', 'number', 'select', 'multiselect', 'boolean', 'date')),
  options         JSONB NOT NULL DEFAULT '[]',
  is_variant_axis BOOLEAN NOT NULL DEFAULT FALSE,
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, key)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_definitions_family ON product_attribute_definitions(family_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES product_families(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_family ON products(family_id);
CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id);
