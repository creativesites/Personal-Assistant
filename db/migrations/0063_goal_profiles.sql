-- Zuri Neural Layer Phase 2 — cross-module Goal Engine (see
-- docs/NEURAL_LAYER_PLAN.md §4.4/§10). Distinct from the existing
-- relationship_goals table (per-relationship goals like "stay close to
-- Grace") — these are goals that span the whole business/life ("grow
-- monthly revenue to $20,000") and can link to any entity (deals,
-- projects, products), not just one contact. Both tiers stay permanently
-- (see the plan's own §11 open decision #2) — this does not replace
-- relationship_goals.

CREATE TABLE IF NOT EXISTS goal_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  goal_type     VARCHAR(20) NOT NULL CHECK (goal_type IN ('business', 'personal')),
  target_value  JSONB,   -- {"metric": "monthly_revenue_cents", "target": 2000000, "by_date": "2026-12-31"} — optional, not every goal is quantifiable
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'paused')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_profiles_user ON goal_profiles(user_id, status);

CREATE TABLE IF NOT EXISTS goal_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,   -- 'advisor_conversation' | 'deal' | 'project' | 'contact_life_event' | 'document' | 'manual'
  source_id   UUID,                    -- polymorphic reference, nullable for free-text notes
  summary     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_memories_goal ON goal_memories(goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS goal_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  metric_value JSONB NOT NULL,   -- snapshot of target_value's metric at this point in time
  note         TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress(goal_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS goal_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL,   -- 'milestone' | 'setback' | 'reprioritized' | 'linked_entity_added' | 'conflict_flagged'
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_events_goal ON goal_events(goal_id, created_at DESC);

-- Polymorphic join so any entity (deal, project, product, contact,
-- document) can be tagged against a cross-module goal, without a
-- parallel per-module goal-linking table.
CREATE TABLE IF NOT EXISTS goal_linked_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('deal', 'project', 'product', 'contact', 'document')),
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (goal_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_linked_entities_goal ON goal_linked_entities(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_linked_entities_entity ON goal_linked_entities(entity_type, entity_id);
