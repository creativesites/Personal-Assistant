-- Advisor Companion Plan Phase 6 — Safe Scoped Automation (see
-- docs/ADVISOR_COMPANION_PLAN.md §3.5/§9). A one-off, time-limited,
-- narrowly-scoped auto-send grant for ONE conversation. Layers on top of
-- the existing auto-response eligibility checks (auto_response.py's
-- check_eligibility) rather than bypassing them — a grant only ever
-- overrides the approval_mode gate; it never overrides business hours,
-- exclusions, escalation keywords, or group/broadcast skipping.

CREATE TABLE IF NOT EXISTS advisor_automation_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id    UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  scope_description  TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_automation_grants_active
  ON advisor_automation_grants(conversation_id, status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS advisor_automation_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id        UUID NOT NULL REFERENCES advisor_automation_grants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  action          VARCHAR(30) NOT NULL CHECK (action IN ('auto_sent', 'skipped_out_of_scope', 'skipped_high_risk')),
  detail          TEXT,
  sent_text       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_automation_audit_log_grant
  ON advisor_automation_audit_log(grant_id, created_at DESC);
