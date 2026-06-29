-- Extended AI profile fields with locking, new calendar event types, and contact documents

ALTER TABLE contact_profiles
  ADD COLUMN IF NOT EXISTS preferences        TEXT,
  ADD COLUMN IF NOT EXISTS goals              TEXT,
  ADD COLUMN IF NOT EXISTS pain_points        TEXT,
  ADD COLUMN IF NOT EXISTS buying_behaviour   TEXT,
  ADD COLUMN IF NOT EXISTS relationship_stage VARCHAR(100),
  ADD COLUMN IF NOT EXISTS locked_fields      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS user_edited_fields TEXT[] NOT NULL DEFAULT '{}';

-- New event types for manual calendar entries
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'payment';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'delivery';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'service_reminder';

CREATE TABLE IF NOT EXISTS contact_documents (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  contact_id   UUID          NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  file_name    VARCHAR(500)  NOT NULL,
  file_type    VARCHAR(100),
  file_size    INTEGER,
  storage_url  VARCHAR(2000) NOT NULL,
  doc_category VARCHAR(50)   NOT NULL DEFAULT 'other'
                CHECK (doc_category IN ('invoice','contract','receipt','image','pdf','vehicle_photo','other')),
  notes        TEXT,
  uploaded_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_documents_contact ON contact_documents(contact_id, user_id);
