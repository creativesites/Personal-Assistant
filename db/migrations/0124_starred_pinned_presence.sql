-- Migration 0124: Add Starred & Pinned flags for Messages and Conversations
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Indexes for fast querying of starred and pinned items
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages(conversation_id, is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(conversation_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(user_id, is_pinned, pinned_at DESC);
