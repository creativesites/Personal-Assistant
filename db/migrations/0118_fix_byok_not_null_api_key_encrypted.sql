-- Migration 0118: Drop NOT NULL constraint on deprecated api_key_encrypted column
-- This fixes BYOK saving failures due to the legacy column having a NOT NULL constraint while the new codebase only populates encrypted_key.

ALTER TABLE user_ai_keys ALTER COLUMN api_key_encrypted DROP NOT NULL;
