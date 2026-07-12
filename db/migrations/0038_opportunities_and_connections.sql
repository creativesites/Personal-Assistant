-- Relationship OS Phase 2 — Opportunities & Business Graph.
-- See docs/RELATIONSHIP_OS_PLAN.md §5.7/§5.8/§5.11/§6.7/§12.
--
-- Before this migration, "opportunity" was just an insight_key naming
-- convention (OPPORTUNITY_KEYS) read ad-hoc off contact_insights on every
-- page load, with no way to list/prioritize/expire/link one to a deal.
-- opportunities promotes that to a real table. relationship_connections is
-- the Business Graph — AI-discovered (or manually confirmed) links between
-- two contacts, using the same confidence/evidence-count pattern already
-- established by business_facts.

CREATE TABLE IF NOT EXISTS opportunities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id             UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_type       VARCHAR(30) NOT NULL CHECK (opportunity_type IN
                           ('buying_signal', 'expansion', 'referral_moment', 'renewal_due',
                            'life_event', 'reconnect_window', 'churn_risk', 'support_needed')),
  title                  VARCHAR(255) NOT NULL,
  description            TEXT,
  estimated_value_cents  BIGINT,             -- business only; NULL for personal-type opportunities
  confidence             DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  status                 VARCHAR(20) NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'acted_on', 'dismissed', 'expired')),
  source_message_ids     JSONB NOT NULL DEFAULT '[]',
  linked_deal_id         UUID REFERENCES deals(id) ON DELETE SET NULL,
  detected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ,
  resolved_at            TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_open ON opportunities(user_id, status) WHERE status = 'open';

-- Deals can point back at the opportunity that spawned them (§5.9's schema).
ALTER TABLE deals ADD COLUMN IF NOT EXISTS linked_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS relationship_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_a_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  connection_type   VARCHAR(50) NOT NULL, -- works_with | introduced_by | owns | refers_to | family_of | friend_of | married_to
  confidence        DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  source            VARCHAR(20) NOT NULL DEFAULT 'ai_inference' CHECK (source IN ('ai_inference', 'manual')),
  evidence_count    INT NOT NULL DEFAULT 1,
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_a_id, contact_b_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_relationship_connections_a ON relationship_connections(contact_a_id);
CREATE INDEX IF NOT EXISTS idx_relationship_connections_b ON relationship_connections(contact_b_id);
