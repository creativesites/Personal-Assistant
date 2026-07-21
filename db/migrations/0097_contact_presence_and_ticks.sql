-- Add last_seen_at to contacts and delivery_status to messages.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'sent';

CREATE INDEX IF NOT EXISTS idx_contacts_last_seen_at ON contacts(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status ON messages(delivery_status) WHERE sender_type = 'user';
