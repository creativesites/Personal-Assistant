-- Platform Polish Phase 3 (§5.3) — duplicate-contact detection + merge.
-- A merge never deletes the duplicate contact row (47 tables reference
-- contacts(id), many ON DELETE CASCADE — deleting it would silently
-- destroy history). Instead the duplicate is marked merged_into_id and
-- the explicitly-scoped tables (conversations, messages, deals,
-- documents) are reassigned to the primary contact.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_merged_into ON contacts(merged_into_id) WHERE merged_into_id IS NOT NULL;
