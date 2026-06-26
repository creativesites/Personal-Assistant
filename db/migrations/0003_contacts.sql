CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_jid VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  display_name VARCHAR(255),
  custom_name VARCHAR(255),
  avatar_url VARCHAR(500),
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  is_business BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, whatsapp_jid)
);

CREATE TABLE contact_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  member_contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role VARCHAR(50),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_contact_id, member_contact_id)
);

CREATE TABLE relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100) NOT NULL DEFAULT 'acquaintance',
  relationship_subtype VARCHAR(100),
  importance_tier SMALLINT NOT NULL DEFAULT 3 CHECK (importance_tier BETWEEN 1 AND 5),
  health_score SMALLINT NOT NULL DEFAULT 70 CHECK (health_score BETWEEN 0 AND 100),
  health_trend VARCHAR(20) NOT NULL DEFAULT 'stable',
  dormancy_alert_days INTEGER NOT NULL DEFAULT 30,
  last_interaction_at TIMESTAMPTZ,
  notes TEXT,
  is_auto_managed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id, tag)
);

CREATE TABLE relationship_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  health_score SMALLINT NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  previous_score SMALLINT,
  change_reason TEXT,
  contributing_factors JSONB,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
