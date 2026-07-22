-- Career OS Enrichment & Intelligence System

-- 1. Scraped Jobs: Freshness, Reliability, and Deduplication
ALTER TABLE scraped_jobs
  ADD COLUMN IF NOT EXISTS freshness_score SMALLINT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_reliability SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS expiration_probability NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS canonical_job_id UUID REFERENCES scraped_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scraped_jobs_canonical ON scraped_jobs(canonical_job_id);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_freshness ON scraped_jobs(freshness_score DESC);

-- 2. Career Profiles: Target Companies Preference
ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS target_companies TEXT[] NOT NULL DEFAULT '{}';

-- 3. Career Opportunities: Application Learning Loop (Ghosted Status & Notes)
ALTER TABLE career_opportunities DROP CONSTRAINT IF EXISTS career_opportunities_status_check;
ALTER TABLE career_opportunities ADD CONSTRAINT career_opportunities_status_check
  CHECK (status IN ('detected', 'shortlisted', 'applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'archived', 'ghosted'));

ALTER TABLE career_opportunities
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS outcome_logged_at TIMESTAMPTZ;
