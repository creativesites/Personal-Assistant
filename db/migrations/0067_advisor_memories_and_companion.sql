-- Advisor Companion Plan Phase 1 — Companion Brain Foundation (see
-- docs/ADVISOR_COMPANION_PLAN.md §4.2/§4.4/§4.5/§9).

-- §4.2 — Advisor-specific memories about the user, not contacts.
CREATE TABLE IF NOT EXISTS advisor_memories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  memory_type        VARCHAR(30) NOT NULL CHECK (memory_type IN
                        ('preference', 'boundary', 'trait', 'goal',
                         'relationship_pattern', 'successful_advice', 'disliked_advice')),
  memory_key         TEXT NOT NULL,
  memory_value       TEXT NOT NULL,
  source_message_id  UUID REFERENCES advisor_messages(id) ON DELETE SET NULL,
  confidence         NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  evidence_count     INT NOT NULL DEFAULT 1,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_memories_user ON advisor_memories(user_id, is_active, last_seen_at DESC);

-- §4.5 — the two Phase-0-deferred columns, shipped now precisely so
-- Phase 4.5's proactive crons have a way to be tested end-to-end the
-- moment they land, without waiting on organic per-capability discovery.
ALTER TABLE advisor_user_profiles
  ADD COLUMN IF NOT EXISTS personal_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS personal_mode_enabled_at TIMESTAMPTZ;

-- §4.4 — session-level companion state.
ALTER TABLE advisor_sessions
  ADD COLUMN IF NOT EXISTS companion_mode VARCHAR(30) NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS active_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emotional_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_intent VARCHAR(30),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
