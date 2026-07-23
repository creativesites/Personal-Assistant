-- Migration 0114: Clerk Organizations, Teams & Enterprise Governance

-- 1. Organizations Table (maps to Clerk orgs)
CREATE TABLE IF NOT EXISTS organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id           VARCHAR(255) UNIQUE NOT NULL,
  name                   VARCHAR(255) NOT NULL,
  slug                   VARCHAR(255),
  logo_url               TEXT,
  owner_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  plan_family            VARCHAR(50) NOT NULL DEFAULT 'business',
  max_seats              INT NOT NULL DEFAULT 10,
  settings               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organization Members Table
CREATE TABLE IF NOT EXISTS organization_members (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clerk_membership_id    VARCHAR(255),
  role                   VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  permissions            JSONB NOT NULL DEFAULT '[]',
  status                 VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
  joined_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- 3. Organization Sub-Teams (Departments e.g. Support, Sales)
CREATE TABLE IF NOT EXISTS organization_teams (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                   VARCHAR(100) NOT NULL,
  description            TEXT,
  lead_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Organization Team Members
CREATE TABLE IF NOT EXISTS organization_team_members (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                UUID NOT NULL REFERENCES organization_teams(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                   VARCHAR(30) NOT NULL DEFAULT 'member',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

-- 5. Audit Logging for Company Actions
CREATE TABLE IF NOT EXISTS organization_audit_logs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action                 VARCHAR(100) NOT NULL,
  target_type            VARCHAR(50),
  target_id              VARCHAR(255),
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enhance Users table for Company Governance
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_company_managed BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_clerk_id ON organizations(clerk_org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_teams_org ON organization_teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_audit_logs_org ON organization_audit_logs(organization_id, created_at DESC);
