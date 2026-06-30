-- 0027: Inbox features — promises tracking, contact muting/blocking,
--       per-contact agent trust overrides, vision AI media_analyses,
--       and questions_detected on message_analyses.

-- ─── contact_promises ────────────────────────────────────────────────────────
-- Tracks promises / commitments detected in conversations.

CREATE TABLE IF NOT EXISTS contact_promises (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES contacts(id)      ON DELETE CASCADE,
  message_id      UUID                 REFERENCES messages(id)      ON DELETE SET NULL,
  conversation_id UUID                 REFERENCES conversations(id) ON DELETE SET NULL,
  body            TEXT        NOT NULL,  -- the promise text
  made_by         VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (made_by IN ('user', 'contact')),
  fulfilled_at    TIMESTAMPTZ,
  due_date        TIMESTAMPTZ,
  source          VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_promises_contact
  ON contact_promises (contact_id, user_id)
  WHERE fulfilled_at IS NULL;

-- ─── contacts: muted / blocked flags ─────────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS muted_at   TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

-- ─── agent_assignments: per-contact trust level override ─────────────────────

ALTER TABLE agent_assignments ADD COLUMN IF NOT EXISTS contact_trust_override VARCHAR(30);

-- ─── media_analyses ──────────────────────────────────────────────────────────
-- Stores vision AI results for images / documents shared in conversations.

CREATE TABLE IF NOT EXISTS media_analyses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  -- product | damage | receipt | id_document | food | vehicle | screenshot | general
  media_type   VARCHAR(30),
  labels       JSONB,       -- detected objects / labels
  text_content TEXT,        -- OCR'd text
  structured   JSONB,       -- structured extraction (receipt line items, etc.)
  summary      TEXT,
  confidence   DECIMAL(5,4),
  model_used   VARCHAR(100),
  analyzed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── message_analyses: questions_detected column ─────────────────────────────

ALTER TABLE message_analyses ADD COLUMN IF NOT EXISTS questions_detected JSONB;
