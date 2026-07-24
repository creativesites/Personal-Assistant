-- Migration 0123: WhatsApp Statuses (Stories)
-- Table to store contact and user WhatsApp Statuses (24h ephemeral stories)

CREATE TABLE IF NOT EXISTS whatsapp_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_status_id TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'video'
  caption TEXT,
  media_url TEXT,
  background_color TEXT,
  font INTEGER DEFAULT 1,
  views_count INTEGER DEFAULT 0,
  is_from_me BOOLEAN DEFAULT false,
  ai_insight TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT whatsapp_statuses_user_status_unique UNIQUE (user_id, whatsapp_status_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_statuses_user_expires ON whatsapp_statuses (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_statuses_contact ON whatsapp_statuses (contact_id);
