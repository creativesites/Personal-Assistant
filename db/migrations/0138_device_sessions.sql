-- Migration 0138: per-device sessions for native app sign-in (mobile plan G1).
--
-- POST /api/auth/clerk-exchange mints a Zuri JWT for one device and records it
-- here. The JWT carries sid (this row's id) and tv (token_version). A request
-- whose token names a revoked session, or an older token_version, is refused,
-- so logging out (or revoking a lost phone from the web) cuts off only that
-- device. Web tokens carry no sid and are unaffected.

CREATE TABLE IF NOT EXISTS device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(255),
  platform VARCHAR(32) NOT NULL DEFAULT 'android',
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_exchange_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions (user_id);
