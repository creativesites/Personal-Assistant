import httpx
import structlog
from .base import BaseScraper, _MAX_PAGES_PER_SITE, _MAX_JOBS_PER_RUN, _first, _text, _extract_skills, _normalise_date

log = structlog.get_logger()

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

