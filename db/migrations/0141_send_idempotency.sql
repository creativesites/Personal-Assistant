-- Migration 0141: idempotent sends (mobile plan G4).
--
-- A phone that loses its connection mid-send retries with the same
-- Idempotency-Key; the second request returns the first result instead of
-- sending the message again. Keys are kept for 7 days.
CREATE TABLE IF NOT EXISTS send_idempotency_keys (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(128) NOT NULL,
  conversation_id UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  message_id UUID,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_send_idempotency_created ON send_idempotency_keys (created_at);
