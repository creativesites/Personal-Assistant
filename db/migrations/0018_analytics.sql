-- Phase 9: Business Intelligence Engine

-- Funnel stage tracking per conversation
CREATE TABLE conversation_funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage VARCHAR(50) NOT NULL, -- lead | qualified | opportunity | proposal | closed_won | closed_lost | churned
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  notes TEXT
);

-- Suggestion acceptance tracking (extend suggested_replies logic)
CREATE TABLE suggestion_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES suggested_replies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome VARCHAR(20) NOT NULL, -- approved | edited | rejected | ignored
  edit_distance INT, -- character diff if edited
  time_to_decision_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revenue attribution: link deal events to conversations
CREATE TABLE revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL, -- deal_closed | upsell | renewal | churn
  amount_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  description TEXT,
  attributed_to_ai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- General analytics event log (flexible)
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name VARCHAR(100) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cached report snapshots (avoid recomputing heavy queries)
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_type VARCHAR(50) NOT NULL, -- monthly_digest | weekly_summary | funnel_state
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_funnel_stages_user ON conversation_funnel_stages (user_id, stage);
CREATE INDEX idx_funnel_stages_conversation ON conversation_funnel_stages (conversation_id);
CREATE INDEX idx_suggestion_outcomes_user ON suggestion_outcomes (user_id, created_at DESC);
CREATE INDEX idx_revenue_events_user ON revenue_events (user_id, created_at DESC);
CREATE INDEX idx_analytics_events_user_name ON analytics_events (user_id, event_name, created_at DESC);
CREATE INDEX idx_analytics_snapshots_user ON analytics_snapshots (user_id, snapshot_type, period_start);
