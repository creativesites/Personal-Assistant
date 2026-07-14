-- Business OS Phase B — supplier-specific pricing + purchase order workflow.
-- See docs/BUSINESS_OS_PLAN.md §8. Purchase orders reuse the `documents`
-- table (document_type = 'purchase_order' already existed in the check
-- constraint since migration 0043) rather than a parallel table — a PO is
-- just another business document with a supplier instead of a contact.

CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id    UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost           DECIMAL(12,2),
  lead_time_days INT,
  minimum_qty    INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(product_id);

-- A PO is sent to a supplier, not a contact — documents.contact_id stays
-- nullable and unused for this type. Same FK-column convention as
-- deal_id/opportunity_id already on documents rather than burying the
-- reference in structured_data JSONB.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_supplier ON documents(supplier_id) WHERE supplier_id IS NOT NULL;

-- Per-product "on order" quantity, separate from `stock`/`reserved`/
-- `available`. Incremented when a PO is approved, decremented as goods are
-- received (see purchase-orders.ts) — the "Incoming" field from the plan.
ALTER TABLE products ADD COLUMN IF NOT EXISTS incoming INT NOT NULL DEFAULT 0;

-- Approving a PO immediately reflects the order as incoming stock via this
-- movement type, ahead of the eventual `restock` movement recorded when the
-- goods actually arrive (§7.2 in the plan — the rest of the expanded
-- movement vocabulary, plus multi-location support, ships in Phase C).
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'in_transit';
