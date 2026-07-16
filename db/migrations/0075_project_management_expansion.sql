-- Project Management Phase 1 + document-project linking (see
-- docs/SERVICES_PROJECTS_PLAN.md §11). projects/project_tasks (migration
-- 0060) stay exactly as they are — this only adds to them.

-- Direct document<->project linking, mirroring the supplier_id precedent
-- (migration 0057): a nullable FK, ON DELETE SET NULL. Previously a
-- project's documents were only findable via a *shared* deal_id, which
-- silently orphaned any document generated directly against a project with
-- no deal (e.g. a milestone invoice). Old deal-linked data keeps working —
-- services/api/src/routes/projects.ts unions both paths.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_milestones (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                    VARCHAR(255) NOT NULL,
  description              TEXT,
  target_date              DATE,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completion_pct           SMALLINT NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  payment_amount_cents     BIGINT,
  currency                 CHAR(3),
  requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at              TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  sort_order               INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);

-- Minimal time tracking — a start/stop timer OR a manual duration entry, a
-- billable flag, no approval workflow (matches this codebase's convention
-- of not over-engineering a phase-1 feature). The partial unique index is
-- what actually enforces "at most one running timer per user per project."
CREATE TABLE IF NOT EXISTS project_time_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id          UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_label     VARCHAR(255),
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_minutes INT,
  is_billable      BOOLEAN NOT NULL DEFAULT TRUE,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_time_entries_project ON project_time_entries(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entry_running
  ON project_time_entries(project_id, user_id) WHERE ended_at IS NULL;

-- Budget: an estimate to compare against, not a new ledger. "Actual" is
-- always computed live from linked documents/time entries (same
-- operational-overview convention as Business OS Phase G's financial
-- overview) — deliberately not accounting-grade.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_budget_cents BIGINT,
  ADD COLUMN IF NOT EXISTS budget_currency CHAR(3);

-- Idempotent dedup marker for the project-progress notification worker —
-- plays the same role document_events plays for document_followups.py, so
-- a re-run of the daily check never re-fires the same nudge twice.
CREATE TABLE IF NOT EXISTS project_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_events_project_type ON project_events(project_id, event_type);
