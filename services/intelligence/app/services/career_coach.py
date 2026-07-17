"""Career & Growth Engine Phase 5 — Career Coach & Motivation
(docs/CAREER_GROWTH_ENGINE_PLAN.md §11). Not a new service — a
companion_delivery.py consumer mirroring motivational_detector.py's exact
shape: plain SQL detection of real signals (no application activity in 14+
days, a rejection just logged, an opportunity crossing into interviewing/
offered), one small LLM call only for the encouraging phrasing itself.

Deliberately NOT gated on personal_mode_enabled the way the other Phase 4.5
companion crons are — career growth spans both business and personal modes
(the same reasoning that keeps /career itself out of the mode-gated nav
group), so gating it behind "personal mode" would wrongly hide it from
business-mode users. It still respects the universal
companion_features_paused kill switch every unsolicited Advisor message
honors, and only fires for users who've actually engaged with Career OS
(a career_profiles row exists).
"""
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import CAREER_COACH_TONE_POLICY, GENERATE_CAREER_COACH_NUDGE
from ..database import get_pool
from .companion_delivery import deliver_initiated_message, engagement_rate

log = structlog.get_logger()

_DEDUP_WINDOW_HOURS = 20
_MIN_ENGAGEMENT_SAMPLES = 5
_MIN_ENGAGEMENT_RATE = 0.15


class CareerCoachService:
    async def run_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT DISTINCT cp.user_id FROM career_profiles cp
                   JOIN advisor_user_profiles aup ON aup.user_id = cp.user_id
                   WHERE aup.companion_features_paused = false""",
            )
        count = 0
        for u in users:
            if await self.check_and_nudge(str(u['user_id'])):
                count += 1
        return count

    async def check_and_nudge(self, user_id: str) -> bool:
        # Same "frequency drops rather than the message getting louder"
        # promise motivational_detector.py's own engagement gate makes.
        rate, samples = await engagement_rate(user_id, 'career_coach')
        if samples >= _MIN_ENGAGEMENT_SAMPLES and rate < _MIN_ENGAGEMENT_RATE:
            log.info('career_coach_nudge_throttled', user_id=user_id, rate=round(rate, 2), samples=samples)
            return False

        pool = await get_pool()
        async with pool.acquire() as conn:
            already_recent = await conn.fetchval(
                """SELECT COUNT(*) FROM proactive_interest_chats
                   WHERE user_id = $1 AND content_type = 'career_coach'
                     AND delivered_at > NOW() - make_interval(hours => $2)""",
                user_id, _DEDUP_WINDOW_HOURS,
            )
            if already_recent and int(already_recent) > 0:
                return False

            celebration = await conn.fetchrow(
                """SELECT title, company_or_org, status FROM career_opportunities
                   WHERE user_id = $1 AND status IN ('interviewing', 'offered')
                     AND updated_at > NOW() - INTERVAL '24 hours'
                   ORDER BY updated_at DESC LIMIT 1""",
                user_id,
            )
            rejection = await conn.fetchrow(
                """SELECT title, company_or_org FROM career_opportunities
                   WHERE user_id = $1 AND status = 'rejected'
                     AND updated_at > NOW() - INTERVAL '24 hours'
                   ORDER BY updated_at DESC LIMIT 1""",
                user_id,
            )
            stats = await conn.fetchrow(
                """SELECT
                     COUNT(*) FILTER (WHERE status = 'applied') AS applied_count,
                     COUNT(*) FILTER (WHERE status IN ('applied', 'interviewing', 'offered', 'accepted')
                                       AND updated_at > NOW() - INTERVAL '14 days') AS recent_activity,
                     COUNT(*) FILTER (WHERE status IN ('detected', 'shortlisted')) AS pending_count
                   FROM career_opportunities WHERE user_id = $1""",
                user_id,
            )
            interview_count = await conn.fetchval(
                'SELECT COUNT(*) FROM career_interviews WHERE user_id = $1', user_id,
            )

        trigger: str | None = None
        context = ''
        if celebration:
            trigger = 'celebrate'
            context = f"Just moved to '{celebration['status']}': {celebration['title']}" + (
                f" at {celebration['company_or_org']}" if celebration['company_or_org'] else ''
            )
        elif rejection:
            trigger = 'rejection'
            applied_count = int(stats['applied_count'] or 0) if stats else 0
            context = (
                f"Just got a rejection: {rejection['title']}"
                + (f" at {rejection['company_or_org']}" if rejection['company_or_org'] else '')
                + f". Real counts to ground the response in: {applied_count} application(s) submitted total, "
                f"{int(interview_count or 0)} interview round(s) logged."
            )
        elif stats and int(stats['recent_activity'] or 0) == 0 and int(stats['pending_count'] or 0) > 0:
            trigger = 'stalled'
            context = (
                f"{int(stats['pending_count'])} opportunity(ies) sitting in detected/shortlisted status "
                "with no application movement in the last 14 days."
            )
        else:
            return False

        ai = get_ai_client()
        try:
            nudge = await ai.complete_json([{
                'role': 'user',
                'content': GENERATE_CAREER_COACH_NUDGE.format(
                    policy=CAREER_COACH_TONE_POLICY, trigger=trigger, context=context,
                ),
            }], service='career', feature='career_coach_nudge', user_id=user_id)
        except Exception as exc:
            log.warning('career_coach_nudge_generation_failed', user_id=user_id, error=str(exc))
            return False

        message_text = nudge.get('message', '')
        if not message_text:
            return False

        session_id = await deliver_initiated_message(user_id, message_text, {'type': 'career_coach', 'trigger': trigger})
        if session_id is None:
            return False
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO proactive_interest_chats
                     (user_id, session_id, interest_topic, trigger_event, content_type)
                   VALUES ($1, $2, 'career_coach', $3, 'career_coach')""",
                user_id, session_id, context,
            )
        return True


_instance: CareerCoachService | None = None


def get_career_coach() -> CareerCoachService:
    global _instance
    if _instance is None:
        _instance = CareerCoachService()
    return _instance
