import httpx
import structlog
from .base import BaseScraper, _MAX_PAGES_PER_SITE, _MAX_JOBS_PER_RUN, _first, _text, _extract_skills, _normalise_date

log = structlog.get_logger()

class GreatZambiaJobsScraper(BaseScraper):
    source = 'greatzambiajobs'
    base_url = 'https://greatzambiajobs.com'

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

                # Common WP Job Manager selectors
                cards = (
                    soup.select('li.job_listing')
                    or soup.select('.job_listing')
                    or soup.select('div.job-item')
                )

                if not cards:
                    break

                for card in cards[:_MAX_JOBS_PER_RUN]:
                    link_el = _first(card, 'a.job_listing-clickbox', 'h3 a', 'h2 a', 'a.job-title')
                    if not link_el:
                        continue
                    href = self._make_absolute(link_el.get('href', ''))
                    if not href:
                        continue
                    
                    title = _text(_first(card, 'h3', 'h2', '.job_listing-title') or link_el)
                    company = _text(_first(card, '.company', '.job_listing-company', 'strong.company'))
                    location = _text(_first(card, '.location', '.job_listing-location'))
                    date_raw = _text(_first(card, 'time', '.date', '.job_listing-date'))
                    description = _text(_first(card, '.description', '.job-snippet', 'p'))
                    
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
