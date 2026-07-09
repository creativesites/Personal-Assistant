-- Memory Engine Phase 1 — see docs/MEMORY_ENGINE_PLAN.md
--
-- Contact Memory: flexible structured-fact bag, merged (not replaced) by the
-- profiler each run so unmentioned fields survive.
ALTER TABLE contact_profiles
  ADD COLUMN IF NOT EXISTS structured_attributes JSONB NOT NULL DEFAULT '{}';

-- Relationship Memory: separate from the profile — aggregated from data
-- already captured per-message (promises, topics, extracted events), not
-- from new AI calls. See services/intelligence/app/services/relationship_memory.py.
CREATE TABLE IF NOT EXISTS relationship_memory (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id             UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  outstanding_promises   JSONB NOT NULL DEFAULT '[]',
  missed_followups_count INTEGER NOT NULL DEFAULT 0,
  conversation_themes    JSONB NOT NULL DEFAULT '[]',
  important_dates        JSONB NOT NULL DEFAULT '[]',
  shared_history_since   TIMESTAMPTZ,
  last_computed_at       TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_memory_user ON relationship_memory (user_id);

-- User Memory v2: learned from suggested_replies outcomes (status/tone),
-- plus edited_text below, instead of only capturing writing style.
ALTER TABLE user_communication_profiles
  ADD COLUMN IF NOT EXISTS approval_rate           DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS tone_acceptance         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS frequently_edited_words JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferences_learned_at  TIMESTAMPTZ;

-- suggested_replies.edited_text: previously there was no way to capture that
-- a user edited a draft before sending it — the 'edited_and_sent' status
-- value existed in the enum but nothing ever set it. This closes that gap so
-- frequently_edited_words above has real data to mine going forward.
ALTER TABLE suggested_replies
  ADD COLUMN IF NOT EXISTS edited_text TEXT;
