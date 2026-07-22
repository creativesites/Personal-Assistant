-- Migration 0103: Zuri Career OS - Three Workspace Architecture Extensions

-- 1. Application Readiness tracking on career_opportunities
ALTER TABLE career_opportunities
  ADD COLUMN IF NOT EXISTS application_readiness JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS match_breakdown_override JSONB;

-- 2. Project Interviews (Interview Workspace inside Application Workspace /projects/[id])
CREATE TABLE IF NOT EXISTS project_interviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  round_name          VARCHAR(100) NOT NULL DEFAULT 'Initial Interview',
  scheduled_at        TIMESTAMPTZ,
  interviewer_info    VARCHAR(255),
  preparation_notes   TEXT,
  star_stories        JSONB NOT NULL DEFAULT '[]',
  company_facts       JSONB NOT NULL DEFAULT '[]',
  feedback            TEXT,
  reflection          TEXT,
  confidence_score    SMALLINT DEFAULT 75 CHECK (confidence_score BETWEEN 0 AND 100),
  status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_interviews_project ON project_interviews(project_id);

-- 3. Project Communications (Communication Hub inside Application Workspace /projects/[id])
CREATE TABLE IF NOT EXISTS project_communications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel             VARCHAR(20) NOT NULL DEFAULT 'email'
                        CHECK (channel IN ('email', 'whatsapp', 'call', 'meeting', 'note')),
  contact_person      VARCHAR(255),
  summary             TEXT NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follow_up_due_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_communications_project ON project_communications(project_id);

-- 4. Project Lessons Learned (Structured Post-Mortem inside Application Workspace /projects/[id])
CREATE TABLE IF NOT EXISTS project_lessons_learned (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  what_went_well      TEXT,
  what_went_wrong     TEXT,
  takeaways           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_lessons_learned_project ON project_lessons_learned(project_id);
