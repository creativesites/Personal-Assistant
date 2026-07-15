-- Comprehensive token usage tracking across all AI calls (see CLAUDE.md
-- "Token Usage Tracking" for the full design). Every underlying LiteLLM
-- call made through services/intelligence/app/ai/client.py writes one row
-- here, tagged by service/feature/model, so the Diagnostics page can show
-- token/cost breakdowns by day, feature, model, and (for admins) by user.

CREATE TABLE IF NOT EXISTS token_usage_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  service            VARCHAR(50) NOT NULL,
  feature            VARCHAR(50) NOT NULL,
  model              VARCHAR(255) NOT NULL,
  prompt_tokens      INTEGER NOT NULL DEFAULT 0,
  completion_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens       INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  estimated_cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_created ON token_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_feature_created ON token_usage_logs(feature, created_at DESC);

-- Global cost-rate map, reusing the existing system_config generic
-- key->JSONB store (same convention as the 'feature_flags' row) rather
-- than a new single-purpose table. Seeded with Gemini Flash's real
-- public per-token pricing; DashScope/Qwen rates are close estimates
-- (DashScope's published pricing, converted to USD) since Alibaba's
-- rates vary by region/tier -- good enough for an *estimate*, not a
-- billing-grade figure. 'default' covers any model not listed here.
INSERT INTO system_config (key, value) VALUES
  ('cost_per_1k_tokens', '{
    "gemini/gemini-3.5-flash": {"input_per_1k": 0.000075, "output_per_1k": 0.0003},
    "dashscope/qwen-turbo":    {"input_per_1k": 0.00004,  "output_per_1k": 0.00012},
    "dashscope/qwen-plus":     {"input_per_1k": 0.00008,  "output_per_1k": 0.00024},
    "dashscope/qwen-long":     {"input_per_1k": 0.00007,  "output_per_1k": 0.00007},
    "dashscope/qwen-max":      {"input_per_1k": 0.00016,  "output_per_1k": 0.00048},
    "default": {"input_per_1k": 0.0001, "output_per_1k": 0.0003}
  }')
ON CONFLICT (key) DO NOTHING;
