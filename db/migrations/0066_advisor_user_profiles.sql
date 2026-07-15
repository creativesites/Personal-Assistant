-- Advisor Companion Plan Phase 0 — Emotional Foundation (see
-- docs/ADVISOR_COMPANION_PLAN.md §4.1/§4.5/§9). The base advisor_user_profiles
-- table is nominally a Phase 1 deliverable (§4.1), but Phase 0's own
-- extension columns (§4.5) have nowhere to live without it, so it's created
-- here — Phase 1 builds routes/services on top of the table that already
-- exists rather than creating it again. personal_mode_enabled/
-- personal_mode_enabled_at are deliberately NOT added here — the plan
-- explicitly assigns those two columns to Phase 1 (§9), not Phase 0.

CREATE TABLE IF NOT EXISTS advisor_user_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_persona       JSONB NOT NULL DEFAULT '{}',
  tone_preferences      JSONB NOT NULL DEFAULT '{}',
  advice_preferences    JSONB NOT NULL DEFAULT '{}',
  boundaries            JSONB NOT NULL DEFAULT '{}',
  relationship_context  JSONB NOT NULL DEFAULT '{}',
  learned_traits        JSONB NOT NULL DEFAULT '{}',
  confidence            JSONB NOT NULL DEFAULT '{}',
  last_refined_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- §4.5 extension columns Phase 0 actually needs (interests/spiritual/
  -- motivational/gossip preferences ship here too since they're part of
  -- the same ALTER in the plan's own §4.5, even though their consumers
  -- — Gossip Mode, the Interest Companion, etc. — are later phases).
  interests             JSONB NOT NULL DEFAULT '[]',
  spiritual_preferences JSONB NOT NULL DEFAULT '{}',
  motivational_style    JSONB NOT NULL DEFAULT '{}',
  gossip_style          JSONB NOT NULL DEFAULT '{}',
  current_emotional_state JSONB NOT NULL DEFAULT '{}',
  emotional_baseline    JSONB NOT NULL DEFAULT '{}',
  companion_features_paused BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_advisor_user_profiles_user ON advisor_user_profiles(user_id);
