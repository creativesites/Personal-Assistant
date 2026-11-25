-- Zuri panel ("Now" tab): scheduled auto-reply countdown, per-chat
-- "since you last looked" digest, and open loops the user marked done.

-- When a delayed automatic reply is due to send (set when it is queued).
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ;

-- Last time the user looked at this chat's Zuri panel (digest cut-off).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS zuri_last_viewed_at TIMESTAMPTZ;

-- Open loops (promises, questions, dates) the user dismissed as done.
CREATE TABLE IF NOT EXISTS conversation_loop_resolutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  loop_key        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, loop_key)
);
