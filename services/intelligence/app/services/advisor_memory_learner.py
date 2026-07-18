"""Advisor Companion Plan Phase 5 — Learning Loop And Personalization
(docs/ADVISOR_COMPANION_PLAN.md §6.5/§9). §6.5 lists three trigger
points — "after each advisor turn," "nightly consolidation," "after
explicit feedback" — but the first and third already exist as immediate
writes: Phase 1's `CLASSIFY_ADVISOR_TURN` proposes a `memory_suggestion`
on every turn, and the explicit remember/correct/forget endpoints
(`POST /api/advisor/memories`, `.../correct`, `DELETE .../:id`) are
already fully-trusted immediate writes. What this file adds is the
genuinely missing nightly pass: aggregating evidence that only means
something in bulk (tone-preference learning from `suggested_replies`
outcomes, learning from Advisor's own `advisor_action_requests`
completed/cancelled outcomes) and deactivating weak/stale memories —
mirroring `neural/emotion.py`'s reconsolidation job for `advisor_memories`
instead of `emotional_signals`.
"""
import structlog
from ..database import get_pool

log = structlog.get_logger()

_MIN_TONE_SAMPLES = 5
_MIN_ACTION_SAMPLES = 5
_HIGH_CANCEL_RATE = 0.4
_WEAK_MEMORY_CONFIDENCE = 0.3
_WEAK_MEMORY_STALE_DAYS = 30


class AdvisorMemoryLearnerService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch("SELECT id FROM users")
        for u in users:
            await self.learn_for_user(str(u['id']))
        return len(users)

    async def learn_for_user(self, user_id: str) -> None:
        await self._learn_tone_preference(user_id)
        await self._learn_from_action_outcomes(user_id)
        await self._deactivate_weak_memories(user_id)

    async def _learn_tone_preference(self, user_id: str) -> None:
        """§6.5 input: "accepted/rejected suggestions." Aggregates the
        last 30 days of suggested_replies outcomes by tone — never
        overfitting from one message, only once a tone has enough
        samples to mean something."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT sr.tone,
                          COUNT(*) FILTER (WHERE sr.status = 'approved') AS approved,
                          COUNT(*) FILTER (WHERE sr.status = 'edited_and_sent') AS edited,
                          COUNT(*) FILTER (WHERE sr.status = 'dismissed') AS dismissed
                   FROM suggested_replies sr
                   JOIN messages m ON m.id = sr.message_id
                   JOIN conversations c ON c.id = m.conversation_id
                   WHERE c.user_id = $1 AND sr.tone IS NOT NULL
                     AND sr.created_at > NOW() - INTERVAL '30 days'
                     AND sr.status IN ('approved', 'edited_and_sent', 'dismissed')
                   GROUP BY sr.tone""",
                user_id,
            )
        if not rows:
            return

        scored = []
        for r in rows:
            samples = int(r['approved']) + int(r['edited']) + int(r['dismissed'])
            if samples < _MIN_TONE_SAMPLES:
                continue
            # approved=1.0, edited=0.5 (landed but needed adjustment), dismissed=0.0
            score = (int(r['approved']) * 1.0 + int(r['edited']) * 0.5) / samples
            scored.append((score, samples, r['tone']))
        if not scored:
            return
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        best_score, best_samples, best_tone = scored[0]
        if best_score < 0.5:
            return  # nothing is actually landing well enough to recommend

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO advisor_user_profiles (user_id, tone_preferences)
                   VALUES ($1, $2::jsonb)
                   ON CONFLICT (user_id) DO UPDATE
                     SET tone_preferences = advisor_user_profiles.tone_preferences || $2::jsonb,
                         updated_at = NOW()""",
                user_id, {
                    'preferredReplyTone': best_tone,
                    'preferredReplyToneConfidence': round(best_score, 2),
                },
            )
            await self._upsert_memory(
                conn, user_id, 'preference', 'preferred_reply_tone',
                f"Replies with a {best_tone} tone tend to land best "
                f"({round(best_score * 100)}% approved/kept as-is over {best_samples} samples).",
                min(0.95, best_score),
            )

    async def _learn_from_action_outcomes(self, user_id: str) -> None:
        """§6.5 input: "approved drafts." A `completed` Advisor-proposed
        send is a strong positive signal the draft landed as-is; a
        `cancelled` one (after being proposed) is the opposite."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT
                     COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                     COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
                   FROM advisor_action_requests
                   WHERE user_id = $1 AND action_type = 'send_whatsapp_message'
                     AND created_at > NOW() - INTERVAL '30 days'""",
                user_id,
            )
        if not row:
            return
        completed, cancelled = int(row['completed'] or 0), int(row['cancelled'] or 0)
        total = completed + cancelled
        if total < _MIN_ACTION_SAMPLES:
            return
        cancel_rate = cancelled / total
        if cancel_rate < _HIGH_CANCEL_RATE:
            return  # drafts are landing fine — nothing to flag

        pool = await get_pool()
        async with pool.acquire() as conn:
            await self._upsert_memory(
                conn, user_id, 'disliked_advice', 'draft_cancel_rate',
                f"You've cancelled {cancelled} of {total} recently drafted messages "
                f"({round(cancel_rate * 100)}%) — worth asking what's not landing about the drafts.",
                0.5,
            )

    async def _upsert_memory(self, conn, user_id: str, memory_type: str, key: str,
                              value: str, confidence: float) -> None:
        existing = await conn.fetchrow(
            "SELECT id FROM advisor_memories WHERE user_id = $1 AND memory_key = $2 AND is_active = true",
            user_id, key,
        )
        if existing:
            await conn.execute(
                """UPDATE advisor_memories
                   SET memory_value = $1, confidence = $2, evidence_count = evidence_count + 1, last_seen_at = NOW()
                   WHERE id = $3""",
                value, confidence, existing['id'],
            )
        else:
            await conn.execute(
                """INSERT INTO advisor_memories (user_id, memory_type, memory_key, memory_value, confidence)
                   VALUES ($1, $2, $3, $4, $5)""",
                user_id, memory_type, key, value, confidence,
            )

    async def _deactivate_weak_memories(self, user_id: str) -> None:
        """§6.5 output: "deactivate weak/wrong memories." A memory that's
        both low-confidence and unreinforced in a month stops being
        surfaced in the system prompt — same "confidence decays without
        reinforcement" principle as `neural/emotion.py`'s
        reconsolidation, applied to `advisor_memories` instead of
        `emotional_signals`. `evidence_count <= 1` protects memories a
        user has corrected/reinforced from ever being silently dropped."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE advisor_memories
                   SET is_active = false
                   WHERE user_id = $1 AND is_active = true
                     AND confidence < $2 AND last_seen_at < NOW() - make_interval(days => $3)
                     AND evidence_count <= 1""",
                user_id, _WEAK_MEMORY_CONFIDENCE, _WEAK_MEMORY_STALE_DAYS,
            )


_instance: AdvisorMemoryLearnerService | None = None


def get_advisor_memory_learner() -> AdvisorMemoryLearnerService:
    global _instance
    if _instance is None:
        _instance = AdvisorMemoryLearnerService()
    return _instance
