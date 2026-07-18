-- Reusable named Brand Profiles (see plan doc / CLAUDE.md's Business
-- Workspace section) — business_profiles was one row per user (UNIQUE
-- user_id); a user running more than one business/side company had no way
-- to invoice as anything but their single default. This makes it a real
-- one-to-many: a user can maintain multiple named profiles, each with its
-- own logo/address/bank details/numbering sequence, and pick which one
-- applies per document (documents.business_profile_id below).

ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_user_id_key;
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT 'My Business';
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Every existing row is currently the user's only profile — it becomes
-- their default.
UPDATE business_profiles SET is_default = true WHERE is_default = false;

-- Exactly one default per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_profiles_default_per_user
  ON business_profiles(user_id) WHERE is_default = true;

-- Nullable FK, ON DELETE SET NULL — same precedent as documents.project_id/
-- documents.supplier_id. NULL means "use the user's default profile," so
-- every existing document keeps rendering exactly as it does today.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS business_profile_id UUID
  REFERENCES business_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_business_profile_id ON documents(business_profile_id)
  WHERE business_profile_id IS NOT NULL;
