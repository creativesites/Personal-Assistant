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
"""
import json
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import CLASSIFY_EMOTION
from ..database import get_pool
from ..models import MessageAnalysis

log = structlog.get_logger()

_SUMMARY_WINDOW_DAYS = 30


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
            ])
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
