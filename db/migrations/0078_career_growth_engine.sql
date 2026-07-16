-- Zuri Career & Growth Engine, Phase 1 — see docs/CAREER_GROWTH_ENGINE_PLAN.md.
-- Reuses relationship_connections/knowledge_graph_edges as-is (both are
-- unconstrained VARCHAR entity/type columns already — see plan §1) and
-- goal_profiles for career goals (only its linked-entities CHECK needs
-- widening). Only three genuinely new tables plus one summary column.

CREATE TABLE IF NOT EXISTS career_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  headline                  VARCHAR(255),
  summary                   TEXT,
  skills                    JSONB NOT NULL DEFAULT '[]',          -- [{name, level, yearsExperience}]
  certifications            JSONB NOT NULL DEFAULT '[]',          -- [{name, issuer, year}]
  education                 JSONB NOT NULL DEFAULT '[]',          -- [{institution, degree, field, year}]
  languages                 JSONB NOT NULL DEFAULT '[]',          -- [{name, proficiency}]
  career_goals_text         TEXT,
  target_roles              TEXT[] NOT NULL DEFAULT '{}',
  target_industries         TEXT[] NOT NULL DEFAULT '{}',
  salary_expectation_cents  BIGINT,
  salary_currency           VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  remote_preference         VARCHAR(20) CHECK (remote_preference IN ('onsite', 'hybrid', 'remote', 'no_preference')),
  relocation_preference     VARCHAR(20) CHECK (relocation_preference IN ('open', 'not_open', 'depends')),
  work_authorization        TEXT,
  github_url                TEXT,
  linkedin_url              TEXT,
  portfolio_url             TEXT,
  country                   VARCHAR(50),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS career_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  category            VARCHAR(30) NOT NULL CHECK (category IN (
                        'job', 'contract', 'consulting', 'investment', 'speaking',
                        'partnership', 'collaboration', 'freelance', 'board_position',
                        'research', 'mentorship', 'grant', 'scholarship', 'tender',
                        'supplier_opportunity', 'acquisition'
                      )),
  title               VARCHAR(255) NOT NULL,
  company_or_org      VARCHAR(255),
  description         TEXT,
  location            VARCHAR(255),
  country             VARCHAR(50),
  is_remote           BOOLEAN,
  salary_range_cents  JSONB,                  -- {min, max, currency} — nullable
  source              VARCHAR(30) NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('whatsapp_detected', 'manual', 'web_search', 'referral')),
  source_message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,
  application_url     TEXT,
  deadline            DATE,
  match_score         SMALLINT CHECK (match_score BETWEEN 0 AND 100),
  match_breakdown     JSONB NOT NULL DEFAULT '{}',   -- {skills, culture, salary, growth, location, goalAlignment}
  status              VARCHAR(20) NOT NULL DEFAULT 'detected'
                        CHECK (status IN ('detected', 'shortlisted', 'applied', 'interviewing',
                                           'offered', 'accepted', 'rejected', 'withdrawn', 'archived')),
  confidence          NUMERIC(3,2) DEFAULT 0.5,
  business_event_id   UUID REFERENCES business_events(id) ON DELETE SET NULL,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_opportunities_user_status ON career_opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_career_opportunities_contact ON career_opportunities(contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_interviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_opportunity_id UUID NOT NULL REFERENCES career_opportunities(id) ON DELETE CASCADE,
  round_number          SMALLINT NOT NULL DEFAULT 1,
  interview_type        VARCHAR(20) NOT NULL DEFAULT 'phone_screen'
                          CHECK (interview_type IN ('phone_screen', 'technical', 'behavioral', 'case', 'panel', 'final')),
  scheduled_at          TIMESTAMPTZ,
  calendar_event_id     UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  questions_asked       JSONB NOT NULL DEFAULT '[]',
  user_notes            TEXT,
  ai_feedback           TEXT,
  difficulty_rating     SMALLINT CHECK (difficulty_rating BETWEEN 1 AND 5),
  outcome               VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (outcome IN ('pending', 'passed', 'failed', 'withdrawn')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_interviews_opportunity ON career_interviews(career_opportunity_id);

-- Professional CRM (plan §3/§4) — a denormalized summary column on
-- relationships, same precedent as network_value/emotional_signals_summary.
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS career_signals JSONB NOT NULL DEFAULT '{}';

-- Career goals reuse goal_profiles as-is (plan §3) — only the linked-entity
-- CHECK needs a new value.
ALTER TABLE goal_linked_entities DROP CONSTRAINT IF EXISTS goal_linked_entities_entity_type_check;
ALTER TABLE goal_linked_entities ADD CONSTRAINT goal_linked_entities_entity_type_check
  CHECK (entity_type IN ('deal', 'project', 'product', 'contact', 'document', 'career_opportunity'));
