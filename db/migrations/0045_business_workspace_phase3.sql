-- Zuri Business Workspace Phase 3 — AI Document Assistant + Automation.
-- See docs/BUSINESS_WORKSPACE_PLAN.md §12/§13/§15.

-- Per-document chat (§12) — mirrors advisor_messages' shape but scoped to a
-- document instead of a session.
CREATE TABLE IF NOT EXISTS document_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_chat_document ON document_chat_messages(document_id, created_at);

-- Scheduled/recurring documents (§15 Phase 3) — a rule, not a queued job;
-- a polling worker (matching the existing social-publish-worker.ts house
-- style — plain interval loop, not a BullMQ repeatable job) checks
-- next_run_at every minute and creates+renders a document when due.
CREATE TABLE IF NOT EXISTS recurring_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  document_type     VARCHAR(30) NOT NULL,
  template_data     JSONB NOT NULL DEFAULT '{}',  -- {items, notes, terms} — same shape as structured_data
  recurrence        VARCHAR(20) NOT NULL CHECK (recurrence IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  day_of_period     INT NOT NULL DEFAULT 1,       -- day of month/week the rule fires on
  auto_send         BOOLEAN NOT NULL DEFAULT FALSE, -- generate only (false) vs. generate + WhatsApp send (true)
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at       TIMESTAMPTZ NOT NULL,
  last_run_at       TIMESTAMPTZ,
  last_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_documents_due ON recurring_documents(next_run_at) WHERE is_active = TRUE;
