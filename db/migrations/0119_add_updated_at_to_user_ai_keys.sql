-- Migration 0119: Add updated_at column to user_ai_keys table
ALTER TABLE user_ai_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
