-- Phase 8: Autonomous Agent Engine

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  agent_type VARCHAR(50) NOT NULL, -- sales | support | community_manager | custom
  description TEXT,
  system_prompt TEXT,
  trust_level VARCHAR(30) NOT NULL DEFAULT 'suggest', -- observe | suggest | assisted | delegated | autonomous
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- Permission boundaries
  can_send_links BOOLEAN NOT NULL DEFAULT false,
  can_share_pricing BOOLEAN NOT NULL DEFAULT false,
  can_book_meetings BOOLEAN NOT NULL DEFAULT false,
  max_messages_per_day INT NOT NULL DEFAULT 50,
  -- Escalation config
  escalate_on_frustration BOOLEAN NOT NULL DEFAULT true,
  escalate_on_explicit_human_request BOOLEAN NOT NULL DEFAULT true,
  escalate_on_out_of_scope BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts/groups assigned to an agent
CREATE TABLE agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  segment_tag VARCHAR(100), -- assign by tag/segment instead of individual contact
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_assignments_target_check CHECK (contact_id IS NOT NULL OR segment_tag IS NOT NULL)
);

-- Every autonomous action the agent takes
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL, -- send_message | escalate | book_meeting | create_ticket
  input_message TEXT,
  output_message TEXT,
  reasoning TEXT,
  was_escalated BOOLEAN NOT NULL DEFAULT false,
  escalation_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Knowledge base: uploaded documents / URLs
CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL, -- NULL = global KB
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(30) NOT NULL, -- pdf | url | text | notion
  source_url TEXT,
  raw_content TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'processing', -- processing | ready | error
  chunk_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Knowledge base chunks (RAG)
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  token_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escalations: conversations paused for human attention
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  reason VARCHAR(100) NOT NULL, -- frustration | explicit_request | out_of_scope | other
  context_summary TEXT,
  urgency VARCHAR(20) NOT NULL DEFAULT 'normal', -- low | normal | high | critical
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | in_progress | resolved
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_user ON agents (user_id);
CREATE INDEX idx_agent_actions_agent ON agent_actions (agent_id);
CREATE INDEX idx_agent_actions_created ON agent_actions (created_at DESC);
CREATE INDEX idx_kb_documents_user ON kb_documents (user_id);
CREATE INDEX idx_kb_chunks_document ON kb_chunks (document_id);
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_escalations_status ON escalations (status, urgency, created_at DESC);
