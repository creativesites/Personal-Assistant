-- Track explicit Gemini Context Caches per user
CREATE TABLE IF NOT EXISTS gemini_user_caches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  cache_id            TEXT NOT NULL,
  context_hash        VARCHAR(64) NOT NULL,
  token_count         INTEGER NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gemini_user_caches_user_id_idx ON gemini_user_caches (user_id);

-- Enhance sync_jobs to support checkpointing and resumability
ALTER TABLE sync_jobs 
  ADD COLUMN IF NOT EXISTS current_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_conversation_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sync_phase TEXT NOT NULL DEFAULT 'indexing' 
    CHECK (sync_phase IN ('indexing', 'downloading', 'analysing', 'complete'));

-- Track writing style adjustments from user edits
CREATE TABLE IF NOT EXISTS user_feedback_loops (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id               UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  original_suggestion_text TEXT NOT NULL,
  final_sent_text          TEXT NOT NULL,
  tone                     VARCHAR(50) NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_loops_user_idx ON user_feedback_loops (user_id, created_at DESC);
