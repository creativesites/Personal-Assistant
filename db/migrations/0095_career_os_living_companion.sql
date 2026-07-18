-- Career OS "Living Companion" Redesign — onboarding/career-mode tracking
-- + live progress for job-discovery runs. See docs/CAREER_GROWTH_ENGINE_PLAN.md
-- for the base Career OS design this builds on.

-- career_profiles gains: a career mode (drives page-section reordering, see
-- career/page.tsx), two genuinely-missing quick-start fields the onboarding
-- flow needs (experience_level, employment_type_preference — neither existed
-- anywhere in the schema before), and first_search_started_at, which marks
-- the one auto-triggered first run so it (a) never re-fires and (b) is
-- exempt from career_job_discovery_manual_runs' daily cap.
ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS career_mode VARCHAR(20)
    CHECK (career_mode IN ('job_seeker', 'employed', 'freelancer', 'business_owner', 'networking')),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20)
    CHECK (experience_level IN ('entry', 'mid', 'senior', 'lead', 'executive')),
  ADD COLUMN IF NOT EXISTS employment_type_preference TEXT[],
  ADD COLUMN IF NOT EXISTS first_search_started_at TIMESTAMPTZ;

-- Live status for an in-flight (or just-finished) job-discovery run — a
-- sibling to career_job_discovery_manual_runs (which stays exactly as-is for
-- daily-cap counting), this one exists purely so the frontend can show real
-- progress ("Searching Zambian employers...", 2/6 passes, 7 found so far)
-- while a run is happening, and so a page reload mid-run can recover state
-- via a plain GET instead of only ever being reachable through a live socket
-- connection. One row per run, updated in place as job_discovery.py's
-- restructured per-pass loop progresses.
CREATE TABLE IF NOT EXISTS career_job_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  phase VARCHAR(30),
  passes_completed INTEGER NOT NULL DEFAULT 0,
  passes_total INTEGER NOT NULL DEFAULT 0,
  opportunities_found INTEGER NOT NULL DEFAULT 0,
  is_manual BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_job_discovery_runs_user ON career_job_discovery_runs (user_id, started_at DESC);
