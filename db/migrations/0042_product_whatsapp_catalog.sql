-- Link Zuri product catalog rows to WhatsApp Business catalog products.
-- The WhatsApp catalog API is only available when the linked account is a
-- WhatsApp Business account; these fields record best-effort sync state.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS whatsapp_catalog_product_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS whatsapp_catalog_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_catalog_status VARCHAR(30) NOT NULL DEFAULT 'not_synced'
    CHECK (whatsapp_catalog_status IN ('not_synced', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS whatsapp_catalog_error TEXT;

CREATE INDEX IF NOT EXISTS idx_products_whatsapp_catalog
  ON products(user_id, whatsapp_catalog_product_id)
  WHERE whatsapp_catalog_product_id IS NOT NULL;
