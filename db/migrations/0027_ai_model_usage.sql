-- Tracks cumulative token usage per model, mirroring the Redis-backed
-- free-tier rotation counters in services/intelligence/app/ai/model_router.py.
-- Redis is the source of truth for rotation decisions; this table exists so
-- usage is queryable/reportable (Redis counters alone aren't).
CREATE TABLE IF NOT EXISTS ai_model_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model        VARCHAR(255) NOT NULL UNIQUE,
  pool         VARCHAR(50)  NOT NULL,
  tokens_used  BIGINT       NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
