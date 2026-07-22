-- 0109_bill_of_materials.sql
-- Create product_bom_components table for manufacturing & assembly recipes

CREATE TABLE IF NOT EXISTS product_bom_components (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_required    DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  wastage_pct          DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_bom_parent_component UNIQUE (parent_product_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_bom_parent ON product_bom_components(user_id, parent_product_id);
CREATE INDEX IF NOT EXISTS idx_bom_component ON product_bom_components(user_id, component_product_id);
