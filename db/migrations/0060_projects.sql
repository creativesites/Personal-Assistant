-- Business OS Phase F — lightweight project management. See
-- docs/BUSINESS_OS_PLAN.md §11. Deliberately minimal (two tables, no
-- Gantt/dependency graph) — "lightweight ERP project management," not a
-- project-management product. documents.deal_id already exists, so a
-- project's invoices/quotations are found via documents.deal_id =
-- projects.deal_id — no new FK needed on documents.

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL,
  title         VARCHAR(255) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  start_date    DATE,
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_contact ON projects(contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  due_date    DATE,
  assigned_to VARCHAR(255), -- free text until multi-seat accounts exist (plan §10/§19)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
