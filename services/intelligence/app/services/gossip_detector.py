"""Advisor Companion Plan Phase 4.5 — Gossip Worthiness Detector
(docs/ADVISOR_COMPANION_PLAN.md §3.7/§6.9/§9). A daily aggregation, same
"read signals that already exist" discipline as pricing_benchmarks.py/
document_followups.py — no new sentiment pass, just SQL over
emotional_signals/relationship_clocks/relationship_health_logs/
contact_life_events. Delivery timing (deciding *when* a pending row is a
good moment to surface) lives in Node's GET /api/advisor/companion-feed,
which already owns that read path and can check
advisor_user_profiles.current_emotional_state directly without a second
service hop.

Gated on personal_mode_enabled rather than "organic discovery" — no
discovery-tracking mechanism was ever built as literal DB flags, and §1.2
itself explains personal_mode_enabled exists precisely so this phase's
crons are testable end-to-end without waiting on that.
"""
import structlog
from ..database import get_pool

log = structlog.get_logger()

_TONE_SHIFT_DELTA = 0.25
_RECIPROCITY_DROP_DELTA = 10  # relationships.health_score points
_STALE_EVENT_DAYS = 3  # don't re-flag the same contact+signal within this window
_MIN_ENGAGEMENT_SAMPLES = 5
_MAX_DISMISS_RATE = 0.7


class GossipDetectorService:
    async def detect_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT user_id FROM advisor_user_profiles
                   WHERE personal_mode_enabled = true AND companion_features_paused = false""",
            )
        total = 0
        for u in users:
            total += await self.detect_for_user(str(u['user_id']))
        return total

    async def detect_for_user(self, user_id: str) -> int:
        # Advisor Companion Plan Phase 5 (§6.5/§9) — §3.7's own promise that
        # dismissed/ignored gossip visibly reduces future frequency: if
        # the user has been dismissing most of what's been surfaced
        # recently, skip detection entirely this cycle rather than
        # queuing up more of the same.
        if await self._is_dismiss_heavy(user_id):
            log.info('gossip_detection_throttled', user_id=user_id)
            return 0

        created = 0
        created += await self._detect_tone_shift(user_id)
        created += await self._detect_ghosting(user_id)
        created += await self._detect_sudden_interest(user_id)
        created += await self._detect_life_event(user_id)
        created += await self._detect_reciprocity_drop(user_id)
        return created

    async def _is_dismiss_heavy(self, user_id: str) -> bool:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed,
                          COUNT(*) FILTER (WHERE status IN ('delivered', 'dismissed')) AS resolved
                   FROM gossip_worthy_events
                   WHERE user_id = $1 AND created_at > NOW() - INTERVAL '14 days'""",
                user_id,
            )
        resolved = int(row['resolved']) if row else 0
        if resolved < _MIN_ENGAGEMENT_SAMPLES:
            return False
        return (int(row['dismissed']) / resolved) > _MAX_DISMISS_RATE

    async def _already_flagged_recently(self, conn, user_id: str, contact_id: str, signal_type: str) -> bool:
        row = await conn.fetchval(
            """SELECT 1 FROM gossip_worthy_events
               WHERE user_id = $1 AND contact_id = $2 AND signal_type = $3
                 AND status IN ('pending', 'delivered')
                 AND created_at > NOW() - make_interval(days => $4)""",
            user_id, contact_id, signal_type, _STALE_EVENT_DAYS,
        )
        return row is not None

    async def _create(self, conn, user_id: str, contact_id: str, signal_type: str,
                       summary: str, confidence: float) -> bool:
        if await self._already_flagged_recently(conn, user_id, contact_id, signal_type):
            return False
        in_close_circle = await conn.fetchval(
            "SELECT importance_tier IN (1, 2) FROM relationships WHERE user_id = $1 AND contact_id = $2",
            user_id, contact_id,
        )
        await conn.execute(
            """INSERT INTO gossip_worthy_events
                 (user_id, contact_id, signal_type, summary, confidence, in_close_circle)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            user_id, contact_id, signal_type, summary, confidence, bool(in_close_circle),
        )
        return True

    async def _detect_tone_shift(self, user_id: str) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT es.contact_id,
                          COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                          AVG(es.valence) FILTER (WHERE es.created_at > NOW() - INTERVAL '7 days') AS recent_valence,
                          AVG(es.valence) FILTER (WHERE es.created_at <= NOW() - INTERVAL '7 days'
                                                    AND es.created_at > NOW() - INTERVAL '14 days') AS prior_valence,
                          COUNT(*) FILTER (WHERE es.created_at > NOW() - INTERVAL '7 days') AS recent_count
                   FROM emotional_signals es
                   JOIN contacts c ON c.id = es.contact_id
                   WHERE es.user_id = $1 AND es.contact_id IS NOT NULL AND es.entity_type = 'whatsapp_message'
                     AND c.is_group = false
                   GROUP BY es.contact_id, c.custom_name, c.display_name, c.phone_number
                   HAVING COUNT(*) FILTER (WHERE es.created_at > NOW() - INTERVAL '7 days') >= 3""",
                user_id,
            )
            for r in rows:
                if r['recent_valence'] is None or r['prior_valence'] is None:
                    continue
                delta = float(r['recent_valence']) - float(r['prior_valence'])
                if abs(delta) < _TONE_SHIFT_DELTA:
                    continue
                direction = 'warmer' if delta > 0 else 'cooler'
                summary = f"{r['contact_name']} has been texting noticeably {direction} this past week than the week before."
                confidence = min(0.95, 0.5 + abs(delta))
                if await self._create(conn, user_id, str(r['contact_id']), 'tone_shift', summary, confidence):
                    created += 1
        return created

    async def _detect_ghosting(self, user_id: str) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT r.contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM relationships r
                   JOIN contacts c ON c.id = r.contact_id
                   JOIN relationship_clocks rc ON rc.contact_id = r.contact_id AND rc.user_id = r.user_id
                     AND rc.clock_type = 'dormancy_watch'
                   WHERE r.user_id = $1 AND c.is_group = false
                     AND rc.avg_days_between_messages IS NOT NULL AND rc.avg_days_between_messages > 0
                     AND r.last_interaction_at IS NOT NULL
                     AND r.last_interaction_at < NOW() - (rc.avg_days_between_messages * 2 * INTERVAL '1 day')""",
                user_id,
            )
            for r in rows:
                summary = f"{r['contact_name']} has gone quiet — well past their usual rhythm of staying in touch."
                if await self._create(conn, user_id, str(r['contact_id']), 'ghosting', summary, 0.6):
                    created += 1
        return created

    async def _detect_sudden_interest(self, user_id: str) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT r.contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                          rc.avg_days_between_messages,
                          COUNT(m.id) FILTER (WHERE m.whatsapp_timestamp > NOW() - INTERVAL '7 days'
                                                AND m.sender_type = 'contact') AS recent_count
                   FROM relationships r
                   JOIN contacts c ON c.id = r.contact_id
                   JOIN relationship_clocks rc ON rc.contact_id = r.contact_id AND rc.user_id = r.user_id
                     AND rc.clock_type = 'dormancy_watch'
                   JOIN conversations conv ON conv.contact_id = r.contact_id AND conv.user_id = r.user_id
                   JOIN messages m ON m.conversation_id = conv.id
                   WHERE r.user_id = $1 AND c.is_group = false
                     AND rc.avg_days_between_messages IS NOT NULL AND rc.avg_days_between_messages > 0
                   GROUP BY r.contact_id, c.custom_name, c.display_name, c.phone_number, rc.avg_days_between_messages
                   HAVING COUNT(m.id) FILTER (WHERE m.whatsapp_timestamp > NOW() - INTERVAL '7 days'
                                                AND m.sender_type = 'contact') >= 3""",
                user_id,
            )
            for r in rows:
                expected_weekly = 7.0 / float(r['avg_days_between_messages'])
                actual = int(r['recent_count'])
                if actual < expected_weekly * 1.7:
                    continue
                summary = f"{r['contact_name']} has been reaching out a lot more than usual this week."
                confidence = min(0.9, 0.5 + (actual / max(expected_weekly, 1.0)) * 0.1)
                if await self._create(conn, user_id, str(r['contact_id']), 'sudden_interest', summary, confidence):
                    created += 1
        return created

    async def _detect_life_event(self, user_id: str) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT cle.contact_id, cle.title,
                          COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM contact_life_events cle
                   JOIN contacts c ON c.id = cle.contact_id
                   WHERE cle.user_id = $1 AND cle.created_at > NOW() - INTERVAL '3 days'""",
                user_id,
            )
            for r in rows:
                summary = f"{r['contact_name']}: {r['title']}"
                if await self._create(conn, user_id, str(r['contact_id']), 'life_event', summary, 0.8):
                    created += 1
        return created

    async def _detect_reciprocity_drop(self, user_id: str) -> int:
        pool = await get_pool()
        created = 0
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT r.id AS relationship_id, r.contact_id, r.health_score AS current_score,
                          COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                          (SELECT hl.health_score FROM relationship_health_logs hl
                           WHERE hl.relationship_id = r.id AND hl.logged_at <= NOW() - INTERVAL '7 days'
                           ORDER BY hl.logged_at DESC LIMIT 1) AS prior_score
                   FROM relationships r
                   JOIN contacts c ON c.id = r.contact_id
                   WHERE r.user_id = $1 AND c.is_group = false""",
                user_id,
            )
            for r in rows:
                if r['prior_score'] is None:
                    continue
                delta = int(r['prior_score']) - int(r['current_score'])
                if delta < _RECIPROCITY_DROP_DELTA:
                    continue
                summary = f"Things have cooled off a bit with {r['contact_name']} — the back-and-forth isn't as even as it was."
                confidence = min(0.9, 0.5 + delta / 100)
                if await self._create(conn, user_id, str(r['contact_id']), 'reciprocity_drop', summary, confidence):
                    created += 1
        return created


_instance: GossipDetectorService | None = None


def get_gossip_detector() -> GossipDetectorService:
    global _instance
    if _instance is None:
        _instance = GossipDetectorService()
    return _instance
