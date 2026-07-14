-- contacts.is_active was referenced in analytics routes but never added to the schema.
-- events.contact_id was NOT NULL but user-created events don't require a contact.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON contacts(user_id) WHERE is_active = TRUE;

ALTER TABLE events
  ALTER COLUMN contact_id DROP NOT NULL;
