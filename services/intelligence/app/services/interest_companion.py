"""Advisor Companion Plan Phase 4.5 — Proactive Interest Companion
(docs/ADVISOR_COMPANION_PLAN.md §3.8/§6.10/§9). The user-facing sibling of
interest_matcher.py (which is contact-facing — it matches news to a
*contact's* interests for a respond_to_event nudge). This is the same
idea turned inward on the user.

Gated on personal_mode_enabled, same as the Gossip Worthiness Detector —
no discovery-tracking mechanism exists yet to gate on organic use instead.

**Search deviation from the plan's own 3-tier hybrid chain.** §6.10 calls
for model-native search/grounding tool first, `web_search.py` second, a
forced search-capable Gemini model last. Only the middle tier is
implemented here: `ai/client.py` has no LiteLLM tool-calling/grounding
wiring today for any provider in this codebase, and building a new,
unverified grounding integration with no way to exercise real tool-call
responses in this environment would be exactly the kind of "shipped code
that can't be verified" this project has avoided elsewhere. If no
TAVILY_API_KEY/SERP_API_KEY is configured, `web_search.py` returns an
empty list and a user's run for that topic is silently skipped — the same
graceful no-op interest_matcher.py already uses when it has no headlines
to match against.
"""
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_INTEREST_NUDGE
from ..database import get_pool
from .web_search import get_web_search
from .companion_delivery import deliver_initiated_message, engagement_rate

log = structlog.get_logger()

_MAX_TOPICS_PER_RUN = 5
_DEDUP_WINDOW_HOURS = 20
_MIN_ENGAGEMENT_SAMPLES = 5
_MIN_ENGAGEMENT_RATE = 0.15
_INTEREST_CONTENT_TYPES = ('sports_score', 'meme', 'news_article', 'stock_alert')


class InterestCompanionService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT user_id FROM advisor_user_profiles
                   WHERE personal_mode_enabled = true AND companion_features_paused = false
                     AND jsonb_array_length(interests) > 0""",
            )
        total = 0
        for u in users:
            total += await self.run_for_user(str(u['user_id']))
        return total

    async def run_for_user(self, user_id: str) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            profile = await conn.fetchrow(
                "SELECT interests FROM advisor_user_profiles WHERE user_id = $1", user_id,
            )
            # §3.8 — the close circle's own aggregated interests double as
            # topics worth knowing about, same insight keys the
            # contact-facing interest_matcher.py already reads.
            circle_rows = await conn.fetch(
                """SELECT DISTINCT ci.insight_value FROM contact_insights ci
                   JOIN relationships r ON r.contact_id = ci.contact_id AND r.user_id = ci.user_id
                   WHERE ci.user_id = $1 AND ci.is_active = true
                     AND r.importance_tier IN (1, 2)
                     AND ci.insight_key IN ('interests', 'hobbies', 'sports_teams', 'favorite_topics')
                   LIMIT 10""",
                user_id,
            )

        interests = list(profile['interests']) if profile and profile['interests'] else []
        topics = list(dict.fromkeys([*interests, *[r['insight_value'] for r in circle_rows]]))[:_MAX_TOPICS_PER_RUN]
        if not topics:
            return 0

        # Advisor Companion Plan Phase 5 (§6.5/§9) — §3.8's own frequency-
        # tuning promise: engagement across the interest cron's content
        # types (weighted-averaged since which type applies isn't known
        # until after the model judges each result) throttles this cycle
        # entirely rather than the cron getting louder when ignored.
        total_samples = 0
        total_engaged = 0.0
        for ct in _INTEREST_CONTENT_TYPES:
            ct_rate, ct_samples = await engagement_rate(user_id, ct)
            total_samples += ct_samples
            total_engaged += ct_rate * ct_samples
        if total_samples >= _MIN_ENGAGEMENT_SAMPLES and (total_engaged / total_samples) < _MIN_ENGAGEMENT_RATE:
            log.info('interest_cron_throttled', user_id=user_id, rate=round(total_engaged / total_samples, 2), samples=total_samples)
            return 0

        search = get_web_search()
        ai = get_ai_client()
        delivered = 0
        for topic in topics:
            async with pool.acquire() as conn:
                already_recent = await conn.fetchval(
                    """SELECT COUNT(*) FROM proactive_interest_chats
                       WHERE user_id = $1 AND interest_topic = $2
                         AND delivered_at > NOW() - make_interval(hours => $3)""",
                    user_id, topic, _DEDUP_WINDOW_HOURS,
                )
            if already_recent and int(already_recent) > 0:
                continue

            results = await search.search(topic, max_results=5)
            if not results:
                continue  # no search capability configured, or nothing found — skip silently

            results_text = '\n'.join(f"- {r.title}: {r.snippet[:200]}" for r in results[:5])
            try:
                nudge = await ai.complete_json([{
                    'role': 'user',
                    'content': GENERATE_INTEREST_NUDGE.format(topic=topic, results=results_text),
                }])
            except Exception as exc:
                log.warning('interest_nudge_generation_failed', topic=topic, error=str(exc))
                continue

            if not nudge.get('worth_sharing'):
                continue
            message_text = nudge.get('message', '')
            if not message_text:
                continue
            content_type = nudge.get('content_type') or 'news_article'
            trigger_event = nudge.get('trigger_event') or topic

            session_id = await deliver_initiated_message(
                user_id, message_text, {'type': 'proactive_interest', 'topic': topic},
            )
            async with pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO proactive_interest_chats
                         (user_id, session_id, interest_topic, trigger_event, content_type)
                       VALUES ($1, $2, $3, $4, $5)""",
                    user_id, session_id, topic, trigger_event, content_type,
                )
            delivered += 1
        return delivered


_instance: InterestCompanionService | None = None


def get_interest_companion() -> InterestCompanionService:
    global _instance
    if _instance is None:
        _instance = InterestCompanionService()
    return _instance
