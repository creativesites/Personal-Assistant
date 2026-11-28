-- G7: FCM registration tokens for the owner's devices. The server sends
-- data-only "sync" tickles to these; the app then pulls /api/sync/changes.
CREATE TABLE IF NOT EXISTS push_tokens (
  token        TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     VARCHAR(16) NOT NULL DEFAULT 'android',
  device_id    VARCHAR(128),
  app_version  VARCHAR(40),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  failures     INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
