-- Zuri CV Studio, Phase 1 — Master Career Profile foundation (see
-- docs/CV_STUDIO_PLAN.md §3, §18 Phase 1). Upgrades career_profiles'
-- Phase-1 flat JSONB-array fields (skills/certifications/education) into
-- real per-entry tables, needed once they're edited field-by-field in a
-- wizard rather than written once by an LLM call. All new tables are
-- user_id-scoped and editable independently of any specific CV.
--
-- career_profiles itself keeps personal details plus the new fields the
-- wizard's Step 14 (Additional Information) needs — reusing existing
-- columns where they already fit (relocation_preference, salary_
-- expectation_cents, work_authorization) rather than duplicating them.

ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS phone                 VARCHAR(30),
  ADD COLUMN IF NOT EXISTS location               VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website_url             TEXT,
  ADD COLUMN IF NOT EXISTS driving_licence         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nationality             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS passport_or_nrc         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS availability            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notice_period           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS interests               TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS references_mode         VARCHAR(20) NOT NULL DEFAULT 'available_on_request'
                                                      CHECK (references_mode IN ('available_on_request', 'listed')),
  ADD COLUMN IF NOT EXISTS default_page_size       VARCHAR(10) NOT NULL DEFAULT 'A4'
                                                      CHECK (default_page_size IN ('A4', 'Letter')),
  ADD COLUMN IF NOT EXISTS use_cv_terminology      BOOLEAN NOT NULL DEFAULT TRUE;

-- Nationality/passport-or-NRC are deliberately plain nullable columns, not
-- schema-level "hidden by default" flags — visibility is a wizard/UI concern
-- (docs/CV_STUDIO_PLAN.md §14), the same way every other optional field in
-- this codebase works.

CREATE TABLE IF NOT EXISTS career_employment_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer              VARCHAR(255) NOT NULL,
  title                  VARCHAR(255) NOT NULL,
  location               VARCHAR(255),
  employment_type        VARCHAR(30) CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'freelance', 'volunteer')),
  start_date             DATE,
  end_date               DATE,
  is_current             BOOLEAN NOT NULL DEFAULT FALSE,
  responsibilities        TEXT,
  achievements           TEXT[] NOT NULL DEFAULT '{}',
  technologies           TEXT[] NOT NULL DEFAULT '{}',
  manager_name            VARCHAR(255),
  reference_available     BOOLEAN NOT NULL DEFAULT FALSE,
  reason_for_leaving       TEXT, -- private-only — never rendered on a generated CV
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_employment_history_user ON career_employment_history(user_id);

CREATE TABLE IF NOT EXISTS career_education_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution        VARCHAR(255) NOT NULL,
  qualification      VARCHAR(255),
  programme          VARCHAR(255),
  start_date         DATE,
  end_date           DATE,
  grade              VARCHAR(100),
  awards             TEXT,
  relevant_modules   TEXT[] NOT NULL DEFAULT '{}',
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_education_entries_user ON career_education_entries(user_id);

CREATE TABLE IF NOT EXISTS career_certifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 VARCHAR(255) NOT NULL,
  issuer               VARCHAR(255),
  issued_date          DATE,
  expiry_date          DATE,
  credential_id        VARCHAR(255),
  url                  TEXT,
  upload_document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  sort_order           INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_certifications_user ON career_certifications(user_id);

CREATE TABLE IF NOT EXISTS career_skill_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_name    VARCHAR(100) NOT NULL,
  skills       TEXT[] NOT NULL DEFAULT '{}',
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_skill_groups_user ON career_skill_groups(user_id);

CREATE TABLE IF NOT EXISTS career_awards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  issuer       VARCHAR(255),
  award_date   DATE,
  description  TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_awards_user ON career_awards(user_id);

CREATE TABLE IF NOT EXISTS career_volunteer_work (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation   VARCHAR(255) NOT NULL,
  role          VARCHAR(255),
  start_date     DATE,
  end_date       DATE,
  description   TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_volunteer_work_user ON career_volunteer_work(user_id);

-- Freeform institution field — never a hardcoded dropdown (Engineering
-- Institution of Zambia, medical/legal/accounting bodies, etc. must all
-- work without being enumerated, docs/CV_STUDIO_PLAN.md §14).
CREATE TABLE IF NOT EXISTS career_memberships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution          VARCHAR(255) NOT NULL,
  membership_number    VARCHAR(100),
  since_date           DATE,
  sort_order           INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_memberships_user ON career_memberships(user_id);

CREATE TABLE IF NOT EXISTS career_publications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              VARCHAR(255) NOT NULL,
  publisher          VARCHAR(255),
  publication_date    DATE,
  url                TEXT,
  co_authors         TEXT[] NOT NULL DEFAULT '{}',
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_publications_user ON career_publications(user_id);

-- One row per *listed* reference — career_profiles.references_mode is
-- the per-user 'available_on_request' vs 'listed' switch (§14).
CREATE TABLE IF NOT EXISTS career_references (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  company        VARCHAR(255),
  phone          VARCHAR(30),
  email          VARCHAR(255),
  relationship   VARCHAR(100),
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_references_user ON career_references(user_id);

-- One CV is one row here (§3). A tailored variant is a new row with
-- source_cv_id set (mirrors documents.source_document_id's version-chain
-- convention) — facts (employment/education/certifications) are always
-- read live from the tables above, never copied.
CREATE TABLE IF NOT EXISTS career_cvs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                  VARCHAR(255) NOT NULL,
  template_key           VARCHAR(30) NOT NULL DEFAULT 'professional'
                           CHECK (template_key IN ('professional', 'modern', 'executive', 'creative')),
  page_size              VARCHAR(10) NOT NULL DEFAULT 'A4' CHECK (page_size IN ('A4', 'Letter')),
  is_master              BOOLEAN NOT NULL DEFAULT FALSE,
  career_opportunity_id   UUID REFERENCES career_opportunities(id) ON DELETE SET NULL,
  source_cv_id            UUID REFERENCES career_cvs(id) ON DELETE SET NULL,
  structured_content      JSONB NOT NULL DEFAULT '{}', -- summary override, skills order, achievement emphasis, theme
  current_version         INT NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_cvs_user ON career_cvs(user_id);
CREATE INDEX IF NOT EXISTS idx_career_cvs_source ON career_cvs(source_cv_id) WHERE source_cv_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_cv_sections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id          UUID NOT NULL REFERENCES career_cvs(id) ON DELETE CASCADE,
  section_type    VARCHAR(50) NOT NULL, -- summary | employment | education | certifications | skills | projects | awards | volunteer | memberships | publications | references
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  custom_heading  VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cv_id, section_type)
);
CREATE INDEX IF NOT EXISTS idx_career_cv_sections_cv ON career_cv_sections(cv_id);

-- Projects reuse, not duplication (§3, Step 8) — a CV's Projects section is
-- a join to the existing `projects` table, never a copy of project data.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_portfolio_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS career_cv_project_links (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id                       UUID NOT NULL REFERENCES career_cvs(id) ON DELETE CASCADE,
  project_id                  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order                  INT NOT NULL DEFAULT 0,
  custom_description_override  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cv_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_career_cv_project_links_cv ON career_cv_project_links(cv_id);

-- Every save = a new version (§10). Restore/duplicate/compare all operate
-- on these snapshots — never destructive.
CREATE TABLE IF NOT EXISTS career_cv_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id           UUID NOT NULL REFERENCES career_cvs(id) ON DELETE CASCADE,
  version_number   INT NOT NULL,
  snapshot        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cv_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_career_cv_versions_cv ON career_cv_versions(cv_id);

-- Honest backfill from the Phase-1 flat JSONB fields, matching this
-- codebase's "backfill is a floor, not an exact figure" convention — only
-- covers rows with actual data, skips anything malformed rather than
-- failing the migration.
INSERT INTO career_skill_groups (user_id, group_name, skills, sort_order)
SELECT cp.user_id, 'Skills',
       ARRAY(SELECT COALESCE(s->>'name', s#>>'{}') FROM jsonb_array_elements(cp.skills) s WHERE s IS NOT NULL),
       0
FROM career_profiles cp
WHERE jsonb_array_length(cp.skills) > 0
  AND NOT EXISTS (SELECT 1 FROM career_skill_groups sg WHERE sg.user_id = cp.user_id);

INSERT INTO career_certifications (user_id, name, issuer, issued_date, sort_order)
SELECT cp.user_id,
       COALESCE(c->>'name', 'Certification'),
       c->>'issuer',
       CASE WHEN (c->>'year') ~ '^\d{4}$' THEN to_date(c->>'year', 'YYYY') ELSE NULL END,
       ord - 1
FROM career_profiles cp, jsonb_array_elements(cp.certifications) WITH ORDINALITY AS t(c, ord)
WHERE jsonb_array_length(cp.certifications) > 0;

INSERT INTO career_education_entries (user_id, institution, qualification, programme, end_date, sort_order)
SELECT cp.user_id,
       COALESCE(e->>'institution', 'Institution'),
       e->>'degree',
       e->>'field',
       CASE WHEN (e->>'year') ~ '^\d{4}$' THEN to_date(e->>'year', 'YYYY') ELSE NULL END,
       ord - 1
FROM career_profiles cp, jsonb_array_elements(cp.education) WITH ORDINALITY AS t(e, ord)
WHERE jsonb_array_length(cp.education) > 0;
