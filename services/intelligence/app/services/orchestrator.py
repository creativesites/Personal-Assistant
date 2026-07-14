"""
Conversation Orchestrator.

Acts as the manager layer between incoming messages and the worker fleet.
Every inbound message passes through here to decide:
  - route_to_agent    → an active agent is assigned to this contact
  - generate_suggestion → no agent — run normal suggestion / reply-draft flow
  - no_response_needed  → analysis says no reply required

The orchestrator logs every decision to orchestrator_decisions for replay.
"""

import structlog
from ..database import get_pool

log = structlog.get_logger()


async def route_message(
    message_id: str,
    conversation_id: str,
    contact_id: str,
    user_id: str,
    requires_response: bool = True,
) -> tuple[str, str | None]:
    """
    Determine how to handle an incoming message.

    Returns (decision, agent_id) where decision is one of:
      'route_to_agent'      – hand off to agent_engine
      'generate_suggestion' – run normal suggestion flow
      'no_response_needed'  – analysis marked requires_response=False
    """
    if not requires_response:
        await _log_decision(
            user_id, conversation_id, message_id,
            'no_response_needed', None,
            'Analysis indicates no reply is needed',
        )
        return 'no_response_needed', None

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Find the most appropriate active agent for this contact:
        # 1. Direct contact assignment takes priority over segment/tag assignment
        # 2. Most recently created assignment wins ties
        agent = await conn.fetchrow(
            """
            SELECT a.id, a.name, a.trust_level, aa.contact_id IS NOT NULL AS is_direct
            FROM agent_assignments aa
            JOIN agents a ON a.id = aa.agent_id
            WHERE a.user_id = $1
              AND a.is_active = TRUE
              AND (
                aa.contact_id = $2
                OR EXISTS (
                  SELECT 1 FROM contact_tags ct
                  WHERE ct.contact_id = $2
                    AND ct.tag = aa.segment_tag
                )
              )
            ORDER BY
              (aa.contact_id IS NOT NULL) DESC,
              aa.created_at DESC
            LIMIT 1
            """,
            user_id,
            contact_id,
        )

        # No explicit assignment — fall back to the user's Default Assistant
        # (docs/AUTO_REPLY_AGENTS_PLAN.md §2) rather than the bare suggestion
        # flow. Every user has exactly one is_default=TRUE agent from signup
        # (backfilled for existing accounts in migration 0052), so the plain
        # non-agent path below is now only reached if that agent has been
        # deactivated or is somehow missing.
        default_agent = None
        if not agent:
            default_agent = await conn.fetchrow(
                """
                SELECT id, name, trust_level FROM agents
                WHERE user_id = $1 AND is_default = TRUE AND is_active = TRUE
                LIMIT 1
                """,
                user_id,
            )

    if agent:
        decision = 'route_to_agent'
        agent_id = str(agent['id'])
        reasoning = (
            f"Contact {'directly' if agent['is_direct'] else 'via tag'} assigned to "
            f"agent '{agent['name']}' (trust={agent['trust_level']})"
        )
    elif default_agent:
        decision = 'route_to_agent'
        agent_id = str(default_agent['id'])
        reasoning = f"No explicit assignment — routed to Default Assistant '{default_agent['name']}' (trust={default_agent['trust_level']})"
    else:
        decision = 'generate_suggestion'
        agent_id = None
        reasoning = 'No active agent assigned — generating reply suggestions'

    await _log_decision(user_id, conversation_id, message_id, decision, agent_id, reasoning)

    log.info(
        'orchestrator_decision',
        decision=decision,
        agent_id=agent_id,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    return decision, agent_id


async def _log_decision(
    user_id: str,
    conversation_id: str,
    message_id: str,
    decision: str,
    agent_id: str | None,
    reasoning: str,
) -> None:
    """Write the orchestrator decision to the audit log (non-critical)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO orchestrator_decisions
                    (user_id, conversation_id, message_id, decision, agent_id, reasoning)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                user_id,
                conversation_id,
                message_id,
                decision,
                agent_id,
                reasoning,
            )
    except Exception as exc:
        log.warning('orchestrator_log_failed', error=str(exc))
