-- Migration 0142: Networking (docs/ZURI_AI_PLAN.md Part C) — the warm list
-- and keep-warm nudges. Replaces Career OS as the people-growth surface.

-- Contacts the owner wants kept warm. tier 'dismissed' = "don't suggest again".
CREATE TABLE IF NOT EXISTS network_contacts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tier VARCHAR(12) NOT NULL CHECK (tier IN ('key', 'important', 'dismissed')),
  role VARCHAR(30),            -- client | prospect | partner | investor | mentor | supplier | peer | community | other
  note TEXT,                   -- why they matter, in the owner's words
  added_by VARCHAR(8) NOT NULL DEFAULT 'owner',   -- owner | zuri
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, contact_id)
);

-- One keep-warm nudge: why now, plus a ready opener in the owner's voice.
CREATE TABLE IF NOT EXISTS network_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  warmth INTEGER,
  messages JSONB,              -- ["...", "..."]: the draft, 1-3 WhatsApp messages
  model VARCHAR(80),
  skipped_before INTEGER NOT NULL DEFAULT 0,   -- earlier nudges for this person the owner skipped
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'snoozed', 'dismissed', 'expired')),
  snooze_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_network_nudges_user ON network_nudges (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_nudges_contact ON network_nudges (contact_id, created_at DESC);

-- One row per owner per day the nudge run happened (so a quiet day isn't re-run).
CREATE TABLE IF NOT EXISTS network_runs (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  made INTEGER NOT NULL DEFAULT 0,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, run_date)
);
