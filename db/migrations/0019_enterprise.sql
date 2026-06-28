-- Phase 10: Enterprise Features

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'agent', -- owner | admin | agent | viewer
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (team_id, user_id)
);

-- Shared inbox: conversation assignments to team members
CREATE TABLE conversation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | in_progress | resolved
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL, -- collision detection
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id)
);

-- Internal @mention notes on conversations (not sent to contact)
CREATE TABLE conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mentions JSONB NOT NULL DEFAULT '[]', -- array of user_ids mentioned
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GDPR consent per contact
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL, -- ai_processing | data_storage | marketing | profiling
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | granted | denied | withdrawn
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  source VARCHAR(50) NOT NULL DEFAULT 'implied', -- implied | explicit | opt_out
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id, consent_type)
);

-- Data retention policies
CREATE TABLE data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  raw_messages_days INT NOT NULL DEFAULT 365,
  message_analyses_days INT NOT NULL DEFAULT 730,
  contact_insights_days INT NOT NULL DEFAULT 0, -- 0 = keep forever
  ai_suggestions_days INT NOT NULL DEFAULT 180,
  last_purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Broadcast campaigns
CREATE TABLE broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  message_template TEXT NOT NULL,
  segment_filter JSONB NOT NULL DEFAULT '{}', -- tags/relationship_type/health_score filters
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | scheduled | sending | sent | cancelled
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  personalised_message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed | opted_out
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE (broadcast_id, contact_id)
);

-- Outbound webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255), -- HMAC signing secret
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g. ['message.received', 'suggestion.approved']
  is_active BOOLEAN NOT NULL DEFAULT true,
  failure_count INT NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_name VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  response_status INT,
  response_body TEXT,
  duration_ms INT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public REST API keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE, -- store hashed, show plain only on creation
  key_prefix VARCHAR(10) NOT NULL, -- show "zuri_live_abc..." as hint
  scopes TEXT[] NOT NULL DEFAULT '{}', -- e.g. ['contacts:read', 'messages:read', 'suggestions:read']
  rate_limit_per_minute INT NOT NULL DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- White-labeling config
CREATE TABLE whitelabel_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  brand_name VARCHAR(100),
  logo_url TEXT,
  primary_color VARCHAR(7), -- hex
  custom_domain VARCHAR(255),
  brand_voice_lock TEXT, -- AI prompt addition to lock brand tone
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- External CRM integrations
CREATE TABLE crm_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL, -- hubspot | salesforce | pipedrive
  access_token TEXT, -- ENC
  refresh_token TEXT, -- ENC
  token_expires_at TIMESTAMPTZ,
  workspace_id VARCHAR(255),
  sync_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional', -- import | export | bidirectional
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- BYOK (Bring Your Own Key)
CREATE TABLE user_ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL, -- anthropic | openai | google
  api_key_encrypted TEXT NOT NULL, -- ENC
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_team_members_team ON team_members (team_id);
CREATE INDEX idx_team_members_user ON team_members (user_id);
CREATE INDEX idx_conversation_assignments_team ON conversation_assignments (team_id, status);
CREATE INDEX idx_consent_records_user ON consent_records (user_id, contact_id);
CREATE INDEX idx_broadcasts_user ON broadcasts (user_id, status);
CREATE INDEX idx_broadcast_recipients_broadcast ON broadcast_recipients (broadcast_id, status);
CREATE INDEX idx_webhooks_user ON webhooks (user_id, is_active);
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX idx_api_keys_user ON api_keys (user_id, is_active);
CREATE INDEX idx_api_key_usage_key ON api_key_usage (api_key_id, created_at DESC);
