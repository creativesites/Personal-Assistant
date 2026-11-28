-- Migration 0139: AI routing per job + reply engine v3 (docs/ZURI_AI_PLAN.md).

-- Ordered fallback chain of models per job, per user. No row = built-in
-- quality-first default (services/intelligence/app/ai/router.py).
CREATE TABLE IF NOT EXISTS ai_routing (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job VARCHAR(40) NOT NULL,
  chain JSONB NOT NULL,            -- ["anthropic/claude-opus-5-5", "gemini/gemini-3.5-pro", ...]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, job)
);

-- Per-chat AI switch: off = no drafts, no auto-replies, no AI reads of the chat for replies.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- The owner's partner: the reply engine may use Shona there now and then.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_partner BOOLEAN NOT NULL DEFAULT FALSE;

-- One compose run = one draft; its options stay one suggested_replies row each.
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS draft_id UUID;
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS model VARCHAR(80);
-- When the reply depends on the owner: {"id","text","answers":[...]}.
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS owner_question JSONB;
CREATE INDEX IF NOT EXISTS idx_suggested_replies_draft ON suggested_replies (draft_id) WHERE draft_id IS NOT NULL;

-- The verbatim window grew from 40 to 1500 messages, so existing summaries
-- describe the wrong stretch of each chat. Rebuild them from scratch.
UPDATE conversations SET chat_summary = NULL, chat_summary_through = NULL
WHERE chat_summary IS NOT NULL OR chat_summary_through IS NOT NULL;
