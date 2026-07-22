"""Job Scraper Engine Orchestrator

Handles the orchestration and database insertion for all modular job scrapers.
Includes Canonical Job merging for deduplication and Freshness tracking.
"""
import asyncio
from datetime import datetime, timezone
import structlog
from bs4 import BeautifulSoup # Ensure beautifulsoup is accessible if needed

from ..database import get_pool
from .scrapers import _SCRAPERS
from .scrapers.base import BaseScraper

log = structlog.get_logger()

async def _upsert_jobs(pool, source: str, jobs: list[dict]) -> int:
    """Insert new jobs, calculate freshness, and handle canonical deduplication.
    Returns new-job count.
    """
    if not jobs:
        return 0
    new_count = 0
    async with pool.acquire() as conn:
        for job in jobs:
            # Simple Canonical Deduplication Logic
            # Check if an identical job exists from another source within last 14 days
            # Match strictly on lowercase title and company.
            canonical_job_id = None
            if job.get('company'):
                existing_canonical = await conn.fetchrow(
                    """
                    SELECT id FROM scraped_jobs
                    WHERE LOWER(title) = $1
                      AND LOWER(company) = $2
                      AND source != $3
                      AND posted_at >= NOW() - INTERVAL '14 days'
                    ORDER BY posted_at DESC NULLS LAST
                    LIMIT 1
                    """,
                    job['title'].lower(),
                    job['company'].lower(),
                    source
                )
                if existing_canonical:
                    canonical_job_id = existing_canonical['id']

            # Calculate freshness based on source and date
            freshness_score = 100
            expiration_probability = 0.0
            
            # Simple decay based on posted_at
            if job.get('posted_at'):
                age_days = (datetime.now(tz=timezone.utc) - job['posted_at']).days
                if age_days > 0:
                    freshness_score = max(0, 100 - (age_days * 3))
                    expiration_probability = min(1.0, age_days / 30.0)
            
            source_reliability = 80 if source == 'facebook_zambia' else 90

            row = await conn.fetchrow(
                """
                INSERT INTO scraped_jobs
                  (source, source_url, title, company, location, job_type,
                   salary_range, description, skills, posted_at,
                   contact_email, contact_phone, application_url,
                   freshness_score, last_verified_at, source_reliability, 
                   expiration_probability, canonical_job_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,$16,$17)
                ON CONFLICT (source, source_url) DO UPDATE
                  SET scraped_at = NOW(),
                      last_verified_at = NOW(),
                      title      = EXCLUDED.title,
                      company    = EXCLUDED.company,
                      location   = EXCLUDED.location,
                      salary_range = EXCLUDED.salary_range,
                      description  = EXCLUDED.description,
                      skills       = EXCLUDED.skills,
                      contact_email = EXCLUDED.contact_email,
                      contact_phone = EXCLUDED.contact_phone,
                      application_url = EXCLUDED.application_url,
                      freshness_score = EXCLUDED.freshness_score,
                      expiration_probability = EXCLUDED.expiration_probability,
                      canonical_job_id = EXCLUDED.canonical_job_id,
                      expires_at   = NOW() + INTERVAL '30 days'
                RETURNING (xmax = 0) AS is_new
                """,
                source,
                job['source_url'],
                job['title'][:500] if job.get('title') else 'Unknown',
                job.get('company')[:255] if job.get('company') else None,
                job.get('location')[:255] if job.get('location') else 'Zambia',
                job.get('job_type') or 'local',
                job.get('salary_range')[:255] if job.get('salary_range') else None,
                job.get('description'),
                job.get('skills') or [],
                job.get('posted_at'),
                job.get('contact_email')[:255] if job.get('contact_email') else None,
                job.get('contact_phone')[:50] if job.get('contact_phone') else None,
                job.get('application_url') or job['source_url'],
                freshness_score,
                source_reliability,
                expiration_probability,
                canonical_job_id
            )
            if row and row['is_new']:
                new_count += 1
    return new_count


async def run_all_scrapers() -> dict[str, int]:
    """Run all Phase 1 and Phase 2 scrapers concurrently. Returns {source: new_jobs}."""
    pool = await get_pool()
    results: dict[str, int] = {}

    async def _run_one(scraper: BaseScraper) -> None:
        start = datetime.now(tz=timezone.utc)
        run_id = None
        try:
            async with pool.acquire() as conn:
                run_id = await conn.fetchval(
                    "INSERT INTO scraper_runs (source) VALUES ($1) RETURNING id",
                    scraper.source,
                )
                
            # Pre-fetch existing URLs for this scraper source to prevent duplicate deep fetches
            existing_urls = set()
            try:
                async with pool.acquire() as conn:
                    rows = await conn.fetch("SELECT source_url FROM scraped_jobs WHERE source = $1", scraper.source)
                    existing_urls = {r['source_url'] for r in rows}
            except Exception as e:
                log.warning('scraper_failed_to_fetch_existing_urls', source=scraper.source, error=str(e))
                
            jobs = await scraper.scrape()
            
            import httpx
            from .scrapers.base import _HEADERS, _REQUEST_TIMEOUT
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT, headers=_HEADERS) as client:
                await scraper._fetch_and_enrich_details(client, jobs, existing_urls)
            
            new_jobs = await _upsert_jobs(pool, scraper.source, jobs)
            results[scraper.source] = new_jobs

            if run_id:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE scraper_runs
                        SET finished_at = NOW(),
                            jobs_found = $1,
                            jobs_new = $2,
                            success = TRUE
                        WHERE id = $3
                        """,
                        len(jobs), new_jobs, run_id
                    )
            log.info('scraper_success', source=scraper.source, new=new_jobs, total=len(jobs), duration=(datetime.now(tz=timezone.utc) - start).total_seconds())
        except Exception as exc:
            log.error('scraper_failed', source=scraper.source, error=str(exc))
            if run_id:
                try:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE scraper_runs SET finished_at = NOW(), success = FALSE, error_message = $1 WHERE id = $2",
                            str(exc)[:1000], run_id
                        )
                except Exception:
                    pass

    # Concurrency limit to prevent database connection pool exhaustion
    sem = asyncio.Semaphore(3)

    async def _run_with_sem(s):
        async with sem:
            await _run_one(s)

    await asyncio.gather(*[_run_with_sem(s) for s in _SCRAPERS])
    return results


class _JobScraperService:
    async def run(self) -> dict[str, int]:
        return await run_all_scrapers()

def get_job_scraper():
    return _JobScraperService()
