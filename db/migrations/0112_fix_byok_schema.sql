-- Migration 0112: Fix user_ai_keys schema compatibility with migration 0019

-- 1. Ensure encrypted_key column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_ai_keys' AND column_name = 'encrypted_key'
  ) THEN
    ALTER TABLE user_ai_keys ADD COLUMN encrypted_key TEXT;
  END IF;

  -- If api_key_encrypted exists from migration 0019, copy non-null values
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_ai_keys' AND column_name = 'api_key_encrypted'
  ) THEN
    UPDATE user_ai_keys SET encrypted_key = api_key_encrypted WHERE encrypted_key IS NULL AND api_key_encrypted IS NOT NULL;
  END IF;
END $$;

-- 2. Add missing columns if they were not added
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS key_hint VARCHAR(20) NOT NULL DEFAULT '••••••••';
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'untested';
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Remove old constraint from migration 0019 to prevent ON CONFLICT target mismatch
ALTER TABLE user_ai_keys DROP CONSTRAINT IF EXISTS user_ai_keys_user_id_provider_key;

-- 4. Re-create unique indices cleanly
DROP INDEX IF EXISTS idx_user_ai_keys_user_provider;
CREATE UNIQUE INDEX idx_user_ai_keys_user_provider ON user_ai_keys(user_id, provider) WHERE team_id IS NULL;

DROP INDEX IF EXISTS idx_user_ai_keys_team_provider;
CREATE UNIQUE INDEX idx_user_ai_keys_team_provider ON user_ai_keys(team_id, provider) WHERE team_id IS NOT NULL;
