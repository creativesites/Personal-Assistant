"""Job Search OS — Core Discovery Loop (see docs/CV_STUDIO_PLAN.md §15.1-
§15.10, §18 Phase 2). Not a scraper, not a job board — an AI Search Planner
generates a profile-specific set of search queries per user per day, each
run through the existing `web_search.py` (Tavily/SERP) infrastructure, each
promising result going through one extraction+fit-summary AI call, then a
deterministic (non-AI) scoring pass writes the already-existing-but-unused
`career_opportunities.match_score`/`match_breakdown` columns for the first
time (Career & Growth Engine Phase 1, migration 0078).

Deliberately reuses `web_search.py` rather than any native provider search-
grounding — the same judgment already made and documented for
`interest_companion.py` (docs/ADVISOR_COMPANION_PLAN.md): no provider has
grounding/tool-calling wired in `ai/client.py` today.

Query volume is scaled by the AI Usage Tiers principle (CLAUDE.md) — a
simple proxy off the user's subscription plan's `ai_replies_per_day` limit
stands in for a real per-user Light/Normal/Heavy classification, since no
dedicated tier signal exists yet. Cost is bounded further by a keyword
pre-filter before any extraction AI call is spent, and a hard cap on total
candidates extracted per run.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone

import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import EXTRACT_JOB_LISTING, PLAN_JOB_SEARCHES
from ..database import get_pool
from .companion_delivery import deliver_initiated_message
from .web_search import get_web_search

log = structlog.get_logger()

_TIER_QUERY_BUDGET = {'light': 8, 'normal': 15, 'heavy': 25}
_FRESH_DAYS_PENALTY = 14
_STALE_DAYS_DROP = 30
_MAX_RESULTS_PER_QUERY = 4
_MAX_EXTRACTIONS_PER_RUN = 60
_DEFAULT_CONFIDENCE = 0.55

_VALID_CATEGORIES = {
    'job', 'contract', 'consulting', 'investment', 'speaking', 'partnership',
    'collaboration', 'freelance', 'board_position', 'research', 'mentorship',
    'grant', 'scholarship', 'tender', 'supplier_opportunity', 'acquisition',
}

_INDUSTRY_TO_EMPLOYER_CATEGORY = {
    'bank': 'bank', 'banking': 'bank', 'finance': 'bank', 'financial': 'bank',
    'telecom': 'telecom', 'telecommunications': 'telecom',
    'mining': 'mining', 'mines': 'mining',
    'ngo': 'ngo', 'non-profit': 'ngo', 'nonprofit': 'ngo', 'humanitarian': 'ngo',
    'government': 'government', 'public sector': 'government', 'public service': 'government',
    'university': 'university', 'education': 'university', 'academia': 'university',
}


def _tier_for_plan(ai_replies_per_day: int | None) -> str:
    n = ai_replies_per_day or 0
    if n <= 20:
        return 'light'
    if n <= 75:
        return 'normal'
    return 'heavy'


def _normalize_key(title: str | None, company: str | None) -> str:
    t = re.sub(r'[^a-z0-9]+', ' ', (title or '').lower()).strip()
    c = re.sub(r'[^a-z0-9]+', ' ', (company or '').lower()).strip()
    return f'{t}|{c}'


def _employer_categories_for_industries(target_industries: list[str] | None) -> list[str]:
    cats: set[str] = set()
    for industry in target_industries or []:
        industry_l = industry.lower()
        for kw, cat in _INDUSTRY_TO_EMPLOYER_CATEGORY.items():
            if kw in industry_l:
                cats.add(cat)
    return list(cats)


def _parse_date(value) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


class JobDiscoveryService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT DISTINCT cp.user_id FROM career_profiles cp
                   JOIN advisor_user_profiles aup ON aup.user_id = cp.user_id
                   WHERE aup.companion_features_paused = false
                     AND cp.target_roles IS NOT NULL AND array_length(cp.target_roles, 1) > 0""",
            )
        total_found = 0
        for u in users:
            user_id = str(u['user_id'])
            try:
                total_found += await self.run_for_user(user_id)
            except Exception as exc:
                log.error('job_discovery_run_failed', user_id=user_id, error=str(exc))
        return total_found

    async def run_for_user(self, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            profile = await conn.fetchrow(
                """SELECT skills, target_roles, target_industries, country, remote_preference,
                          relocation_preference, salary_expectation_cents, salary_currency
                   FROM career_profiles WHERE user_id = $1""",
                user_id,
            )
            if not profile or not profile['target_roles']:
                return 0

            plan_row = await conn.fetchrow(
                """SELECT sp.ai_replies_per_day FROM subscriptions s
                   JOIN subscription_plans sp ON sp.id = s.plan_id
                   WHERE s.user_id = $1""",
                user_id,
            )
            recent_opps = await conn.fetch(
                """SELECT title, company_or_org, status FROM career_opportunities
                   WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10""",
                user_id,
            )
            existing_recent = await conn.fetch(
                """SELECT title, company_or_org FROM career_opportunities
                   WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'""",
                user_id,
            )
            has_business_profile = bool(await conn.fetchval(
                'SELECT id FROM business_profiles WHERE user_id = $1', user_id,
            ))
            employer_cats = _employer_categories_for_industries(profile['target_industries'])
            employer_names: list[str] = []
            if employer_cats:
                rows = await conn.fetch(
                    'SELECT employer_name FROM career_employer_categories WHERE category = ANY($1) LIMIT 8',
                    employer_cats,
                )
                employer_names = [r['employer_name'] for r in rows]

        tier = _tier_for_plan(plan_row['ai_replies_per_day'] if plan_row else None)
        query_budget = _TIER_QUERY_BUDGET[tier]

        skills = [
            (s.get('name') if isinstance(s, dict) else s)
            for s in (profile['skills'] or []) if s
        ]
        seen_titles = [o['title'] for o in recent_opps]
        rejected_titles = [o['title'] for o in recent_opps if o['status'] == 'rejected']
        existing_keys = {_normalize_key(e['title'], e['company_or_org']) for e in existing_recent}

        salary_expectation = (
            f"{profile['salary_currency']} {profile['salary_expectation_cents'] / 100:,.0f}"
            if profile['salary_expectation_cents'] else 'not set'
        )

        ai = get_ai_client()
        try:
            plan = await ai.complete_json([{
                'role': 'user',
                'content': PLAN_JOB_SEARCHES.format(
                    skills=', '.join(skills) or 'none listed',
                    target_roles=', '.join(profile['target_roles'] or []) or 'none set',
                    target_industries=', '.join(profile['target_industries'] or []) or 'none set',
                    country=profile['country'] or 'Zambia',
                    remote_preference=profile['remote_preference'] or 'no_preference',
                    relocation_preference=profile['relocation_preference'] or 'depends',
                    salary_expectation=salary_expectation,
                    known_local_employers=', '.join(employer_names) or 'none known',
                    seen_titles=', '.join(seen_titles[:10]) or 'none yet',
                    rejected_titles=', '.join(rejected_titles) or 'none',
                    query_budget=query_budget,
                ),
            }], service='career', feature='job_search_planner', user_id=user_id)
        except Exception as exc:
            log.warning('job_search_planner_failed', user_id=user_id, error=str(exc))
            return 0

        queries = self._flatten_plan(plan, query_budget, profile)
        if not queries:
            return 0

        candidates = await self._search_and_extract(user_id, queries, skills, profile)
        deduped = self._dedup_within_batch(candidates)
        fresh = [c for c in deduped if _normalize_key(c.get('title'), c.get('companyOrOrg')) not in existing_keys]
        scored = [self._score(c, profile, skills) for c in fresh]

        inserted_rows = await self._insert_opportunities(user_id, scored)
        if inserted_rows:
            await self._send_daily_brief(user_id, scored, inserted_rows)
        log.info('job_discovery_run_complete', user_id=user_id, tier=tier, queries=len(queries),
                  candidates=len(candidates), inserted=len(inserted_rows))
        return len(inserted_rows)

    def _flatten_plan(self, plan: dict, budget: int, profile) -> list[dict]:
        allow_regional = profile['relocation_preference'] != 'not_open'
        allow_remote = profile['remote_preference'] != 'onsite'
        pass_allowed = {
            'local': True, 'regional': allow_regional, 'remote': allow_remote,
            'freelance': True, 'hidden': True,
        }
        queries: list[dict] = []
        for pass_name, allowed in pass_allowed.items():
            if not allowed:
                continue
            for q in (plan.get(pass_name) or []):
                if isinstance(q, str) and q.strip():
                    queries.append({'pass': pass_name, 'query': q.strip()})
        return queries[:budget]

    async def _search_and_extract(self, user_id: str, queries: list[dict], skills: list[str], profile) -> list[dict]:
        web_search = get_web_search()
        ai = get_ai_client()
        keywords = [k.lower() for k in ((profile['target_roles'] or []) + skills) if k]

        raw_results: list[tuple[str, object]] = []
        for q in queries:
            try:
                results = await web_search.search(q['query'], max_results=_MAX_RESULTS_PER_QUERY)
            except Exception as exc:
                log.warning('job_search_query_failed', query=q['query'][:80], error=str(exc))
                continue
            for r in results:
                text = f'{r.title} {r.snippet}'.lower()
                if keywords and not any(k in text for k in keywords):
                    continue
                raw_results.append((q['pass'], r))

        raw_results = raw_results[:_MAX_EXTRACTIONS_PER_RUN]

        candidates: list[dict] = []
        for pass_name, r in raw_results:
            try:
                extracted = await ai.complete_json([{
                    'role': 'user',
                    'content': EXTRACT_JOB_LISTING.format(
                        title=r.title, url=r.url, snippet=r.snippet,
                        user_skills=', '.join(skills) or 'none listed',
                        target_roles=', '.join(profile['target_roles'] or []),
                        remote_preference=profile['remote_preference'] or 'no_preference',
                        relocation_preference=profile['relocation_preference'] or 'depends',
                    ),
                }], service='career', feature='job_listing_extraction', user_id=user_id)
            except Exception as exc:
                log.warning('job_listing_extraction_failed', url=r.url[:80], error=str(exc))
                continue
            if not extracted.get('isJobRelated'):
                continue
            extracted['_pass'] = pass_name
            extracted.setdefault('applicationUrl', r.url)
            candidates.append(extracted)
        return candidates

    def _dedup_within_batch(self, candidates: list[dict]) -> list[dict]:
        def completeness(c: dict) -> int:
            score = sum(1 for f in ('applicationUrl', 'salaryMin', 'postedAt', 'location') if c.get(f))
            return score * 100 + len(c.get('summary') or '')

        groups: dict[str, dict] = {}
        for c in candidates:
            key = _normalize_key(c.get('title'), c.get('companyOrOrg'))
            existing = groups.get(key)
            if not existing or completeness(c) > completeness(existing):
                groups[key] = c
        return list(groups.values())

    def _score(self, c: dict, profile, skills: list[str]) -> dict:
        posted_at = _parse_date(c.get('postedAt'))
        today = datetime.now(tz=timezone.utc).date()
        freshness_days = (today - posted_at).days if posted_at else None

        if freshness_days is not None and freshness_days > _STALE_DAYS_DROP:
            c['_drop'] = True
            return c

        required_skills = [s.lower() for s in (c.get('requiredSkills') or []) if s]
        user_skills_lower = {s.lower() for s in skills if s}
        matched = sorted(set(required_skills) & user_skills_lower)
        missing = sorted(set(required_skills) - user_skills_lower)
        skills_score = min(100, round((len(matched) / len(required_skills)) * 100)) if required_skills else 50

        remote_pref = profile['remote_preference']
        is_remote = c.get('isRemote')
        if remote_pref == 'remote':
            location_score = 100 if is_remote else (30 if is_remote is None else 0)
        elif remote_pref == 'onsite':
            location_score = 100 if is_remote is False else (50 if is_remote is None else 40)
        else:
            location_score = 80 if is_remote is not None else 60

        expectation_cents = profile['salary_expectation_cents']
        salary_max = c.get('salaryMax')
        if expectation_cents and salary_max:
            expectation_units = expectation_cents / 100
            salary_score = 100 if salary_max >= expectation_units else round(max(0, (salary_max / expectation_units) * 100))
        elif not expectation_cents:
            salary_score = 60
        else:
            salary_score = 50

        target_roles_l = [r.lower() for r in (profile['target_roles'] or [])]
        target_industries_l = [i.lower() for i in (profile['target_industries'] or [])]
        title_l = (c.get('title') or '').lower()
        category_l = (c.get('category') or '').lower()
        if any(r in title_l for r in target_roles_l):
            category_score = 100
        elif category_l in target_industries_l or any(i in title_l for i in target_industries_l):
            category_score = 70
        else:
            category_score = 40

        if freshness_days is None:
            freshness_score = 60
        elif freshness_days <= 3:
            freshness_score = 100
        elif freshness_days <= _FRESH_DAYS_PENALTY:
            freshness_score = 80
        else:
            freshness_score = 40

        overall = round(
            skills_score * 0.35 + location_score * 0.2 + salary_score * 0.2
            + category_score * 0.15 + freshness_score * 0.1
        )

        c['_match_score'] = max(0, min(100, overall))
        c['_match_breakdown'] = {
            'skills': skills_score, 'location': location_score, 'salary': salary_score,
            'category': category_score, 'freshness': freshness_score,
            'matchedSkills': matched, 'missingSkills': missing,
        }
        c['_drop'] = False
        return c

    async def _insert_opportunities(self, user_id: str, scored: list[dict]) -> list[dict]:
        pool = await get_pool()
        inserted: list[dict] = []
        async with pool.acquire() as conn:
            for c in scored:
                if c.get('_drop'):
                    continue
                category = c.get('category') if c.get('category') in _VALID_CATEGORIES else 'job'
                salary_range = None
                if c.get('salaryMin') or c.get('salaryMax'):
                    salary_range = json.dumps({
                        'min': c.get('salaryMin'), 'max': c.get('salaryMax'),
                        'currency': c.get('salaryCurrency') or 'USD',
                    })
                row = await conn.fetchrow(
                    """INSERT INTO career_opportunities
                         (user_id, category, title, company_or_org, description, location,
                          is_remote, salary_range_cents, source, application_url, match_score,
                          match_breakdown, confidence)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'web_search', $9, $10, $11::jsonb, $12)
                       RETURNING id, title, company_or_org, match_score, is_remote""",
                    user_id, category, (c.get('title') or 'Untitled opportunity')[:255],
                    c.get('companyOrOrg'), c.get('summary'), c.get('location'), c.get('isRemote'),
                    salary_range, c.get('applicationUrl'), c.get('_match_score'),
                    json.dumps(c.get('_match_breakdown') or {}), _DEFAULT_CONFIDENCE,
                )
                inserted.append(dict(row))
        return inserted

    async def _send_daily_brief(self, user_id: str, scored: list[dict], inserted_rows: list[dict]) -> None:
        total = len(inserted_rows)
        excellent = sum(1 for r in inserted_rows if (r['match_score'] or 0) >= 80)
        remote_count = sum(1 for r in inserted_rows if r['is_remote'])

        parts = [f"Good morning! I found {total} new opportunit{'y' if total == 1 else 'ies'} today."]
        if excellent:
            parts.append(f"{excellent} {'is' if excellent == 1 else 'are'} excellent match{'' if excellent == 1 else 'es'}.")
        if remote_count:
            parts.append(f"{remote_count} {'is' if remote_count == 1 else 'are'} remote.")
        parts.append('Want to review them?')
        message = ' '.join(parts)

        await deliver_initiated_message(user_id, message, {'type': 'job_search_brief', 'count': total})


_instance: JobDiscoveryService | None = None


def get_job_discovery() -> JobDiscoveryService:
    global _instance
    if _instance is None:
        _instance = JobDiscoveryService()
    return _instance
