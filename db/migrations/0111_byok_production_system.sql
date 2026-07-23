-- Migration 0111: Production Bring Your Own AI (BYOK) System

-- 1. Ensure user_ai_keys table exists and has all required columns
CREATE TABLE IF NOT EXISTS user_ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint VARCHAR(20) NOT NULL DEFAULT '••••••••',
  is_active BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(30) NOT NULL DEFAULT 'untested', -- healthy | invalid | quota_exceeded | untested
  last_validated_at TIMESTAMPTZ,
  last_error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add any missing columns to user_ai_keys if created by previous migration
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS key_hint VARCHAR(20) NOT NULL DEFAULT '••••••••';
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'untested';
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_keys_user_provider ON user_ai_keys(user_id, provider) WHERE team_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_keys_team_provider ON user_ai_keys(team_id, provider) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_ai_keys_status ON user_ai_keys(status);

-- 2. User & Organization AI Settings
CREATE TABLE IF NOT EXISTS user_ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  default_provider VARCHAR(50) NOT NULL DEFAULT 'google',
  preferred_model VARCHAR(100) NOT NULL DEFAULT 'gemini/gemini-2.5-flash',
  reasoning_model VARCHAR(100) NOT NULL DEFAULT 'gemini/gemini-2.5-pro',
  fast_model VARCHAR(100) NOT NULL DEFAULT 'gemini/gemini-2.5-flash',
  vision_model VARCHAR(100) NOT NULL DEFAULT 'gemini/gemini-2.5-flash',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  max_output_length INT NOT NULL DEFAULT 2048,
  streaming_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_fallback_enabled BOOLEAN NOT NULL DEFAULT true,
  daily_budget_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  monthly_budget_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  budget_warning_threshold_pct INT NOT NULL DEFAULT 80,
  budget_hard_limit_enabled BOOLEAN NOT NULL DEFAULT false,
  budget_soft_limit_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_settings_user ON user_ai_settings(user_id) WHERE team_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_settings_team ON user_ai_settings(team_id) WHERE team_id IS NOT NULL;

-- 3. AI Connection Diagnostic Logs
CREATE TABLE IF NOT EXISTS ai_connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  is_success BOOLEAN NOT NULL DEFAULT false,
  latency_ms INT NOT NULL DEFAULT 0,
  models_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(50),
  error_message TEXT,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_connection_logs_user ON ai_connection_logs(user_id, tested_at DESC);

-- 4. Extend token_usage_logs for provider & latency tracking
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'google';
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS is_byok BOOLEAN DEFAULT false;
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS status_code INT DEFAULT 200;
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_token_usage_logs_provider ON token_usage_logs(provider, created_at DESC);
