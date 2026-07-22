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

from ...database import get_pool

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

