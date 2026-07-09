"""
Agent Memory + Experience Memory — persistent, per-agent long-term memory
that survives restarts and model changes, scoped either to a specific
contact or to the agent's general knowledge (contact_id IS NULL).

Two shapes share one table via `memory_type`:
  - 'fact'       — atomic, mergeable (same pattern as business_facts.py):
                   corroborating mentions of the same key+value raise
                   confidence/evidence_count instead of overwriting.
  - 'experience' — a single case (situation -> action -> outcome). Never
                   merged — each is its own episode — but `worked` biases
                   future retrieval toward experiences that actually helped.

Candidates are extracted as part of the agent's existing reply-generation
call in agent_engine.py (a `memories` field on that JSON response), not a
separate LLM call.
"""

import re
import structlog
from ..ai.embeddings import embed_text
from ..database import get_pool
from ..models import AgentMemoryCandidate

log = structlog.get_logger()

_CONFIDENCE_STEP = 0.15
_MAX_CONFIDENCE = 0.99
_KEY_RE = re.compile(r'[^a-z0-9_]+')


def _normalize_key(key: str) -> str:
    return _KEY_RE.sub('_', key.strip().lower()).strip('_')[:255]


class AgentMemoryService:
    async def record_candidates(
        self,
        agent_id: str,
        user_id: str,
        contact_id: str | None,
        action_id: str,
        candidates: list[AgentMemoryCandidate],
    ) -> None:
        for candidate in candidates:
            effective_contact_id = None if candidate.scope == 'general' else contact_id
            try:
                if candidate.memory_type == 'experience':
                    await self._record_experience(agent_id, user_id, effective_contact_id, action_id, candidate)
                else:
                    await self._record_fact(agent_id, user_id, effective_contact_id, action_id, candidate)
            except Exception as exc:
                log.warning('agent_memory_record_failed', agent_id=agent_id, error=str(exc))

    async def _record_fact(
        self, agent_id: str, user_id: str, contact_id: str | None, action_id: str,
        candidate: AgentMemoryCandidate,
    ) -> None:
        key = _normalize_key(candidate.key)
        value = candidate.value.strip()
        if not key or not value:
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                """
                SELECT id, confidence, evidence_count, source_action_ids, is_active
                FROM agent_memories
                WHERE agent_id = $1
                  AND COALESCE(contact_id::text, '') = COALESCE($2::text, '')
                  AND memory_type = 'fact' AND memory_key = $3 AND memory_value = $4
                """,
                agent_id, contact_id, key, value,
            )

            if existing is None:
                embedding = await embed_text(f'{key}: {value}')
                await conn.execute(
                    """
                    INSERT INTO agent_memories
                        (agent_id, user_id, contact_id, memory_type, memory_key, memory_value,
                         source_action_ids, embedding)
                    VALUES ($1, $2, $3, 'fact', $4, $5, $6, $7)
                    """,
                    agent_id, user_id, contact_id, key, value, [action_id], embedding,
                )
                return

            if not existing['is_active']:
                return  # a human/operator rejected this exact candidate — don't reinforce

            new_evidence = existing['evidence_count'] + 1
            new_confidence = min(_MAX_CONFIDENCE, float(existing['confidence']) + _CONFIDENCE_STEP)
            source_ids = list(existing['source_action_ids'] or []) + [action_id]
            await conn.execute(
                """
                UPDATE agent_memories SET
                    evidence_count = $1, confidence = $2, source_action_ids = $3, updated_at = NOW()
                WHERE id = $4
                """,
                new_evidence, new_confidence, source_ids, existing['id'],
            )

    async def _record_experience(
        self, agent_id: str, user_id: str, contact_id: str | None, action_id: str,
        candidate: AgentMemoryCandidate,
    ) -> None:
        situation = candidate.situation.strip()
        if not situation:
            return
        action_taken = candidate.action_taken.strip()
        outcome = candidate.outcome.strip()

        embedding = await embed_text(f'Situation: {situation}\nAction: {action_taken}\nOutcome: {outcome}')
        confidence = 0.7 if candidate.worked else (0.5 if candidate.worked is False else 0.6)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO agent_memories
                    (agent_id, user_id, contact_id, memory_type, situation, action_taken,
                     outcome, worked, confidence, source_action_ids, embedding)
                VALUES ($1, $2, $3, 'experience', $4, $5, $6, $7, $8, $9, $10)
                """,
                agent_id, user_id, contact_id, situation, action_taken, outcome,
                candidate.worked, confidence, [action_id], embedding,
            )

    async def retrieve(
        self, agent_id: str, contact_id: str | None, query_text: str, limit: int = 5,
    ) -> list[dict]:
        """Contact-specific + general memories for this agent, ranked by relevance
        to query_text (semantic if an embedding is available, else by confidence)."""
        pool = await get_pool()
        query_embedding = await embed_text(query_text)

        async with pool.acquire() as conn:
            if query_embedding is not None:
                rows = await conn.fetch(
                    """
                    SELECT memory_type, memory_key, memory_value, situation, action_taken,
                           outcome, worked, confidence
                    FROM agent_memories
                    WHERE agent_id = $1 AND (contact_id = $2 OR contact_id IS NULL)
                      AND is_active = TRUE AND embedding IS NOT NULL
                    ORDER BY (embedding <-> $3) - (CASE WHEN worked THEN 0.05 ELSE 0 END)
                    LIMIT $4
                    """,
                    agent_id, contact_id, query_embedding, limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT memory_type, memory_key, memory_value, situation, action_taken,
                           outcome, worked, confidence
                    FROM agent_memories
                    WHERE agent_id = $1 AND (contact_id = $2 OR contact_id IS NULL) AND is_active = TRUE
                    ORDER BY confidence DESC, updated_at DESC
                    LIMIT $3
                    """,
                    agent_id, contact_id, limit,
                )

        return [dict(r) for r in rows]
