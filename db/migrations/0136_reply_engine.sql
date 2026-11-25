-- Reply engine v2: one composer for suggestions and auto-replies.

-- Durable rolling summary of a chat's older history (everything before the
-- live transcript window the composer reads verbatim).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_summary_through TIMESTAMPTZ;

-- A reply can be 1-3 WhatsApp messages, each optionally quoting the message
-- it answers: [{ "text": "...", "quoteMessageId": "<uuid>|null" }].
-- suggestion_text keeps the parts joined by newlines for every existing UI.
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS parts JSONB;

-- The draft depends on something only the owner knows (their day, health,
-- plans, a decision) — shown as a draft, never auto-sent.
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS needs_owner BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE suggested_replies ADD COLUMN IF NOT EXISTS needs_owner_reason TEXT;
