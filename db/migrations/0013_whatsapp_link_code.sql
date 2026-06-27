ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS link_code TEXT;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS link_code_expires_at TIMESTAMPTZ;
