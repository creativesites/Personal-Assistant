-- Zuri Marketing Phase 2 — Publishing & Scheduling. See docs/ZURI_MARKETING_EXPANSION.md §10/§12.
--
-- social_accounts: one row per connected platform account (OAuth). Tokens are
-- nullable because a row can exist mid-connect-flow before the callback
-- completes, and platform_publish() will refuse to run against a row with no
-- access_token.
CREATE TABLE IF NOT EXISTS social_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform          VARCHAR(20) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok')),
  platform_account_id VARCHAR(255),
  account_name      VARCHAR(255),
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  scopes            JSONB NOT NULL DEFAULT '[]',
  status            VARCHAR(20) NOT NULL DEFAULT 'connected'
                      CHECK (status IN ('connected', 'expired', 'revoked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform, platform_account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id) WHERE status = 'connected';

-- social_posts: the scheduling queue. Status lifecycle mirrors `broadcasts`
-- (draft | scheduled | sending | sent | failed | cancelled) — same discipline,
-- posting to social platforms instead of sending to WhatsApp contacts.
CREATE TABLE IF NOT EXISTS social_posts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  social_account_id  UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  caption            TEXT NOT NULL,
  image_url          TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at       TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  platform_post_id   VARCHAR(255),
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_due ON social_posts(scheduled_at) WHERE status = 'scheduled';
