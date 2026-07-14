-- Auto-Reply & Agents Unification, Phase 1 + 2 foundation.
-- See docs/AUTO_REPLY_AGENTS_PLAN.md.

-- Explicit, named opt-outs — "never auto-engage this specific person"
-- (§4 of the plan). Checked by AutoResponseService.check_eligibility() for
-- every trust level, not just the plain non-agent path.
CREATE TABLE IF NOT EXISTS auto_reply_exclusions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_exclusions_user ON auto_reply_exclusions(user_id);

-- Rule-based opt-outs — "exclude anyone matching this", resolved against
-- real contact fields (relationship_type / contact_tags / customer_status)
-- at evaluate-time, same free-text-match pattern agent_assignments.segment_tag
-- already uses against contact_tags.
--
-- Replaces `auto_reply_rules` (migration 0006), which shipped with a
-- trigger_type/trigger_value/action_type/action_value shape but was never
-- referenced by any route, service, or worker — confirmed dead, dropped here
-- rather than left as permanent unused schema.
DROP TABLE IF EXISTS auto_reply_rules;

CREATE TABLE IF NOT EXISTS auto_reply_exclusion_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_type   VARCHAR(30) NOT NULL CHECK (rule_type IN ('relationship_type', 'tag', 'customer_status')),
  rule_value  VARCHAR(100) NOT NULL,
  source_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, rule_type, rule_value)
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_exclusion_rules_user ON auto_reply_exclusion_rules(user_id);

-- Default Assistant (plan §2) — every user gets exactly one agent with
-- is_default = TRUE from the moment their account exists (wired into
-- clerk-sync/register going forward). This backfills existing users so the
-- orchestrator's "no assignment -> route to default agent" fallback never
-- finds a gap. is_active = TRUE (agents otherwise default to inactive) so
-- it actually engages immediately, trust_level = 'suggest' (draft, human
-- approves) as the conservative starting point.
INSERT INTO agents (
  user_id, name, agent_type, description, trust_level, is_active,
  role_title, avatar_emoji, tone, greeting_message, is_default
)
SELECT
  u.id, 'Assistant', 'custom', 'Your default AI assistant — drafts replies for every contact not assigned to a specialised agent.',
  'suggest', TRUE, 'Personal Assistant', '🤝', 'friendly', NULL, TRUE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM agents a WHERE a.user_id = u.id AND a.is_default = TRUE);
