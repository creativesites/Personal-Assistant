-- Business Events architecture — see docs/BUSINESS_EVENTS_PLAN.md.
-- A generic, durable log of every detected business signal (new product
-- mentioned, new supplier mentioned, etc.), independent of whether it ends
-- up producing a user-facing action. Named `business_events`, not "business
-- intelligence events" — this codebase already ships a "Business
-- Intelligence & Executive Intelligence Platform" (Phase 9 analytics
-- dashboards); reusing that name here would collide.

CREATE TABLE IF NOT EXISTS business_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type      VARCHAR(40) NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  evidence        JSONB NOT NULL DEFAULT '[]',
  payload         JSONB NOT NULL DEFAULT '{}',
  bundle_id       UUID REFERENCES action_bundles(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'bundled', 'dismissed', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_events_user_status ON business_events(user_id, status);
CREATE INDEX IF NOT EXISTS idx_business_events_contact ON business_events(contact_id) WHERE contact_id IS NOT NULL;

-- Confidence + evidence surfacing on the existing action_bundles approval
-- card (Business OS Phase E, migration 0059) — so a bundle can explain
-- itself instead of just showing a free-text summary.
ALTER TABLE action_bundles ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);
ALTER TABLE action_bundles ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]';

-- Product lifecycle widen (see docs/BUSINESS_EVENTS_PLAN.md §6). 'sold' is
-- confirmed dead — referenced only in a Zod enum, never queried against —
-- backfilled to 'archived' before the CHECK is replaced. 'secondary' is the
-- "record it, don't clutter the main catalog" state (a one-off item a
-- business sourced for a single job); 'discontinued' is new — distinct from
-- 'archived' (hidden/old data) as "no longer available, keep the history."
UPDATE products SET status = 'archived' WHERE status = 'sold';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'secondary', 'archived', 'discontinued'));

-- Business Manager Assistant toggle — same table, same "paused=false means
-- on by default" precedent as companion_features_paused (Advisor Companion
-- Plan Phase 0, migration 0066).
ALTER TABLE advisor_user_profiles ADD COLUMN IF NOT EXISTS business_manager_paused BOOLEAN NOT NULL DEFAULT FALSE;
