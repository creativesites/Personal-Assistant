"""
Nightly Consolidation — the "extract -> merge -> dedupe -> boost confidence ->
archive old -> summarize -> store long-term" pass the memory plan calls for.

Per-message merging already happens live in business_facts.py and
agent_memory.py; what's missing without a batch pass is:
  1. Dedupe near-duplicate business fact values that per-message merging
     missed because they weren't byte-identical (e.g. "K450" vs "k450 ").
  2. Archive stale candidates that were only ever mentioned once and never
     got reinforced or approved — they're just noise in retrieval by now.
  3. Synthesize agent "experience" memories (raw episodes) into durable
     "fact" memories (generalizable lessons) — the actual "summarize into
     long-term memory" step, since experiences never merge on their own.
"""

import re
import structlog
from ..ai.client import get_ai_client
from ..ai.embeddings import embed_text
from ..ai.prompts import SYNTHESIZE_AGENT_PATTERNS
from ..database import get_pool
from ..models import AgentPatternSynthesis
from .business_facts import _AUTO_APPROVE_CONFIDENCE, _AUTO_APPROVE_MIN_EVIDENCE, _CONFIDENCE_STEP, _MAX_CONFIDENCE

log = structlog.get_logger()

_STALE_DAYS = 60
_MIN_EXPERIENCES_FOR_SYNTHESIS = 10
_MAX_EXPERIENCES_SAMPLE = 50
_RESYNTHESIS_COOLDOWN_DAYS = 7
_WHITESPACE_RE = re.compile(r'\s+')


def _normalize_value(value: str) -> str:
    return _WHITESPACE_RE.sub(' ', value.strip().lower())


class ConsolidationService:
    async def run(self) -> dict:
        deduped = await self.dedupe_business_facts()
        archived_facts = await self.archive_stale_business_facts()
        archived_agent_facts = await self.archive_stale_agent_facts()
        synthesized = await self.synthesize_agent_patterns()
        result = {
            'business_facts_deduped': deduped,
            'business_facts_archived': archived_facts,
            'agent_facts_archived': archived_agent_facts,
            'agent_patterns_synthesized': synthesized,
        }
        log.info('consolidation_run_complete', **result)
        return result

    async def dedupe_business_facts(self) -> int:
        """Merges active business_facts rows for the same (user, key) whose
        values are identical after whitespace/case normalization — evidence
        merging alone won't catch these since it requires an exact match."""
        pool = await get_pool()
        merged = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, user_id, fact_key, fact_value, confidence, evidence_count,"
                " source_message_ids, is_approved FROM business_facts WHERE is_active = TRUE",
            )

            groups: dict[tuple, list] = {}
            for r in rows:
                gkey = (r['user_id'], r['fact_key'], _normalize_value(r['fact_value']))
                groups.setdefault(gkey, []).append(r)

            for members in groups.values():
                if len(members) < 2:
                    continue
                members.sort(key=lambda r: (float(r['confidence']), r['evidence_count']), reverse=True)
                winner, losers = members[0], members[1:]

                total_evidence = sum(m['evidence_count'] for m in members)
                merged_sources: list = []
                for m in members:
                    merged_sources.extend(m['source_message_ids'] or [])
                new_confidence = min(_MAX_CONFIDENCE, float(winner['confidence']) + _CONFIDENCE_STEP)
                newly_approved = (
                    not winner['is_approved']
                    and new_confidence >= _AUTO_APPROVE_CONFIDENCE
                    and total_evidence >= _AUTO_APPROVE_MIN_EVIDENCE
                )

                await conn.execute(
                    """
                    UPDATE business_facts SET
                        evidence_count = $1, confidence = $2, source_message_ids = $3,
                        is_approved = is_approved OR $4,
                        approved_at = CASE WHEN NOT is_approved AND $4 THEN NOW() ELSE approved_at END,
                        updated_at = NOW()
                    WHERE id = $5
                    """,
                    total_evidence, new_confidence, merged_sources, newly_approved, winner['id'],
                )
                await conn.execute(
                    'UPDATE business_facts SET is_active = FALSE, updated_at = NOW() WHERE id = ANY($1)',
                    [m['id'] for m in losers],
                )
                merged += len(losers)

        if merged:
            log.info('business_facts_deduped', count=merged)
        return merged

    async def archive_stale_business_facts(self) -> int:
        """A candidate mentioned exactly once, never approved, and old enough
        that it's very unlikely to be reinforced — stop cluttering retrieval."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                f"""
                UPDATE business_facts SET is_active = FALSE, updated_at = NOW()
                WHERE is_active = TRUE AND is_approved = FALSE AND evidence_count <= 1
                  AND created_at < NOW() - INTERVAL '{_STALE_DAYS} days'
                """,
            )
        return _rowcount(result)

    async def archive_stale_agent_facts(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                f"""
                UPDATE agent_memories SET is_active = FALSE, updated_at = NOW()
                WHERE is_active = TRUE AND memory_type = 'fact' AND evidence_count <= 1
                  AND created_at < NOW() - INTERVAL '{_STALE_DAYS} days'
                """,
            )
        return _rowcount(result)

    async def synthesize_agent_patterns(self) -> int:
        """Distills each agent's raw 'experience' episodes into durable,
        general 'fact' memories — the actual summarize-into-long-term step.
        Experiences never merge on their own (each is its own case), so
        without this pass a recurring pattern just stays as N separate rows."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            agents = await conn.fetch("SELECT id, name FROM agents WHERE is_active = TRUE")

        client = get_ai_client()
        synthesized = 0

        for agent in agents:
            agent_id, agent_name = agent['id'], agent['name']

            pool2 = await get_pool()
            async with pool2.acquire() as conn:
                last_synthesis = await conn.fetchval(
                    """SELECT MAX(created_at) FROM agent_memories
                       WHERE agent_id = $1 AND memory_type = 'fact' AND contact_id IS NULL""",
                    agent_id,
                )
                if last_synthesis:
                    from datetime import datetime, timezone
                    if (datetime.now(tz=timezone.utc) - last_synthesis).days < _RESYNTHESIS_COOLDOWN_DAYS:
                        continue

                experiences = await conn.fetch(
                    """SELECT situation, action_taken, outcome, worked FROM agent_memories
                       WHERE agent_id = $1 AND memory_type = 'experience' AND is_active = TRUE
                       ORDER BY created_at DESC LIMIT $2""",
                    agent_id, _MAX_EXPERIENCES_SAMPLE,
                )

            if len(experiences) < _MIN_EXPERIENCES_FOR_SYNTHESIS:
                continue

            experiences_text = '\n'.join(
                f"- Situation: {e['situation']} | Did: {e['action_taken']} | "
                f"Outcome: {e['outcome']}{' (worked)' if e['worked'] else (' (did not work)' if e['worked'] is False else '')}"
                for e in experiences
            )

            try:
                raw = await client.complete_json([{
                    'role': 'user',
                    'content': SYNTHESIZE_AGENT_PATTERNS.format(
                        agent_name=agent_name, count=len(experiences), experiences_text=experiences_text,
                    ),
                }])
                patterns = AgentPatternSynthesis(**raw).patterns
            except Exception as exc:
                log.warning('agent_pattern_synthesis_failed', agent_id=str(agent_id), error=str(exc))
                continue

            if not patterns:
                continue

            pool3 = await get_pool()
            async with pool3.acquire() as conn:
                agent_user_id = await conn.fetchval('SELECT user_id FROM agents WHERE id = $1', agent_id)
                for p in patterns:
                    # contact_id IS NULL here (general scope) — a unique constraint
                    # wouldn't dedupe these anyway, since NULL != NULL — so check
                    # explicitly, same pattern as agent_memory.py's _record_fact.
                    existing = await conn.fetchval(
                        """SELECT id FROM agent_memories
                           WHERE agent_id = $1 AND contact_id IS NULL
                             AND memory_type = 'fact' AND memory_key = $2 AND memory_value = $3""",
                        agent_id, p.key, p.value,
                    )
                    if existing:
                        continue
                    embedding = await embed_text(f'{p.key}: {p.value}')
                    await conn.execute(
                        """
                        INSERT INTO agent_memories
                            (agent_id, user_id, contact_id, memory_type, memory_key, memory_value,
                             confidence, evidence_count, embedding)
                        VALUES ($1, $2, NULL, 'fact', $3, $4, 0.75, $5, $6)
                        """,
                        agent_id, agent_user_id, p.key, p.value, len(experiences), embedding,
                    )
                    synthesized += 1

        if synthesized:
            log.info('agent_patterns_synthesized', count=synthesized)
        return synthesized


def _rowcount(execute_result: str) -> int:
    """asyncpg's Connection.execute() returns a string like 'UPDATE 3'."""
    try:
        return int(execute_result.split()[-1])
    except (ValueError, IndexError):
        return 0
