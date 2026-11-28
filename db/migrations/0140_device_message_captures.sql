-- Migration 0140: phone-captured messages (mobile plan G5, docs/mobile/DATA_OWNERSHIP_AND_SYNC.md §6).
--
-- Zuri Android captures WhatsApp messages from notifications (no WhatsApp
-- message id). POST /api/device/messages:batch records each capture here,
-- then reconciles it with the messages the WhatsApp link (Baileys) stored:
--   matched  — a Baileys row is the same message (nothing new is created)
--   created  — no Baileys row turned up within the wait window, so a message
--              row was created from the capture (messages.capture_source = 'device')
--   skipped  — the chat couldn't be identified, or it was a duplicate capture
--   ambiguous — several Baileys rows fit equally well; never auto-merged
-- A device-created row is deleted (tombstoned in the feed) if Baileys later
-- delivers the same message.

CREATE TABLE IF NOT EXISTS device_message_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id VARCHAR(128) NOT NULL,
  device_id VARCHAR(128),
  source VARCHAR(40) NOT NULL DEFAULT 'whatsapp',
  chat_key VARCHAR(255) NOT NULL,
  chat_key_kind VARCHAR(10) NOT NULL DEFAULT 'jid',     -- jid | title
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  sender_key VARCHAR(255),
  sender_name VARCHAR(255),
  from_me BOOLEAN NOT NULL DEFAULT FALSE,
  text TEXT,
  placeholder_kind VARCHAR(20),                          -- photo | video | voice | sticker | document | ...
  sent_at TIMESTAMPTZ NOT NULL,
  fingerprint VARCHAR(128),
  status VARCHAR(12) NOT NULL DEFAULT 'pending',         -- pending | matched | created | skipped | ambiguous
  reason VARCHAR(60),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_device_captures_pending ON device_message_captures (received_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_device_captures_created ON device_message_captures (resolved_at) WHERE status = 'created';

-- NULL = stored by the WhatsApp link; 'device' = created from a phone capture.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS capture_source VARCHAR(16);
