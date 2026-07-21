ALTER TABLE auto_response_settings 
  ADD COLUMN IF NOT EXISTS inclusion_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS auto_reply_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS privacy_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_inclusions_user ON auto_reply_inclusions(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_inclusions_contact ON auto_reply_inclusions(contact_id);

CREATE INDEX IF NOT EXISTS idx_privacy_exclusions_user ON privacy_exclusions(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_exclusions_contact ON privacy_exclusions(contact_id);
