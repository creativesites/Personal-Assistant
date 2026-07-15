"""Zuri Neural Layer — Emotion Engine (docs/NEURAL_LAYER_PLAN.md §4.2).

Platform-wide affect capture. Writes `emotional_signals` rows from two
sources: the existing per-WhatsApp-message analysis pass (reusing its
already-computed `emotions`/`sentiment` — no new LLM call) and Advisor
turns (a small dedicated classification call, since Advisor has no
existing sentiment pass to reuse). Also refreshes a relationship's
denormalized `emotional_signals_summary` cache, called from
`health.py`'s existing recalculation pass — same "computed cache column"
convention as `products.stock`/`relationships.health_score`, no new
scheduler.

Any module (CRM, Projects, Suppliers, ...) can eventually write to
`emotional_signals` through this same engine — this is not Advisor-owned.

Advisor Companion Plan Phase 0 (docs/ADVISOR_COMPANION_PLAN.md §3.6/§6.6-
§6.8) adds three things on top of what Neural Layer Phase 1 shipped:
`advisor_user_profiles.current_emotional_state` gets written after every
Advisor turn (not just the raw `emotional_signals` row), a pure
`emotional_congruence()` weighting function any retrieval path can call,
and a nightly reconsolidation job — the one piece §9's Phase 0 checklist
assumed (incorrectly) already existed platform-wide from Phase 1.
"""
import json
import structlog
from datetime import datetime, timezone

from ..ai.client import get_ai_client
from ..ai.prompts import CLASSIFY_EMOTION
from ..database import get_pool
from ..models import MessageAnalysis

log = structlog.get_logger()

_SUMMARY_WINDOW_DAYS = 30
_BASELINE_WINDOW_DAYS = 30
_RECONSOLIDATION_WINDOW_HOURS = 24
_TREND_SHIFT_THRESHOLD = 0.2  # valence delta big enough to count as "things changed since"


def emotional_congruence(current_valence: float, current_arousal: float,
                          candidate_valence: float, candidate_arousal: float) -> float:
    """0..1, 1 = maximally congruent with the user's current state. A pure
    function so any retrieval path (Advisor's contact-context builder
    today, `advisor_memories`/associative-graph traversal later) can blend
    it into an existing relevance/recency score — this is a weighting
    term, not a separate retrieval mechanism (§6.7)."""
    # Max possible distance: valence spans [-1, 1] (range 2), arousal [0, 1] (range 1).
    distance = abs(current_valence - candidate_valence) + abs(current_arousal - candidate_arousal)
    return max(0.0, 1.0 - distance / 3.0)


def _clamp(value: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _derive_valence_arousal(emotions: dict) -> tuple[float, float, str]:
    """Heuristic mapping from the existing discrete emotion vector
    (joy/sadness/anger/fear/surprise/love, each 0-1) to a continuous
    valence/arousal position. Not a new detection pass — a projection of
    signal the analyser already produces."""
    joy = emotions.get('joy', 0.0)
    sadness = emotions.get('sadness', 0.0)
    anger = emotions.get('anger', 0.0)
    fear = emotions.get('fear', 0.0)
    surprise = emotions.get('surprise', 0.0)
    love = emotions.get('love', 0.0)

    valence = _clamp((joy + love) - (sadness + anger + fear))
    arousal = _clamp((anger + fear + surprise + 0.5 * joy) / 2.5, 0.0, 1.0)

    scores = {'joy': joy, 'sadness': sadness, 'anger': anger, 'fear': fear, 'surprise': surprise, 'love': love}
    dominant = max(scores, key=scores.get) if any(scores.values()) else 'neutral'
    return valence, arousal, dominant


class EmotionEngine:
    async def record_from_message_analysis(
        self, user_id: str, contact_id: str, message_id: str, analysis: MessageAnalysis,
    ) -> None:
        """Writes an emotional_signals row for a WhatsApp message —
        reuses the already-computed analysis.emotions, no new LLM call."""
        emotions = analysis.emotions.model_dump()
        valence, arousal, dominant = _derive_valence_arousal(emotions)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO emotional_signals
                     (user_id, entity_type, entity_id, contact_id, valence, arousal,
                      dominant_emotion, emotion_vector)
                   VALUES ($1, 'whatsapp_message', $2, $3, $4, $5, $6, $7)""",
                user_id, message_id, contact_id, valence, arousal, dominant, json.dumps(emotions),
            )

    async def record_advisor_turn(
        self, user_id: str, session_id: str | None, text: str, contact_id: str | None = None,
    ) -> None:
        """Advisor has no existing sentiment pass to reuse, so this makes
        one small, dedicated classification call — the accepted marginal
        cost for platform-wide emotional coverage (docs/NEURAL_LAYER_PLAN.md
        §4.2). Fails soft: a classification error should never break the
        Advisor turn itself."""
        if not text.strip():
            return

        client = get_ai_client()
        try:
            raw = await client.complete_json([
                {'role': 'user', 'content': CLASSIFY_EMOTION.format(text=text)},
            ], service='intelligence', feature='emotional_analysis', user_id=user_id)
            emotions = raw.get('emotions', {})
        except Exception as exc:
            log.warning('advisor_turn_emotion_classification_failed', error=str(exc))
            return

        valence, arousal, dominant = _derive_valence_arousal(emotions)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO emotional_signals
                     (user_id, entity_type, entity_id, contact_id, valence, arousal,
                      dominant_emotion, emotion_vector)
                   VALUES ($1, 'advisor_turn', $2, $3, $4, $5, $6, $7)""",
                user_id, session_id, contact_id, valence, arousal, dominant, json.dumps(emotions),
            )

        await self._update_user_emotional_state(user_id, valence, arousal, dominant)

    async def _update_user_emotional_state(self, user_id: str, valence: float, arousal: float, dominant: str) -> None:
        """Advisor Companion Plan §6.6 — writes advisor_user_profiles.
        current_emotional_state after every update so retrieval weighting
        (emotional_congruence, above) is cheap to read elsewhere without
        recomputing from raw emotional_signals rows every time."""
        state = {
            'valence': valence, 'arousal': arousal, 'dominantEmotion': dominant,
            'asOf': datetime.now(timezone.utc).isoformat(),
        }
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO advisor_user_profiles (user_id, current_emotional_state)
                   VALUES ($1, $2::jsonb)
                   ON CONFLICT (user_id) DO UPDATE
                     SET current_emotional_state = $2::jsonb, updated_at = NOW()""",
                user_id, json.dumps(state),
            )

    async def get_current_emotional_state(self, user_id: str) -> dict:
        """Read-side of the above — defaults to a neutral-calm state for a
        user with no Advisor turns yet, so callers never need a null check."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT current_emotional_state FROM advisor_user_profiles WHERE user_id = $1", user_id,
            )
        state = row['current_emotional_state'] if row else None
        if not state:
            return {'valence': 0.0, 'arousal': 0.3, 'dominantEmotion': 'neutral'}
        return state

    async def reconsolidate(self) -> int:
        """Advisor Companion Plan §6.8 — nightly job, platform-wide (not
        Advisor-owned), same asyncio-scheduler convention as
        daily_worker.py. Neural Layer Phase 1 shipped `emotional_signals.
        memory_weight` but nothing ever updated it; this closes that gap.

        Simplification vs. the plan's own `last_retrieved_at`-tracked
        design: no retrieval call site marks rows as "accessed" yet, so
        this revisits every row from the trailing 24h instead — a memory
        gets its weight pulled down when the SAME user+contact pair's more
        recent signals show a materially different (less negative) trend,
        the same "a resolved fight matters less now" example from §3.6,
        just triggered by elapsed time rather than an access event.
        """
        pool = await get_pool()
        adjusted = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT id, user_id, contact_id, valence, memory_weight
                   FROM emotional_signals
                   WHERE contact_id IS NOT NULL
                     AND created_at > NOW() - make_interval(hours => $1)""",
                _RECONSOLIDATION_WINDOW_HOURS,
            )
            for row in rows:
                recent = await conn.fetchrow(
                    """SELECT AVG(valence) AS avg_valence FROM emotional_signals
                       WHERE user_id = $1 AND contact_id = $2 AND created_at > NOW() - INTERVAL '3 days'""",
                    row['user_id'], row['contact_id'],
                )
                if not recent or recent['avg_valence'] is None:
                    continue
                delta = float(recent['avg_valence']) - float(row['valence'])
                # Only a negative memory whose surrounding valence has since
                # improved gets reweighted — a memory getting *more* charged
                # isn't reconsolidation's job here, just decay of the old one.
                if row['valence'] < 0 and delta > _TREND_SHIFT_THRESHOLD:
                    new_weight = max(0.1, float(row['memory_weight']) - 0.15)
                    await conn.execute(
                        'UPDATE emotional_signals SET memory_weight = $1 WHERE id = $2',
                        new_weight, row['id'],
                    )
                    adjusted += 1

            user_ids = await conn.fetch(
                "SELECT DISTINCT user_id FROM emotional_signals WHERE entity_type = 'advisor_turn'",
            )
            for row in user_ids:
                baseline_row = await conn.fetchrow(
                    """SELECT AVG(valence) AS avg_valence, AVG(arousal) AS avg_arousal
                       FROM emotional_signals
                       WHERE user_id = $1 AND entity_type = 'advisor_turn'
                         AND created_at > NOW() - make_interval(days => $2)""",
                    row['user_id'], _BASELINE_WINDOW_DAYS,
                )
                if not baseline_row or baseline_row['avg_valence'] is None:
                    continue
                baseline = {
                    'valence': round(float(baseline_row['avg_valence']), 3),
                    'arousal': round(float(baseline_row['avg_arousal']), 3),
                    'windowDays': _BASELINE_WINDOW_DAYS,
                }
                await conn.execute(
                    """INSERT INTO advisor_user_profiles (user_id, emotional_baseline)
                       VALUES ($1, $2::jsonb)
                       ON CONFLICT (user_id) DO UPDATE
                         SET emotional_baseline = $2::jsonb, updated_at = NOW()""",
                    row['user_id'], json.dumps(baseline),
                )

        log.info('emotion_reconsolidation_complete', adjusted=adjusted, users=len(user_ids))
        return adjusted

    async def refresh_relationship_summary(self, contact_id: str, user_id: str) -> dict:
        """Recomputes relationships.emotional_signals_summary from the
        trailing 30 days of emotional_signals — called from health.py's
        existing recalculation pass, not a new scheduler."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT valence, arousal
                   FROM emotional_signals
                   WHERE user_id = $1 AND contact_id = $2
                     AND created_at > NOW() - make_interval(days => $3)
                   ORDER BY created_at ASC""",
                user_id, contact_id, _SUMMARY_WINDOW_DAYS,
            )

            if not rows:
                summary = {}
            else:
                mid = len(rows) // 2
                first_half = rows[:mid] or rows
                second_half = rows[mid:] or rows

                avg_valence = sum(r['valence'] for r in rows) / len(rows)
                avg_arousal = sum(r['arousal'] for r in rows) / len(rows)
                first_avg = sum(r['valence'] for r in first_half) / len(first_half)
                second_avg = sum(r['valence'] for r in second_half) / len(second_half)

                if second_avg > first_avg + 0.1:
                    trust_trend = 'improving'
                elif second_avg < first_avg - 0.1:
                    trust_trend = 'declining'
                else:
                    trust_trend = 'stable'

                summary = {
                    'relationshipConfidence': round((float(avg_valence) + 1) / 2 * 100),
                    'trustTrend': trust_trend,
                    'communicationWarmth': round(max(0.0, float(avg_valence)) * 100),
                    # Requires correlating with business signals (deals,
                    # order_intent_mentioned) that this engine doesn't read —
                    # left null rather than fabricated from affect alone.
                    # See docs/NEURAL_LAYER_PLAN.md §4.2's worked example.
                    'buyingIntent': None,
                    'responseMomentum': round(float(avg_arousal) * 100),
                    'conversationStress': round(max(0.0, -float(avg_valence)) * float(avg_arousal) * 100),
                    'signalCount': len(rows),
                }

            await conn.execute(
                """UPDATE relationships SET emotional_signals_summary = $1
                   WHERE contact_id = $2 AND user_id = $3""",
                json.dumps(summary), contact_id, user_id,
            )

        return summary


_engine: EmotionEngine | None = None


def get_emotion_engine() -> EmotionEngine:
    global _engine
    if _engine is None:
        _engine = EmotionEngine()
    return _engine
