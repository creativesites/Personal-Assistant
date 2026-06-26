CREATE TYPE snapshot_type AS ENUM ('relationship_summary', 'recent_context', 'topic_cluster', 'event_history');

CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  tone_characteristics JSONB NOT NULL DEFAULT '{}',
  vocabulary_patterns JSONB NOT NULL DEFAULT '{}',
  sample_phrases JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_communication_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  writing_style JSONB,
  typical_response_time_minutes INTEGER,
  active_hours JSONB,
  common_phrases JSONB,
  emoji_usage_frequency DECIMAL(5,4),
  formality_score DECIMAL(5,4),
  avg_message_length INTEGER,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personality_summary TEXT,
  communication_style TEXT,
  emotional_patterns JSONB,
  known_triggers JSONB,
  current_life_context TEXT,
  mood_baseline VARCHAR(100),
  preferred_contact_frequency VARCHAR(100),
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_key VARCHAR(255) NOT NULL,
  insight_value TEXT NOT NULL,
  confidence DECIMAL(5,4),
  evidence_count INTEGER NOT NULL DEFAULT 1,
  source_message_ids JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by UUID REFERENCES contact_insights(id),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_type snapshot_type NOT NULL,
  summary TEXT NOT NULL,
  embedding vector(1536),
  covers_from TIMESTAMPTZ,
  covers_to TIMESTAMPTZ,
  token_count INTEGER,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
