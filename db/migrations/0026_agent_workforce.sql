-- Phase 8: Autonomous Workforce Platform
-- Extends the agent foundation with richer roles, capabilities, performance tracking,
-- learning from corrections, and full orchestrator decision logging.

-- ─── Extend agents table ───────────────────────────────────────────────────

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS role_title                   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_emoji                 VARCHAR(10)  DEFAULT '🤖',
  ADD COLUMN IF NOT EXISTS tone                         VARCHAR(50)  DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS goals                        TEXT,
  ADD COLUMN IF NOT EXISTS capabilities                 JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS greeting_message             TEXT,
  ADD COLUMN IF NOT EXISTS out_of_hours_message         TEXT,
  ADD COLUMN IF NOT EXISTS max_consecutive_auto_messages INT         DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_default                   BOOLEAN      DEFAULT FALSE;

-- Add confidence to agent_actions
ALTER TABLE agent_actions
  ADD COLUMN IF NOT EXISTS confidence FLOAT,
  ADD COLUMN IF NOT EXISTS tools_used JSONB DEFAULT '[]';

-- ─── Daily performance aggregates ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_performance_daily (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  date             DATE        NOT NULL,
  messages_handled INT         NOT NULL DEFAULT 0,
  escalations      INT         NOT NULL DEFAULT 0,
  auto_sent        INT         NOT NULL DEFAULT 0,
  suggested        INT         NOT NULL DEFAULT 0,
  human_overrides  INT         NOT NULL DEFAULT 0,
  avg_confidence   FLOAT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, date)
);

-- ─── Human corrections → continuous learning ───────────────────────────────

CREATE TABLE IF NOT EXISTS agent_corrections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_action_id   UUID        REFERENCES agent_actions(id) ON DELETE SET NULL,
  agent_id          UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_message  TEXT        NOT NULL,
  corrected_message TEXT        NOT NULL,
  correction_reason TEXT,
  contact_id        UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Orchestrator decision log (conversation replay) ───────────────────────

CREATE TABLE IF NOT EXISTS orchestrator_decisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  conversation_id UUID        REFERENCES conversations(id)     ON DELETE CASCADE,
  message_id      UUID        REFERENCES messages(id)          ON DELETE CASCADE,
  -- 'route_to_agent' | 'generate_suggestion' | 'no_response_needed' | 'skip_historical'
  decision        VARCHAR(50) NOT NULL,
  agent_id        UUID        REFERENCES agents(id)            ON DELETE SET NULL,
  reasoning       TEXT,
  confidence      FLOAT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_agent  ON agent_performance_daily (agent_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_user   ON agent_performance_daily (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_corrections_agent ON agent_corrections (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestrator_conv       ON orchestrator_decisions (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestrator_user       ON orchestrator_decisions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_is_default       ON agents (user_id, is_default) WHERE is_default = TRUE;
