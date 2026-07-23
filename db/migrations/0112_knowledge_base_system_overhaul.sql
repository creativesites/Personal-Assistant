-- 0112: Knowledge Base & Long-Term Memory System Overhaul
-- Expands Zuri's Knowledge Base into a central, always-on Organizational Knowledge & Memory System.

-- 1. Knowledge Suggestions / Capture Queue
CREATE TABLE IF NOT EXISTS knowledge_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_type     VARCHAR(50) NOT NULL, -- 'fact', 'document', 'policy', 'contact_preference', 'pricing', 'procedure'
  category            VARCHAR(50) NOT NULL DEFAULT 'other',
  title               VARCHAR(255) NOT NULL,
  proposed_key        VARCHAR(255),
  proposed_value      TEXT NOT NULL,
  existing_value      TEXT, -- For diff display when updating existing facts
  confidence          DECIMAL(5,4) NOT NULL DEFAULT 0.70,
  source_type         VARCHAR(50) NOT NULL, -- 'whatsapp', 'invoice', 'crm_note', 'document_upload', 'ai_chat', 'meeting_summary'
  source_id           VARCHAR(255),
  source_snippet      TEXT,
  detected_entities   JSONB NOT NULL DEFAULT '[]',
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_suggestions_pending ON knowledge_suggestions (user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_kb_suggestions_user ON knowledge_suggestions (user_id, created_at DESC);

-- 2. Knowledge Base Duplicates Manager
CREATE TABLE IF NOT EXISTS knowledge_duplicates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type         VARCHAR(50) NOT NULL, -- 'fact', 'document', 'contact', 'product'
  primary_id          UUID NOT NULL,
  duplicate_id        UUID NOT NULL,
  similarity_score    DECIMAL(5,4) NOT NULL,
  reason              TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged', 'merged', 'dismissed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_duplicates_user ON knowledge_duplicates (user_id, status) WHERE status = 'flagged';

-- 3. Knowledge Health & Completeness Snapshot
CREATE TABLE IF NOT EXISTS knowledge_health_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completeness_score  INT NOT NULL DEFAULT 0, -- 0 to 100
  quality_score       INT NOT NULL DEFAULT 0, -- 0 to 100
  total_facts         INT NOT NULL DEFAULT 0,
  pending_suggestions INT NOT NULL DEFAULT 0,
  flagged_duplicates  INT NOT NULL DEFAULT 0,
  stale_facts_count   INT NOT NULL DEFAULT 0,
  category_breakdown  JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_snapshots_user ON knowledge_health_snapshots (user_id, created_at DESC);
