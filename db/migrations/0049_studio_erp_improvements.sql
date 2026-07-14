-- Migration 0049: Studio ERP Improvements
-- Add suppliers table, extend products table with rich catalog & inventory fields,
-- and widen business facts & advisor sessions categories.

-- 1. Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company                    VARCHAR(255) NOT NULL,
  contact                    VARCHAR(255),
  phone                      VARCHAR(50),
  whatsapp                   VARCHAR(50),
  email                      VARCHAR(255),
  average_delivery_time      INT NOT NULL DEFAULT 5,
  reliability_score          DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  minimum_order              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_terms              TEXT,
  outstanding_balance        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id);

-- 2. Extend products table with rich attributes
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type VARCHAR(30) NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service', 'bundle', 'subscription', 'package', 'digital_product'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_stock INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS maximum_stock INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_lead_time INT NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin DECIMAL(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cross_sell JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS upsell JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS replacement_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS related_products JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS manual TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Modular extension columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS service_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_copy TEXT;

-- Index for supplier relation
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id) WHERE supplier_id IS NOT NULL;

-- Sync selling_price and stock with price and quantity where null
UPDATE products SET selling_price = price WHERE selling_price IS NULL;
UPDATE products SET stock = quantity WHERE stock IS NULL OR stock = 1;
UPDATE products SET available = stock - reserved;

-- 3. Widen business_facts categories to support rules
ALTER TABLE business_facts DROP CONSTRAINT IF EXISTS business_facts_category_check;
ALTER TABLE business_facts ADD CONSTRAINT business_facts_category_check CHECK (category IN (
  'product', 'pricing', 'shipping', 'refund_policy', 'faq',
  'hours', 'inventory', 'promotion', 'supplier', 'tax',
  'bank_details', 'wa_template', 'brand_voice', 'objection', 'other',
  'pricing_benchmark', 'business_rule'
));

-- 4. Extend advisor_sessions to support session categories
ALTER TABLE advisor_sessions ADD COLUMN IF NOT EXISTS session_category VARCHAR(30) NOT NULL DEFAULT 'relationship' CHECK (session_category IN ('relationship', 'business'));
CREATE INDEX IF NOT EXISTS idx_advisor_sessions_category ON advisor_sessions(user_id, session_category);
