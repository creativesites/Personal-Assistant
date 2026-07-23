-- 0113: Business Knowledge Hub ERP & Sales Engine Overhaul
-- Connects Catalog Products & Services to Sales Orders, Receivables Aging, and Customer Financial Ledgers.

-- 1. Sales Orders Table
CREATE TABLE IF NOT EXISTS sales_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  order_number        VARCHAR(50) NOT NULL,
  quotation_id        UUID REFERENCES documents(id) ON DELETE SET NULL,
  invoice_id          UUID REFERENCES documents(id) ON DELETE SET NULL,
  receipt_id          UUID REFERENCES documents(id) ON DELETE SET NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'invoiced', 'paid', 'fulfilled', 'cancelled')),
  fulfillment_status  VARCHAR(30) NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned')),
  currency            VARCHAR(10) NOT NULL DEFAULT 'ZMW',
  subtotal_cents      BIGINT NOT NULL DEFAULT 0,
  tax_cents           BIGINT NOT NULL DEFAULT 0,
  discount_cents      BIGINT NOT NULL DEFAULT 0,
  total_cents         BIGINT NOT NULL DEFAULT 0,
  notes               TEXT,
  ordered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_user ON sales_orders (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact ON sales_orders (contact_id);

-- 2. Sales Order Items Table
CREATE TABLE IF NOT EXISTS sales_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id      UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  quantity            INT NOT NULL DEFAULT 1,
  unit_price_cents    BIGINT NOT NULL DEFAULT 0,
  total_cents         BIGINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Payment Receipts Ledger
CREATE TABLE IF NOT EXISTS payment_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_id          UUID REFERENCES documents(id) ON DELETE SET NULL,
  receipt_number      VARCHAR(50) NOT NULL,
  payment_method      VARCHAR(50) NOT NULL DEFAULT 'bank_transfer', -- 'cash', 'card', 'bank_transfer', 'mobile_money'
  amount_cents        BIGINT NOT NULL DEFAULT 0,
  currency            VARCHAR(10) NOT NULL DEFAULT 'ZMW',
  reference_code      VARCHAR(100),
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_user ON payment_receipts (user_id, paid_at DESC);
