-- Job Search OS — manual "Fetch Jobs" trigger (docs/CV_STUDIO_PLAN.md's Core
-- Discovery Loop, see job_discovery.py). The daily 05:00 UTC cron already
-- runs JobDiscoveryService.run_for_user() for every opted-in user; this adds
-- a user-initiated on-demand run capped at 3 *successful* runs per day (a
-- failed attempt — e.g. the search planner call errors — doesn't count
-- against the cap, since it wasted no real discovery attempt). One row per
-- manual invocation, success flag set only once the run actually completed;
-- the cap is enforced by counting today's success=true rows, same "log an
-- event, count it back" discipline as action_bundles' 60-minute dedup window.
CREATE TABLE IF NOT EXISTS career_job_discovery_manual_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  opportunities_found INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_job_discovery_manual_runs_user_day
  ON career_job_discovery_manual_runs (user_id, created_at);
