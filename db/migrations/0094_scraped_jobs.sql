-- Job Scraper Engine (docs/CV_STUDIO_PLAN.md §17 — multi-source job discovery).
-- scraped_jobs holds raw job listings pulled from local Zambia boards and
-- regional/international sites by services/intelligence/app/services/job_scraper.py.
-- Distinct from career_opportunities (user-curated, status-tracked) — scraped_jobs
-- is the raw ingest layer; job_discovery.py promotes matches into career_opportunities
-- (source='web_search'/'scraper') after scoring against the user's career_profile.
-- A job stays in scraped_jobs until it expires (stale after 30 days) — no per-user
-- ownership, just a shared global listings pool deduplicated by (source, source_url).

CREATE TABLE IF NOT EXISTS scraped_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(100) NOT NULL,            -- 'gozambia' | 'jobsearchzm' | 'zambiajobs' | 'jobberman_zm' | 'indeed_zm' | 'linkedin' | 'remoteok' | 'weworkremotely'
  source_url      TEXT NOT NULL,
  title           VARCHAR(500) NOT NULL,
  company         VARCHAR(255),
  location        VARCHAR(255),
  job_type        VARCHAR(50),                       -- 'local' | 'remote' | 'hybrid'
  salary_range    VARCHAR(255),
  description     TEXT,
  skills          TEXT[] NOT NULL DEFAULT '{}',      -- extracted skill keywords
  posted_at       TIMESTAMPTZ,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  embedding       vector(1536),                      -- for semantic match scoring
  CONSTRAINT scraped_jobs_source_url_unique UNIQUE (source, source_url)
);

CREATE INDEX IF NOT EXISTS idx_scraped_jobs_source ON scraped_jobs(source);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_scraped_at ON scraped_jobs(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_expires_at ON scraped_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_skills ON scraped_jobs USING GIN(skills);
-- pgvector cosine similarity index for match scoring
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_embedding ON scraped_jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- scraper_runs tracks each scrape run for observability and rate-limit enforcement
CREATE TABLE IF NOT EXISTS scraper_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(100) NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  jobs_found      INTEGER NOT NULL DEFAULT 0,
  jobs_new        INTEGER NOT NULL DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON scraper_runs(source, started_at DESC);
