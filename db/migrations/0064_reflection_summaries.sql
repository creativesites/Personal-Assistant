-- Zuri Neural Layer Phase 3 — Reflection Engine + Life Timeline (see
-- docs/NEURAL_LAYER_PLAN.md §4.7/§10). Nothing like this exists anywhere
-- in the codebase before this phase — a weekly job synthesizes what
-- changed using signals every other engine already produces, no new
-- detection pass.

CREATE TABLE IF NOT EXISTS reflection_summaries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type  VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  highlights   JSONB NOT NULL DEFAULT '[]',   -- [{"category": "relationship", "text": "...", "evidence": [...]}]
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reflection_summaries_user ON reflection_summaries(user_id, period_type, period_start DESC);

-- Required for the "you completed N tasks this week" highlight — the
-- table had no timestamp recording when a task was actually marked done,
-- only its current status (see docs/NEURAL_LAYER_PLAN.md §10 Phase 3
-- scope note).
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
