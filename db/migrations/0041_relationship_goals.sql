-- Relationship OS Phase 5 — Goals & Health Rollups.
-- See docs/RELATIONSHIP_OS_PLAN.md §5.12/§6.11/§12.
--
-- One table for both tiers — goal_type just draws from a different
-- vocabulary depending on whether the relationship is business or
-- personal (same pattern already established for opportunity_type and
-- connection_type not needing separate business/personal tables).
CREATE TABLE IF NOT EXISTS relationship_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  goal_type     VARCHAR(40) NOT NULL,
  -- business: become_preferred_supplier | upsell | cross_sell | renew_contract |
  --           request_referral | recover_relationship | increase_spend | schedule_meeting
  -- personal: reconnect | deepen_friendship | repair_rift | be_present |
  --           support_through_event | maintain_long_distance
  custom_label  VARCHAR(255),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
  target_date   DATE,
  ai_next_step  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  achieved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_relationship_goals_contact ON relationship_goals(contact_id);
CREATE INDEX IF NOT EXISTS idx_relationship_goals_user_active ON relationship_goals(user_id, status) WHERE status = 'active';
