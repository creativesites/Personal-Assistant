-- 0115_organization_workspace_scoping.sql
-- Add organization_id columns and backfill existing workspace records for multi-user organization scoping.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Create performance indexes for organization queries
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_id ON deals(organization_id);

-- Backfill organization_id based on user's active current_organization_id
UPDATE conversations c
SET organization_id = u.current_organization_id
FROM users u
WHERE c.user_id = u.id AND u.current_organization_id IS NOT NULL AND c.organization_id IS NULL;

UPDATE contacts c
SET organization_id = u.current_organization_id
FROM users u
WHERE c.user_id = u.id AND u.current_organization_id IS NOT NULL AND c.organization_id IS NULL;

UPDATE documents d
SET organization_id = u.current_organization_id
FROM users u
WHERE d.user_id = u.id AND u.current_organization_id IS NOT NULL AND d.organization_id IS NULL;

UPDATE products p
SET organization_id = u.current_organization_id
FROM users u
WHERE p.user_id = u.id AND u.current_organization_id IS NOT NULL AND p.organization_id IS NULL;

UPDATE deals d
SET organization_id = u.current_organization_id
FROM users u
WHERE d.user_id = u.id AND u.current_organization_id IS NOT NULL AND d.organization_id IS NULL;
