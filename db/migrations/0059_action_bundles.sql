-- Business OS Phase E — the conversation-to-automation loop. See
-- docs/BUSINESS_OS_PLAN.md §15/§16.
--
-- A passive detector (unlike the single-action [ACTION: ...] chat tags,
-- which only fire inside an active AI chat) proposes a *bundle* of related
-- actions from an ordinary WhatsApp conversation — e.g. a customer typing
-- "I'd like 10 uniforms" surfaces "create a deal, reserve stock, draft a
-- quotation, schedule a follow-up" as one approval card in the Inbox. The
-- `actions` JSONB reuses the exact {type, params} shape the [ACTION: ...]
-- tag system already uses, so the same per-type dispatch logic (call
-- POST /api/deals, POST /api/calendar/events, etc.) is reused rather than
-- inventing a second action-execution mechanism.

CREATE TABLE IF NOT EXISTS action_bundles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  summary         TEXT NOT NULL,
  actions         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'partially_approved', 'dismissed', 'expired')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_action_bundles_user_status ON action_bundles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_bundles_contact ON action_bundles(contact_id) WHERE contact_id IS NOT NULL;
