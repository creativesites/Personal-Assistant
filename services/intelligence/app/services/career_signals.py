"""Career Signals — the Professional CRM enrichment layer (see
docs/CAREER_GROWTH_ENGINE_PLAN.md §3/§4). A denormalized JSONB summary on
`relationships`, recomputed on the same every-5th-message cadence
`network_value.py`/`lead_score.py` already run alongside health_score —
same "flexible JSONB rather than a dozen shared nullable columns" judgment
network_value.py itself documents, since most contacts have none of this
and a career-relevant contact needs a genuinely different shape than a
customer/supplier one.

Deliberately a plain SQL/heuristic computation, no LLM call — the same
discipline every other "recompute a summary" pass in this codebase follows
(network_value.py, lead_score.py). `relationship_connections.connection_type`
needed no migration to support the new professional values this reads
(recruiter_for, hiring_manager_for, mentor_of, colleague_at, referred_by) —
that column has never been CHECK-constrained (see plan §1).
"""
import json
import structlog
from ..database import get_pool

log = structlog.get_logger()

_PROFESSIONAL_CONNECTION_TYPES = (
    'works_with', 'colleague_at', 'recruiter_for', 'hiring_manager_for', 'mentor_of', 'referred_by',
)
_RECRUITER_KEYWORDS = ('recruiter', 'talent acquisition', 'talent partner', 'headhunter')
_HIRING_MANAGER_KEYWORDS = ('hiring manager', 'engineering manager', 'head of', 'director', 'vp ', 'ceo', 'cto', 'founder')


class CareerSignalsService:
    async def recompute(self, contact_id: str, user_id: str) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rel = await conn.fetchrow(
                'SELECT id, health_score FROM relationships WHERE contact_id = $1 AND user_id = $2',
                contact_id, user_id,
            )
            if not rel:
                return {}

            contact = await conn.fetchrow(
                'SELECT job_title, company FROM contacts WHERE id = $1', contact_id,
            )
            job_title = (contact['job_title'] or '').lower() if contact else ''

            connections = await conn.fetch(
                """SELECT connection_type,
                          CASE WHEN contact_a_id = $1 THEN contact_b_id ELSE contact_a_id END AS other_contact_id
                   FROM relationship_connections
                   WHERE user_id = $2 AND (contact_a_id = $1 OR contact_b_id = $1) AND is_active = TRUE
                     AND connection_type = ANY($3)""",
                contact_id, user_id, list(_PROFESSIONAL_CONNECTION_TYPES),
            )
            connection_types = {c['connection_type'] for c in connections}

            referral_count = await conn.fetchval(
                """SELECT COUNT(*) FROM career_opportunities
                   WHERE user_id = $1 AND contact_id = $2 AND source = 'referral'""",
                user_id, contact_id,
            )

            is_recruiter = (
                'recruiter_for' in connection_types
                or any(k in job_title for k in _RECRUITER_KEYWORDS)
            )
            is_hiring_manager = (
                'hiring_manager_for' in connection_types
                or any(k in job_title for k in _HIRING_MANAGER_KEYWORDS)
            )
            can_refer_likely = (
                'colleague_at' in connection_types
                or 'works_with' in connection_types
                or 'mentor_of' in connection_types
            ) and float(rel['health_score'] or 70) >= 60

            value = {
                'isRecruiter': is_recruiter,
                'isHiringManager': is_hiring_manager,
                'canReferLikely': can_refer_likely,
                'referralCount': int(referral_count or 0),
                'mutualProfessionalContacts': len(connections),
                'currentRole': contact['job_title'] if contact else None,
                'currentCompany': contact['company'] if contact else None,
            }

            await conn.execute(
                'UPDATE relationships SET career_signals = $1, updated_at = NOW() WHERE id = $2',
                json.dumps(value), rel['id'],
            )

        log.info('career_signals_recomputed', contact_id=contact_id, is_recruiter=is_recruiter, is_hiring_manager=is_hiring_manager)
        return value
