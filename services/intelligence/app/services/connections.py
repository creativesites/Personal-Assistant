"""
Business Graph — see docs/RELATIONSHIP_OS_PLAN.md §5.7.

Mirrors business_facts.py's confidence/evidence-count reinforcement
pattern: a repeated mention of the same connection raises confidence and
evidence_count instead of writing a duplicate row. The one extra step here
is name resolution — the LLM only sees a name as typed in chat ("my
brother Peter"), so it has to be matched against the user's other
contacts before a connection (which needs two real contact ids) can be
recorded at all. Mentions of people who aren't already contacts are
dropped rather than guessed at.
"""

import structlog
from ..database import get_pool
from ..models import ConnectionMention

log = structlog.get_logger()

_VALID_TYPES = {
    'works_with', 'introduced_by', 'owns', 'refers_to',
    'family_of', 'friend_of', 'married_to',
}
_CONFIDENCE_STEP = 0.15
_MAX_CONFIDENCE = 0.99


class ConnectionService:
    async def record_candidates(
        self, user_id: str, contact_id: str, message_id: str, mentions: list[ConnectionMention],
    ) -> None:
        if not mentions:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            for mention in mentions:
                if mention.connection_type not in _VALID_TYPES:
                    continue
                name = mention.other_person_name.strip()
                if not name:
                    continue

                matches = await conn.fetch(
                    """SELECT id FROM contacts
                       WHERE user_id = $1 AND id != $2
                         AND (custom_name ILIKE $3 OR display_name ILIKE $3)
                       LIMIT 2""",
                    user_id, contact_id, f'%{name}%',
                )
                # Skip unresolved (no existing contact) or ambiguous (name matches
                # more than one contact) mentions rather than guessing.
                if len(matches) != 1:
                    continue
                other_contact_id = matches[0]['id']

                existing = await conn.fetchrow(
                    """SELECT id, confidence, evidence_count, source_message_ids, is_active
                       FROM relationship_connections
                       WHERE user_id = $1 AND contact_a_id = $2 AND contact_b_id = $3 AND connection_type = $4""",
                    user_id, contact_id, other_contact_id, mention.connection_type,
                )

                if existing is None:
                    await conn.execute(
                        """INSERT INTO relationship_connections
                               (user_id, contact_a_id, contact_b_id, connection_type, confidence, source_message_ids)
                           VALUES ($1, $2, $3, $4, $5, $6)""",
                        user_id, contact_id, other_contact_id, mention.connection_type,
                        mention.confidence, [message_id],
                    )
                    log.info('connection_detected', user_id=user_id, contact_id=contact_id, other=other_contact_id)
                    continue

                if not existing['is_active']:
                    continue

                new_confidence = min(_MAX_CONFIDENCE, float(existing['confidence']) + _CONFIDENCE_STEP)
                source_ids = list(existing['source_message_ids'] or []) + [message_id]
                await conn.execute(
                    """UPDATE relationship_connections SET
                           evidence_count = evidence_count + 1,
                           confidence = $1,
                           source_message_ids = $2,
                           updated_at = NOW()
                       WHERE id = $3""",
                    new_confidence, source_ids, existing['id'],
                )
