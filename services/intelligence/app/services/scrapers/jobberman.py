import httpx
import structlog
from .base import BaseScraper, _MAX_PAGES_PER_SITE, _MAX_JOBS_PER_RUN, _first, _text, _extract_skills, _normalise_date

log = structlog.get_logger()

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


