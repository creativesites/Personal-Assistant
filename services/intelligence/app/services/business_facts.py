"""
Business + Knowledge Memory — an auto-learned, human-curated fact store.

Competing values for the same fact_key are stored as separate rows, each
with its own confidence/evidence trail, rather than one row being force-
overwritten every time a new message contradicts it. Corroborating mentions
(same key + same value) raise confidence and evidence_count; once both cross
a threshold the fact auto-approves. Readers take the highest-confidence
*approved* row per key — see get_approved_facts() below.
"""

import re
import structlog
from ..database import get_pool
from ..models import BusinessFactMention

log = structlog.get_logger()

_AUTO_APPROVE_CONFIDENCE = 0.9
_AUTO_APPROVE_MIN_EVIDENCE = 3
_CONFIDENCE_STEP = 0.15
_MAX_CONFIDENCE = 0.99

_KEY_RE = re.compile(r'[^a-z0-9_]+')


def _normalize_key(key: str) -> str:
    return _KEY_RE.sub('_', key.strip().lower()).strip('_')[:255]


class BusinessFactService:
    async def record_candidates(
        self, user_id: str, message_id: str, mentions: list[BusinessFactMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            for mention in mentions:
                key = _normalize_key(mention.key)
                value = mention.value.strip()
                if not key or not value:
                    continue

                existing = await conn.fetchrow(
                    """
                    SELECT id, confidence, evidence_count, source_message_ids, is_approved, is_active
                    FROM business_facts
                    WHERE user_id = $1 AND fact_key = $2 AND fact_value = $3
                    """,
                    user_id, key, value,
                )

                if existing is None:
                    await conn.execute(
                        """
                        INSERT INTO business_facts
                            (user_id, category, fact_key, fact_value, source, source_message_ids)
                        VALUES ($1, $2, $3, $4, 'ai_inference', $5)
                        """,
                        user_id, mention.category, key, value, [message_id],
                    )
                    continue

                if not existing['is_active']:
                    # A human already rejected this exact candidate — don't reinforce it.
                    continue

                new_evidence = existing['evidence_count'] + 1
                new_confidence = min(_MAX_CONFIDENCE, float(existing['confidence']) + _CONFIDENCE_STEP)
                newly_approved = (
                    not existing['is_approved']
                    and new_confidence >= _AUTO_APPROVE_CONFIDENCE
                    and new_evidence >= _AUTO_APPROVE_MIN_EVIDENCE
                )
                source_ids = list(existing['source_message_ids'] or []) + [message_id]

                await conn.execute(
                    """
                    UPDATE business_facts SET
                        evidence_count = $1,
                        confidence     = $2,
                        source_message_ids = $3,
                        is_approved    = is_approved OR $4,
                        approved_at    = CASE WHEN NOT is_approved AND $4 THEN NOW() ELSE approved_at END,
                        updated_at     = NOW()
                    WHERE id = $5
                    """,
                    new_evidence, new_confidence, source_ids, newly_approved, existing['id'],
                )

                if newly_approved:
                    log.info('business_fact_auto_approved', user_id=user_id, fact_key=key)

    async def get_approved_facts(self, user_id: str, limit: int = 15) -> list[dict]:
        """The current best-known value per fact_key — highest-confidence approved row.

        DISTINCT ON requires its ORDER BY to start with fact_key, which would make
        LIMIT cut off alphabetically rather than by importance — so the per-key
        winner is picked in a subquery and the outer query re-orders by confidence
        before limiting.
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT fact_key, fact_value, category, confidence, evidence_count
                FROM (
                    SELECT DISTINCT ON (fact_key) fact_key, fact_value, category, confidence, evidence_count
                    FROM business_facts
                    WHERE user_id = $1 AND is_active = TRUE AND is_approved = TRUE
                    ORDER BY fact_key, confidence DESC, evidence_count DESC
                ) winners
                ORDER BY confidence DESC, evidence_count DESC
                LIMIT $2
                """,
                user_id, limit,
            )
        return [dict(r) for r in rows]
