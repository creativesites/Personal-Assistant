"""Job Scraper Engine — Phase 1: local Zambia job boards.

Scrapes real job listings from local and regional boards as the primary
reliable source for job_discovery.py, supplementing (not replacing) the
existing AI/Tavily search engine. The AI search engine excels at finding
niche, recent, and tailored results; the scraper provides volume and
freshness for the high-traffic local boards where AI search tends to return
the same top-of-page results regardless of query.

Phase 1 sites:
  gozambia      — GoZambiaJobs.com
  jobsearchzm   — JobSearchZM.com
  jobberman_zm  — Jobberman Zambia (jobberman.com/zm/)

Deliberately uses httpx + BeautifulSoup only — no Playwright/Chromium for
now, consistent with the Docker image which has no browser dependencies.
Sites that require JS rendering return empty results gracefully rather than
crashing. Each scraper is isolated; one site failing never blocks the others.

Storage: scraped_jobs table (migration 0094). Deduplicated by (source,
source_url) — a job that appears on multiple runs updates its scraped_at
rather than duplicating. Expires after 30 days (expires_at column).

The scraper intentionally does NOT embed or score against user profiles —
that's job_discovery.py's role. The scraper just fills the pool; discovery
queries the pool + filters + scores per user.
"""
import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
import structlog

from ..database import get_pool

log = structlog.get_logger()

_REQUEST_TIMEOUT = 20.0
_MAX_PAGES_PER_SITE = 3     # don't hammer any site
_MAX_JOBS_PER_RUN = 150     # hard cap per site per run

_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (compatible; Zuri-JobBot/1.0; +https://zuri.app/bot) '
        'Gecko/20100101 Firefox/120.0'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
}


# ── Shared HTML parsing helpers ────────────────────────────────────────────

def _text(el) -> str:
    """Safe inner text from a BeautifulSoup element."""
    return el.get_text(separator=' ', strip=True) if el else ''


def _first(soup, *selectors: str):
    """Return first element matching any of the given CSS selectors."""
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            return el
    return None


def _extract_skills(text: str) -> list[str]:
    """Very lightweight skill keyword extraction from job text."""
    SKILL_KEYWORDS = {
        'python', 'javascript', 'typescript', 'java', 'sql', 'excel', 'powerbi',
        'accounting', 'finance', 'marketing', 'sales', 'management', 'project management',
        'communication', 'leadership', 'analysis', 'data analysis', 'research',
        'engineering', 'nursing', 'teaching', 'procurement', 'logistics', 'hr',
        'human resources', 'customer service', 'it', 'networking', 'linux', 'windows',
        'audit', 'tax', 'compliance', 'banking', 'insurance', 'healthcare',
        'agriculture', 'mining', 'construction', 'architecture', 'legal',
        'administration', 'secretarial', 'driver', 'security', 'hospitality',
    }
    lower = text.lower()
    return [kw for kw in SKILL_KEYWORDS if kw in lower]


def _normalise_date(raw: str) -> Optional[datetime]:
    """Best-effort parse of common date strings found on job boards."""
    if not raw:
        return None
    raw = raw.strip()
    # "X days ago" / "X hours ago"
    m = re.search(r'(\d+)\s+day', raw, re.I)
    if m:
        return datetime.now(tz=timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0,
        ) - __import__('datetime').timedelta(days=int(m.group(1)))
    m = re.search(r'(\d+)\s+hour', raw, re.I)
    if m:
        return datetime.now(tz=timezone.utc)
    # ISO-ish: 2025-01-15
    m = re.search(r'(\d{4}-\d{2}-\d{2})', raw)
    if m:
        try:
            return datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    # "15 Jan 2025" / "January 15, 2025"
    for fmt in ('%d %b %Y', '%d %B %Y', '%B %d, %Y', '%b %d, %Y'):
        try:
            return datetime.strptime(raw[:20], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _extract_email(text: str) -> Optional[str]:
    """Extract first valid email from job text, excluding common placeholder/template emails."""
    if not text:
        return None
    emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', text)
    for email in emails:
        # Filter out common framework / asset domains
        if not any(x in email.lower() for x in ['example.com', 'domain.com', 'yourcompany', 'w3.org', 'bootstrap', 'jquery', 'sentry.io', 'github.com']):
            return email
    return None


def _extract_phone(text: str) -> Optional[str]:
    """Extract Zambian phone number from text if present, formatted cleanly."""
    if not text:
        return None
    # Zambian phone format standardisation
    clean = re.sub(r'[\s\-\(\)]', '', text)
    m = re.search(r'(?:\+260|260|0)[79]\d{8}\b', clean)
    if m:
        phone = m.group(0)
        # Standardise to 07... or 09... for local, or +260... if preferred.
        if phone.startswith('260'):
            return '+' + phone
        if phone.startswith('0'):
            return phone
        return phone
    return None


def _extract_apply_url(soup, source_url: str) -> Optional[str]:
    """Look for explicit 'Apply' / 'How to Apply' links or mailto: links in the HTML."""
    if not soup:
        return None
    # Prioritise mailto links
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        if href.lower().startswith('mailto:'):
            return href
            
    # Look for button/link text that implies applying
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        text = a.get_text(separator=' ', strip=True).lower()
        if any(kw in text for kw in ['apply', 'application', 'submit cv', 'submit resume', 'register to apply', 'how to apply']):
            if href.startswith('http') and not any(x in href.lower() for x in ['facebook.com', 'twitter.com', 'linkedin.com', 'share', 'login', 'register']):
                return href
    return None


# ── Base scraper ───────────────────────────────────────────────────────────

class BaseScraper:
    source: str = 'unknown'
    base_url: str = ''
    jobs_list_path: str = '/jobs'

    async def scrape(self) -> list[dict]:
        """Return a list of raw job dicts — override per site."""
        raise NotImplementedError

    async def _get(self, client: httpx.AsyncClient, url: str) -> Optional[str]:
        """Fetch HTML with error swallowing — returns None on any failure."""
        try:
            resp = await client.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT, follow_redirects=True)
            if resp.status_code == 200:
                return resp.text
            log.warning('scraper_non_200', source=self.source, url=url, status=resp.status_code)
        except Exception as exc:
            log.warning('scraper_fetch_error', source=self.source, url=url, error=str(exc))
        return None

    def _make_absolute(self, href: str) -> str:
        if not href:
            return ''
        if href.startswith('http'):
            return href
        return urljoin(self.base_url, href)

    async def _fetch_and_enrich_details(self, client: httpx.AsyncClient, jobs: list[dict], existing_urls: set[str]) -> None:
        """For any jobs not yet in existing_urls, fetch their detail page to get full details."""
        from bs4 import BeautifulSoup
        
        # We only deep-fetch details for NEW jobs to prevent unnecessary HTTP requests and slow downs.
        new_jobs = [j for j in jobs if j['source_url'] not in existing_urls]
        if not new_jobs:
            # All jobs are already in database, no deep fetching needed.
            # We still ensure basic fields are initialized
            for job in jobs:
                job.setdefault('contact_email', None)
                job.setdefault('contact_phone', None)
                job.setdefault('application_url', job['source_url'])
            return

        log.info('scraper_deep_fetching_details', source=self.source, total_new=len(new_jobs))
        
        # Concurrently deep fetch details (with concurrency limit to avoid rate limits)
        sem = asyncio.Semaphore(5) # max 5 concurrent requests
        
        async def enrich_one(job: dict):
            async with sem:
                url = job['source_url']
                html = await self._get(client, url)
                if not html:
                    job.setdefault('contact_email', None)
                    job.setdefault('contact_phone', None)
                    job.setdefault('application_url', url)
                    return
                    
                soup = BeautifulSoup(html, 'lxml')
                
                # Find main description container
                desc_el = _first(soup, 
                                 '.job-description', '.job_description', '.entry-content', 
                                 '.description', '.vacancy-details', '.job-details',
                                 'article', '[data-testid="job-description"]')
                
                full_desc = _text(desc_el) if desc_el else _text(soup.body)
                
                # Update description to the fuller version if found
                if full_desc and len(full_desc) > len(job.get('description') or ''):
                    job['description'] = full_desc[:5000] # Full description up to 5k chars
                    
                # Extract contacts
                job['contact_email'] = _extract_email(full_desc)
                job['contact_phone'] = _extract_phone(full_desc)
                job['application_url'] = _extract_apply_url(soup, url) or url
                
                # Improve company extraction from detail page if index didn't capture it
                if not job.get('company') or job.get('company').lower() in ('unknown', 'none'):
                    comp_el = _first(soup, '.company', '.employer', '.company-name', '[data-testid="company"]', '.job-company', 'h4')
                    if comp_el:
                        job['company'] = _text(comp_el)[:255]
                        
        await asyncio.gather(*[enrich_one(job) for job in jobs])


# ── GoZambiaJobs.com scraper ───────────────────────────────────────────────

class GoZambiaScraper(BaseScraper):
    source = 'gozambia'
    base_url = 'https://www.gozambiajobs.com'

    async def scrape(self) -> list[dict]:
        jobs = []
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            log.error('scraper_bs4_missing', source=self.source)
            return jobs

        async with httpx.AsyncClient() as client:
            for page in range(1, _MAX_PAGES_PER_SITE + 1):
                url = f'{self.base_url}/jobs/?paged={page}' if page > 1 else f'{self.base_url}/jobs/'
                html = await self._get(client, url)
                if not html:
                    break
                soup = BeautifulSoup(html, 'lxml')

                # GoZambiaJobs uses a standard WordPress job board layout —
                # job listings are typically in <li class="job_listing"> or
                # .job-listing / .joblisting divs. We try multiple selectors.
                cards = (
                    soup.select('li.job_listing')
                    or soup.select('.job-listing')
                    or soup.select('article.type-job_listing')
                    or soup.select('.job_listings li')
                )
                if not cards:
                    # Fallback: any <a> with /job/ in href
                    links = [a for a in soup.find_all('a', href=True) if '/job/' in a['href'] or '/jobs/' in a['href']]
                    for link in links[:20]:
                        url_abs = self._make_absolute(link['href'])
                        if not url_abs or url_abs == f'{self.base_url}/jobs/':
                            continue
                        jobs.append({
                            'source': self.source,
                            'source_url': url_abs,
                            'title': _text(link)[:500] or 'Unknown',
                            'company': None,
                            'location': 'Zambia',
                            'job_type': 'local',
                            'salary_range': None,
                            'description': None,
                            'skills': [],
                            'posted_at': None,
                        })
                    if not links:
                        break
                    continue

                for card in cards[:_MAX_JOBS_PER_RUN]:
                    link_el = _first(card, 'a.job_listing-clickbox', 'h3 a', 'h2 a', '.job-title a', 'a')
                    if not link_el:
                        continue
                    href = self._make_absolute(link_el.get('href', ''))
                    if not href:
                        continue
                    title = _text(_first(card, '.job_listing-title', 'h3', 'h2', '.job-title') or link_el)
                    company = _text(_first(card, '.company', '.job_listing-company', '.company_name'))
                    location = _text(_first(card, '.location', '.job_listing-location', '.job-location'))
                    date_raw = _text(_first(card, '.job_listing-date', 'time', '.date'))
                    description = _text(_first(card, '.job_listing-description', '.description', 'p'))
                    jobs.append({
                        'source': self.source,
                        'source_url': href,
                        'title': title[:500] or 'Unknown',
                        'company': company[:255] if company else None,
                        'location': location[:255] if location else 'Zambia',
                        'job_type': 'local',
                        'salary_range': None,
                        'description': description[:2000] if description else None,
                        'skills': _extract_skills(f'{title} {description}'),
                        'posted_at': _normalise_date(date_raw),
                    })
                if len(jobs) >= _MAX_JOBS_PER_RUN:
                    break
        log.info('scraper_done', source=self.source, count=len(jobs))
        return jobs


# ── JobSearchZM.com scraper ────────────────────────────────────────────────

class JobSearchZMScraper(BaseScraper):
    source = 'jobsearchzm'
    base_url = 'https://www.jobsearchzm.com'

    async def scrape(self) -> list[dict]:
        jobs = []
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            log.error('scraper_bs4_missing', source=self.source)
            return jobs

        async with httpx.AsyncClient() as client:
            for page in range(1, _MAX_PAGES_PER_SITE + 1):
                url = f'{self.base_url}/jobs/page/{page}/' if page > 1 else f'{self.base_url}/jobs/'
                html = await self._get(client, url)
                if not html:
                    break
                soup = BeautifulSoup(html, 'lxml')

                cards = (
                    soup.select('.job-item')
                    or soup.select('.jobs-item')
                    or soup.select('article.job')
                    or soup.select('.vacancy-item')
                    or soup.select('li.job_listing')
                )
                if not cards:
                    links = [a for a in soup.find_all('a', href=True)
                             if any(kw in a['href'] for kw in ['/job/', '/vacancy/', '/position/'])]
                    for link in links[:20]:
                        href = self._make_absolute(link['href'])
                        if not href:
                            continue
                        jobs.append({
                            'source': self.source,
                            'source_url': href,
                            'title': _text(link)[:500] or 'Unknown',
                            'company': None,
                            'location': 'Zambia',
                            'job_type': 'local',
                            'salary_range': None,
                            'description': None,
                            'skills': [],
                            'posted_at': None,
                        })
                    if not links:
                        break
                    continue

                for card in cards[:_MAX_JOBS_PER_RUN]:
                    link_el = _first(card, '.job-title a', 'h2 a', 'h3 a', 'a')
                    if not link_el:
                        continue
                    href = self._make_absolute(link_el.get('href', ''))
                    if not href:
                        continue
                    title = _text(_first(card, '.job-title', 'h2', 'h3') or link_el)
                    company = _text(_first(card, '.company', '.employer', '.company-name'))
                    location = _text(_first(card, '.location', '.city', '.place'))
                    date_raw = _text(_first(card, '.date', 'time', '.posted'))
                    description = _text(_first(card, '.description', '.excerpt', 'p'))
                    jobs.append({
                        'source': self.source,
                        'source_url': href,
                        'title': title[:500] or 'Unknown',
                        'company': company[:255] if company else None,
                        'location': location[:255] if location else 'Zambia',
                        'job_type': 'local',
                        'salary_range': None,
                        'description': description[:2000] if description else None,
                        'skills': _extract_skills(f'{title} {description}'),
                        'posted_at': _normalise_date(date_raw),
                    })
                if len(jobs) >= _MAX_JOBS_PER_RUN:
                    break
        log.info('scraper_done', source=self.source, count=len(jobs))
        return jobs


# ── Jobberman Zambia scraper ───────────────────────────────────────────────

class JobbermanZMScraper(BaseScraper):
    source = 'jobberman_zm'
    base_url = 'https://www.jobberman.com'

    async def scrape(self) -> list[dict]:
        jobs = []
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            log.error('scraper_bs4_missing', source=self.source)
            return jobs

        async with httpx.AsyncClient() as client:
            for page in range(1, _MAX_PAGES_PER_SITE + 1):
                url = f'{self.base_url}/zm/jobs?page={page}' if page > 1 else f'{self.base_url}/zm/jobs'
                html = await self._get(client, url)
                if not html:
                    break
                soup = BeautifulSoup(html, 'lxml')

                # Jobberman uses React/NextJS — may be partially server-rendered.
                # Try the server-rendered job cards first, fall back to <script> JSON.
                cards = (
                    soup.select('.job-listing__card')
                    or soup.select('[data-testid="job-card"]')
                    or soup.select('.job-card')
                    or soup.select('article.job')
                )

                if not cards:
                    # Attempt to extract from __NEXT_DATA__ JSON block
                    script = soup.find('script', {'id': '__NEXT_DATA__'})
                    if script and script.string:
                        import json
                        try:
                            data = json.loads(script.string)
                            # Walk the props tree to find job listings
                            listings = (
                                data.get('props', {}).get('pageProps', {}).get('jobs', [])
                                or data.get('props', {}).get('pageProps', {}).get('listings', [])
                                or data.get('props', {}).get('initialState', {}).get('jobs', [])
                            )
                            for j in listings[:_MAX_JOBS_PER_RUN]:
                                slug = j.get('slug') or j.get('id', '')
                                href = f'{self.base_url}/zm/jobs/{slug}' if slug else ''
                                if not href:
                                    continue
                                jobs.append({
                                    'source': self.source,
                                    'source_url': href,
                                    'title': str(j.get('title') or j.get('jobTitle') or 'Unknown')[:500],
                                    'company': str(j.get('company') or j.get('companyName') or '')[:255] or None,
                                    'location': str(j.get('location') or j.get('city') or 'Zambia')[:255],
                                    'job_type': 'local',
                                    'salary_range': str(j.get('salary') or '')[:255] or None,
                                    'description': str(j.get('description') or j.get('summary') or '')[:2000] or None,
                                    'skills': _extract_skills(str(j.get('description') or '') + str(j.get('title') or '')),
                                    'posted_at': _normalise_date(str(j.get('datePosted') or j.get('created_at') or '')),
                                })
                        except (json.JSONDecodeError, AttributeError):
                            pass
                    if not jobs:
                        log.info('scraper_no_cards', source=self.source, url=url)
                    break

                for card in cards[:_MAX_JOBS_PER_RUN]:
                    link_el = _first(card, 'a.job-listing__link', 'a[href*="/jobs/"]', 'h2 a', 'h3 a', 'a')
                    if not link_el:
                        continue
                    href = self._make_absolute(link_el.get('href', ''))
                    if not href:
                        continue
                    title = _text(_first(card, 'h2', 'h3', '.job-title', '.title') or link_el)
                    company = _text(_first(card, '.company', '.employer', '[data-testid="company"]'))
                    location = _text(_first(card, '.location', '.city', '[data-testid="location"]'))
                    date_raw = _text(_first(card, 'time', '.date', '[data-testid="date"]'))
                    salary = _text(_first(card, '.salary', '.pay', '[data-testid="salary"]'))
                    description = _text(_first(card, '.description', '.summary', 'p'))
                    jobs.append({
                        'source': self.source,
                        'source_url': href,
                        'title': title[:500] or 'Unknown',
                        'company': company[:255] if company else None,
                        'location': location[:255] if location else 'Zambia',
                        'job_type': 'local',
                        'salary_range': salary[:255] if salary else None,
                        'description': description[:2000] if description else None,
                        'skills': _extract_skills(f'{title} {description}'),
                        'posted_at': _normalise_date(date_raw),
                    })
                if len(jobs) >= _MAX_JOBS_PER_RUN:
                    break
        log.info('scraper_done', source=self.source, count=len(jobs))
        return jobs


# ── Orchestrator ───────────────────────────────────────────────────────────

_SCRAPERS: list[BaseScraper] = [
    GoZambiaScraper(),
    JobSearchZMScraper(),
    JobbermanZMScraper(),
]


async def _upsert_jobs(pool, source: str, jobs: list[dict]) -> int:
    """Insert new jobs, update scraped_at on duplicates. Returns new-job count."""
    if not jobs:
        return 0
    new_count = 0
    async with pool.acquire() as conn:
        for job in jobs:
            row = await conn.fetchrow(
                """
                INSERT INTO scraped_jobs
                  (source, source_url, title, company, location, job_type,
                   salary_range, description, skills, posted_at,
                   contact_email, contact_phone, application_url)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                ON CONFLICT (source, source_url) DO UPDATE
                  SET scraped_at = NOW(),
                      title      = EXCLUDED.title,
                      company    = EXCLUDED.company,
                      location   = EXCLUDED.location,
                      salary_range = EXCLUDED.salary_range,
                      description  = EXCLUDED.description,
                      skills       = EXCLUDED.skills,
                      contact_email = EXCLUDED.contact_email,
                      contact_phone = EXCLUDED.contact_phone,
                      application_url = EXCLUDED.application_url,
                      expires_at   = NOW() + INTERVAL '30 days'
                RETURNING (xmax = 0) AS is_new
                """,
                source,
                job['source_url'],
                job['title'],
                job.get('company'),
                job.get('location') or 'Zambia',
                job.get('job_type') or 'local',
                job.get('salary_range'),
                job.get('description'),
                job.get('skills') or [],
                job.get('posted_at'),
                job.get('contact_email'),
                job.get('contact_phone'),
                job.get('application_url') or job['source_url'],
            )
            if row and row['is_new']:
                new_count += 1
    return new_count


async def run_all_scrapers() -> dict[str, int]:
    """Run all Phase 1 scrapers concurrently. Returns {source: new_jobs}."""
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
            
            # Deep fetch detail pages and enrich contact/application fields
            async with httpx.AsyncClient() as client:
                await scraper._fetch_and_enrich_details(client, jobs, existing_urls)
                
            new_count = await _upsert_jobs(pool, scraper.source, jobs)
            results[scraper.source] = new_count
            async with pool.acquire() as conn:
                await conn.execute(
                    """UPDATE scraper_runs SET finished_at=NOW(), jobs_found=$1,
                       jobs_new=$2, success=TRUE WHERE id=$3""",
                    len(jobs), new_count, run_id,
                )
            log.info('scraper_run_complete', source=scraper.source, found=len(jobs), new=new_count)
        except Exception as exc:
            log.error('scraper_run_failed', source=scraper.source, error=str(exc))
            results[scraper.source] = 0
            if run_id:
                try:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE scraper_runs SET finished_at=NOW(), success=FALSE, error_message=$1 WHERE id=$2",
                            str(exc)[:500], run_id,
                        )
                except Exception:
                    pass

    await asyncio.gather(*[_run_one(s) for s in _SCRAPERS])

    # Expire old listings
    try:
        async with pool.acquire() as conn:
            deleted = await conn.execute("DELETE FROM scraped_jobs WHERE expires_at < NOW()")
            log.info('scraper_expired_purged', count=deleted)
    except Exception as exc:
        log.warning('scraper_expire_purge_failed', error=str(exc))

    return results


_scraper_instance = None


def get_job_scraper():
    global _scraper_instance
    if _scraper_instance is None:
        _scraper_instance = _JobScraperService()
    return _scraper_instance


class _JobScraperService:
    async def run(self) -> dict[str, int]:
        return await run_all_scrapers()
