-- Memory Engine Phase 3 — Agent + Experience Memory. See docs/MEMORY_ENGINE_PLAN.md §4.2/§6.
--
-- Generalizes the atomic-fact pattern already proven for contacts
-- (contact_insights) to agents, plus a second, structurally different
-- memory_type for case-based "experiences" (situation -> action -> outcome).
-- Both share one table via a discriminator column rather than two tables,
-- since they share confidence/evidence/embedding/retrieval mechanics.
CREATE TABLE IF NOT EXISTS agent_memories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES contacts(id) ON DELETE CASCADE,  -- NULL = general agent knowledge
  memory_type        VARCHAR(20) NOT NULL DEFAULT 'fact' CHECK (memory_type IN ('fact', 'experience')),

  -- 'fact' fields — e.g. key="negotiation_style", value="responds well to a small discount offered early"
  memory_key         VARCHAR(255),
  memory_value       TEXT,

  -- 'experience' fields — a single case: what happened, what the agent did, what resulted
  situation          TEXT,
  action_taken       TEXT,
  outcome            TEXT,
  worked             BOOLEAN,  -- did this action get a good outcome? (drives "use again" retrieval bias)

  confidence         DECIMAL(5,4) NOT NULL DEFAULT 0.6,
  evidence_count     INT NOT NULL DEFAULT 1,
  source_action_ids  JSONB NOT NULL DEFAULT '[]',  -- agent_actions.id trail
  embedding          vector(1536),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by      UUID REFERENCES agent_memories(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories (agent_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding ON agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
