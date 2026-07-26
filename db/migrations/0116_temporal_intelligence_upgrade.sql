-- 0116_temporal_intelligence_upgrade.sql
-- Temporal Intelligence & Calendar Upgrade Migration

-- 1. Contact Promises Table
CREATE TABLE IF NOT EXISTS contact_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  promise_text TEXT NOT NULL,
  promised_by VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (promised_by IN ('user', 'contact')),
  due_date TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'broken', 'dismissed')),
  confidence DECIMAL(5,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_promises_user ON contact_promises (user_id);
CREATE INDEX IF NOT EXISTS idx_contact_promises_due ON contact_promises (due_date) WHERE status = 'pending';

-- 2. Conversations SLA Tracking Columns
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sla_status VARCHAR(30) NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS last_incoming_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;

-- 3. Proactive Queue Snooze Column
ALTER TABLE proactive_queue
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- 4. Events Scheduled WA Reminder Columns
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS send_wa_reminder BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_reminder_offset_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS wa_reminder_status VARCHAR(30) NOT NULL DEFAULT 'none';
