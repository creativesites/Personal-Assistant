-- Migration 0126: AI Workforce 2.0 Enhancements
-- Adds granular financial safety limits, tool binding configs, working hours,
-- and proactive cadence tracking for digital workforce agents.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS max_discount_pct        NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS max_refund_limit_usd    NUMERIC(10,2) DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS working_hours_enabled   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS working_hours_start     VARCHAR(10) DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS working_hours_end       VARCHAR(10) DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS enabled_tools           JSONB DEFAULT '["catalog", "invoicing", "orders", "knowledge_brain"]'::jsonb,
  ADD COLUMN IF NOT EXISTS rlhf_learning_enabled   BOOLEAN DEFAULT TRUE;

-- Proactive Relationship Cadences log
CREATE TABLE IF NOT EXISTS agent_proactive_cadences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID        REFERENCES conversations(id) ON DELETE CASCADE,
  cadence_type    VARCHAR(50) NOT NULL, -- 'abandoned_quote', 'unpaid_invoice', 'dormant_vip'
  status          VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'skipped', 'cancelled'
  action_summary  TEXT,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  executed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_cadences_status ON agent_proactive_cadences (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_agent_cadences_user ON agent_proactive_cadences (user_id, created_at DESC);
