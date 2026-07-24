-- Migration 0121: Message Deletion, Group Metadata, and Avatar Sync
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS avatar_last_fetched_at TIMESTAMPTZ;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_for_user_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contact_group_members_group_contact_id ON contact_group_members(group_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_member_contact_id ON contact_group_members(member_contact_id);
