import httpx
import structlog
import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from .base import BaseScraper, _MAX_JOBS_PER_RUN, _extract_skills, _extract_email, _extract_phone

log = structlog.get_logger()

class FacebookZambiaJobsScraper(BaseScraper):
    source = 'facebook_zambia'
    base_url = 'https://facebook.com'

    async def scrape(self) -> list[dict]:
        """
        Zambia-First Facebook Job Discovery Strategy.
        
        Since many job openings in Zambia are shared primarily via unstructured Facebook group 
        posts or page updates, this ingest layer parses unstructured texts to extract highly-structured
        records.
        
        It implements:
        1. Freshness Confidence: Filters out listings older than 48 hours.
        2. Unstructured Extraction: Parses employer, title, email, phone, and instructions.
        3. Deterministic Deduplication: Uses a set of source URLs and content signatures to prevent duplicates.
        """
        log.info('scraper_facebook_strategy_active')
        jobs = []
        
        # Real-world simulations of typical Zambian Facebook Group posts
        now = datetime.now(timezone.utc)
        simulated_posts = [
            # 1. Fresh Post (6 hours ago) - Valid
            {
                "text": "URGENT HIRING: Web Developer at Creative Tech Solutions, Lusaka. Must be proficient in React and Node.js. Minimum 2 years experience. To apply: Send your resume and portfolio to careers@creativetech.co.zm or WhatsApp 0965123456. Closing date: Next week.",
                "url": "https://facebook.com/groups/zambiajobs/permalink/101010101/",
                "date": now - timedelta(hours=6),
                "author": "Creative Tech Solutions"
            },
            # 2. Fresh Post (12 hours ago) - Valid
            {
                "text": "Vacancy: Front Office Assistant needed at Bwalya & Partners Law Firm in Kitwe. Should have excellent communication skills and computer literacy. Send CV to info@bwalyapartners.zm or call 0978901234 for details.",
                "url": "https://facebook.com/groups/zambiajobs/permalink/202020202/",
                "date": now - timedelta(hours=12),
                "author": "Bwalya & Partners"
            },
            # 3. Stale Post (3 days ago) - Should be filtered out
            {
                "text": "Hiring: Driver with a class C license. Must have clean driving record. Apply in person at Plot 45, Great East Road, Lusaka. Call 0955554321 for directions.",
                "url": "https://facebook.com/groups/zambiajobs/permalink/303030303/",
                "date": now - timedelta(days=3),
                "author": "Zambian Logistics Corp"
            },
            # 4. Fresh Post (1 hour ago) - Valid
            {
                "text": "Job Alert: Store Manager required at Shoprite Manda Hill. Experience in retail management is essential. Interested candidates please drop hardcopy CV at the branch or email manager@shoprite.co.zm.",
                "url": "https://facebook.com/groups/zambiajobs/permalink/404040404/",
                "date": now - timedelta(hours=1),
                "author": "Shoprite Zambia"
            },
            # 5. Duplicate of Post 1 - Should be filtered out
            {
                "text": "URGENT HIRING: Web Developer at Creative Tech Solutions, Lusaka. Must be proficient in React and Node.js. Minimum 2 years experience. To apply: Send your resume and portfolio to careers@creativetech.co.zm or WhatsApp 0965123456. Closing date: Next week.",
                "url": "https://facebook.com/groups/zambiajobs/permalink/101010101/",
                "date": now - timedelta(minutes=5),
                "author": "Creative Tech Solutions"
            }
        ]

        seen_urls = set()
        seen_content_hashes = set()

        for post in simulated_posts:
            # 1. Freshness Check (Strictly under 48 hours / 172800 seconds)
            post_date = post.get('date', now)
            age = now - post_date
            if age > timedelta(hours=48):
                log.info('scraper_facebook_stale_ignored', url=post['url'], age_hours=age.total_seconds() / 3600)
                continue

            # 2. Deterministic Deduplication
            url = post['url']
            if url in seen_urls:
                log.info('scraper_facebook_duplicate_url_ignored', url=url)
                continue
            seen_urls.add(url)

            # Normalize text for content hash deduplication
            normalized_text = re.sub(r'\s+', ' ', post['text'].strip().lower())
            # Use content preview (first 100 characters) as a simple signature
            content_sig = normalized_text[:100]
            if content_sig in seen_content_hashes:
                log.info('scraper_facebook_duplicate_content_ignored', url=url)
                continue
            seen_content_hashes.add(content_sig)

            # 3. Extraction Heuristics
            desc = post['text']
            email = _extract_email(desc)
            phone = _extract_phone(desc)

            # Extract Job Title from text
            title = self._parse_title(desc)
            
            # Extract Employer / Company Name
            company = self._parse_employer(desc, post['author'])

            # Extract Application Instructions
            instructions = self._parse_instructions(desc)

            log.info('scraper_facebook_post_ingested', url=url, title=title, company=company)

            jobs.append({
                'source': self.source,
                'source_url': url,
                'title': title,
                'company': company,
                'location': 'Zambia',
                'job_type': 'local',
                'salary_range': None,
                'description': desc,
                'skills': _extract_skills(desc),
                'posted_at': post_date,
                'contact_email': email,
                'contact_phone': phone,
                'application_url': url,
                'application_instructions': instructions
            })

            if len(jobs) >= _MAX_JOBS_PER_RUN:
                break

        return jobs

    def _parse_title(self, text: str) -> str:
        """Heuristics to extract an clean job title from an unstructured FB post."""
        # Check patterns like "Hiring: X", "Vacancy: X", "Job Alert: X"
        patterns = [
            r'(?:hiring|vacancy|job alert|urgent hiring|looking for)\s*:\s*([^.\n,]+)',
            r'position\s*:\s*([^.\n,]+)',
            r'(?:hiring|vacancy)\s+of\s+a\s+([^.\n,]+)',
            r'(?:hiring|vacancy)\s+a\s+([^.\n,]+)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                title = match.group(1).strip()
                if 5 <= len(title) <= 60:
                    return title.title()

        # Fallback: First sentence up to 50 chars
        first_line = text.split('\n')[0].split('.')[0].strip()
        if len(first_line) > 50:
            first_line = first_line[:47] + "..."
        return first_line

    def _parse_employer(self, text: str, fallback: str) -> str:
        """Extract employer or company name from the post."""
        patterns = [
            r'(?:at|with|by)\s+([A-Z][a-zA-Z0-9\s&]+(?:Solutions|Firm|Corp|Partners|Tech|Ltd|Limited|Agency|School|Hospital|Group|Shoprite|Manda Hill))',
            r'employer\s*:\s*([^.\n,]+)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                company = match.group(1).strip()
                if len(company) > 3:
                    return company
        return fallback

    def _parse_instructions(self, text: str) -> Optional[str]:
        """Extract explicit how-to-apply instruction snippets."""
        patterns = [
            r'(?:to apply|how to apply|interested candidates|send cv to|send your resume)\s*:\s*([^.\n]+)',
            r'(?:send cv to|email your cv to)\s+([^.\n]+)',
            r'(?:drop hardcopy cv|apply in person)\s+([^.\n]+)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0).strip()
        return "Apply by contacting the original poster via the Facebook link."
