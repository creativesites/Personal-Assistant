"""Advisor Companion Plan Phase 6 — Safe Scoped Automation
(docs/ADVISOR_COMPANION_PLAN.md §3.5's "handle this conversation for 10
minutes, auto-send only logistical confirmations" worked example, §9). A
time-limited, conversation-scoped auto-send grant that layers ON TOP of
the existing auto-response eligibility checks (auto_response.py's
check_eligibility, wired in from reply_gen.py) — it never bypasses
business hours, exclusions, escalation keywords, or group/broadcast
skipping; it only ever overrides the approval_mode gate, and only for a
specific reply judged in-scope and low-risk by check_reply_in_scope().
"""
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import CLASSIFY_SCOPED_AUTOMATION
from ..database import get_pool

log = structlog.get_logger()


class ScopedAutomationService:
    async def find_active_grant(self, conversation_id: str) -> dict | None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT * FROM advisor_automation_grants
                   WHERE conversation_id = $1 AND status = 'active' AND expires_at > NOW()
                   ORDER BY created_at DESC LIMIT 1""",
                conversation_id,
            )
        return dict(row) if row else None

    async def create_grant(self, user_id: str, session_id: str, conversation_id: str,
                            scope_description: str, minutes: int = 30) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO advisor_automation_grants
                     (user_id, session_id, conversation_id, scope_description, expires_at)
                   VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5))
                   RETURNING *""",
                user_id, session_id, conversation_id, scope_description, minutes,
            )
        return dict(row)

    async def check_reply_in_scope(self, grant: dict, incoming_message: str, draft_reply: str) -> tuple[bool, str]:
        """Never trusts the grant's own scope description alone to
        greenlight a specific reply — re-checks each candidate exchange
        against it every time. is_high_risk always wins over in_scope."""
        ai = get_ai_client()
        try:
            result = await ai.complete_json([{
                'role': 'user',
                'content': CLASSIFY_SCOPED_AUTOMATION.format(
                    scope=grant['scope_description'], incoming_message=incoming_message, draft_reply=draft_reply,
                ),
            }], service='advisor', feature='scoped_automation_check', user_id=str(grant.get('user_id')) if grant.get('user_id') else None)
        except Exception as exc:
            log.warning('scoped_automation_classification_failed', error=str(exc))
            return False, 'classification_failed'
        if bool(result.get('is_high_risk')):
            return False, 'high_risk'
        if not result.get('in_scope'):
            return False, 'out_of_scope'
        return True, 'in_scope'

    async def log_audit(self, grant_id: str, user_id: str, conversation_id: str, message_id: str | None,
                         action: str, detail: str, sent_text: str | None = None) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO advisor_automation_audit_log
                     (grant_id, user_id, conversation_id, message_id, action, detail, sent_text)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                grant_id, user_id, conversation_id, message_id, action, detail, sent_text,
            )


_instance: ScopedAutomationService | None = None


def get_scoped_automation() -> ScopedAutomationService:
    global _instance
    if _instance is None:
        _instance = ScopedAutomationService()
    return _instance
