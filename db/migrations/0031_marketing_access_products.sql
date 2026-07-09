-- Zuri Marketing Phase 0. See docs/ZURI_MARKETING_EXPANSION.md §10/§12.
--
-- marketing_access is a dedicated entitlement dimension, deliberately separate
-- from the existing `mode` column — mode describes how someone uses WhatsApp
-- (business/personal/hybrid) and has zero backend enforcement today; it must
-- not be overloaded to gate a second, rolling-out product.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS marketing_access VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (marketing_access IN ('none', 'waitlisted', 'beta', 'enabled'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS marketing_waitlisted_at TIMESTAMPTZ;

-- Product catalog for Zuri Marketing (content generation + social scheduling
-- are built against this, not against WhatsApp contacts).
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  specs         JSONB NOT NULL DEFAULT '{}',
  price         DECIMAL(12,2),
  currency      VARCHAR(10) NOT NULL DEFAULT 'ZMW',
  serial_number VARCHAR(255),
  quantity      INT NOT NULL DEFAULT 1,
  images        JSONB NOT NULL DEFAULT '[]',
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id) WHERE status != 'archived';
