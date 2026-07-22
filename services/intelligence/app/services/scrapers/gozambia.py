import httpx
import structlog
from .base import BaseScraper, _MAX_PAGES_PER_SITE, _MAX_JOBS_PER_RUN, _first, _text, _extract_skills, _normalise_date

log = structlog.get_logger()

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

