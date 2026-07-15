-- Advisor Companion Plan Phase 3 — Action Protocol And Approval (see
-- docs/ADVISOR_COMPANION_PLAN.md §4.3/§4.9/§9). Durable action approval
-- and execution log — every Advisor-proposed action (starting with
-- send_whatsapp_message) is stored before execution, never executed
-- directly from a chat response.

CREATE TABLE IF NOT EXISTS advisor_action_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES advisor_sessions(id) ON DELETE CASCADE,
  message_id    UUID REFERENCES advisor_messages(id) ON DELETE SET NULL,
  action_type   VARCHAR(30) NOT NULL CHECK (action_type IN (
                  'send_whatsapp_message', 'fetch_replies', 'watch_conversation',
                  'summarize_new_replies', 'create_reminder', 'generate_document',
                  'update_memory', 'forget_memory',
                  'send_devotional', 'send_motivational', 'send_interest_update'
                )),
  status        VARCHAR(20) NOT NULL DEFAULT 'proposed' CHECK (status IN (
                  'proposed', 'approved', 'executing', 'completed', 'failed', 'cancelled'
                )),
  payload       JSONB NOT NULL,
  approval_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  risk_level    VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  result        JSONB,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  executed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_advisor_action_requests_session ON advisor_action_requests(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advisor_action_requests_user_pending ON advisor_action_requests(user_id, status) WHERE status = 'proposed';
