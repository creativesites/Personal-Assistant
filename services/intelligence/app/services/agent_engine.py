"""
Autonomous Agent Engine — Phase 8.

Handles autonomous conversation responses for configured agents.
Called by agent_worker when a new message arrives for an agent-assigned conversation.
"""

import json
import structlog
from ..ai.client import get_ai_client
from ..config import settings
from ..database import get_pool
from ..queue import get_queue

log = structlog.get_logger()

_ESCALATION_PROMPT = """\
You are a classifier. Analyse the following message and determine whether it warrants escalation to a human operator.

Escalation criteria:
1. frustration — message expresses anger, irritation, strong dissatisfaction, or repeated complaints
2. explicit_request — message contains a direct request to speak with a human, real person, manager, or agent
3. out_of_scope — message clearly falls outside the agent's domain described below

Agent domain / purpose:
{agent_description}

Message to classify:
\"\"\"{message_body}\"\"\"

Respond with a JSON object:
{{
  "should_escalate": true | false,
  "reason": "frustration" | "explicit_request" | "out_of_scope" | "",
  "explanation": "one-sentence explanation"
}}
"""

_AGENT_RESPONSE_PROMPT = """\
You are an AI assistant acting as {agent_name} ({agent_type}).

{system_prompt}

== Contact context ==
{contact_context}

== Knowledge base context ==
{kb_context}

== Conversation history (oldest first) ==
{conversation_history}

== Latest message ==
{latest_message}

Compose a single, natural reply. Be concise. Stay within your defined role.
Do not mention that you are an AI unless the contact asks directly.
Respond in the same language as the latest message.
"""


async def handle_agent_message(
    conversation_id: str,
    message_id: str,
    agent_id: str,
    user_id: str,
) -> dict:
    """
    Main entry point for the autonomous agent engine.

    Fetches agent config and conversation context, runs escalation checks,
    generates a reply via LiteLLM, and enqueues the send job when appropriate.

    Returns a dict with keys: action, message (optional), escalated, reason (optional).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        agent = await conn.fetchrow(
            """
            SELECT id, name, agent_type, description, system_prompt, trust_level,
                   can_send_links, can_share_pricing, can_book_meetings,
                   escalate_on_frustration, escalate_on_explicit_human_request,
                   escalate_on_out_of_scope
            FROM agents
            WHERE id = $1 AND user_id = $2 AND is_active = true
            """,
            agent_id,
            user_id,
        )
        if not agent:
            log.warning('agent_not_found_or_inactive', agent_id=agent_id, user_id=user_id)
            return {'action': 'skipped', 'reason': 'agent_not_found'}

        # Fetch recent messages (last 10, oldest first for context)
        recent_messages = await conn.fetch(
            """
            SELECT m.id, m.sender_type, m.body, m.whatsapp_timestamp
            FROM messages m
            WHERE m.conversation_id = $1 AND m.body IS NOT NULL
            ORDER BY m.whatsapp_timestamp DESC
            LIMIT 10
            """,
            conversation_id,
        )
        recent_messages = list(reversed(recent_messages))

        # Fetch the specific incoming message
        incoming = await conn.fetchrow(
            'SELECT body, sender_type FROM messages WHERE id = $1',
            message_id,
        )
        if not incoming:
            log.warning('agent_message_not_found', message_id=message_id)
            return {'action': 'skipped', 'reason': 'message_not_found'}

        # Fetch the conversation's contact
        conversation = await conn.fetchrow(
            'SELECT contact_id FROM conversations WHERE id = $1',
            conversation_id,
        )
        contact_id = conversation['contact_id'] if conversation else None

        # Fetch contact profile if available
        contact_profile = None
        contact_name = 'Contact'
        if contact_id:
            contact_row = await conn.fetchrow(
                "SELECT COALESCE(custom_name, display_name, phone_number, 'Unknown') AS name"
                ' FROM contacts WHERE id = $1',
                contact_id,
            )
            if contact_row:
                contact_name = contact_row['name']

            contact_profile = await conn.fetchrow(
                'SELECT personality_summary, current_life_context, communication_style'
                ' FROM contact_profiles WHERE contact_id = $1 AND user_id = $2',
                contact_id,
                user_id,
            )

        # Count messages sent today to respect max_messages_per_day
        today_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM agent_actions
            WHERE agent_id = $1
              AND action_type = 'send_message'
              AND created_at >= NOW() - INTERVAL '1 day'
            """,
            agent_id,
        )

    trust_level = agent['trust_level']
    message_body = incoming['body'] or ''

    # Observe-only: log and exit without responding
    if trust_level == 'observe':
        log.info('agent_observe_mode', agent_id=agent_id, message_id=message_id)
        return {'action': 'observed', 'escalated': False}

    # Respect daily send cap
    if today_count >= agent['max_messages_per_day']:
        log.info(
            'agent_daily_limit_reached',
            agent_id=agent_id,
            count=int(today_count),
        )
        return {'action': 'skipped', 'reason': 'daily_limit_reached'}

    # Escalation check
    should_escalate, escalation_reason = await check_escalation_triggers(
        message_body=message_body,
        agent=dict(agent),
    )

    if should_escalate:
        async with pool.acquire() as conn:
            # Resolve contact_id for escalation row
            if not contact_id:
                conv_row = await conn.fetchrow(
                    'SELECT contact_id FROM conversations WHERE id = $1', conversation_id
                )
                contact_id = conv_row['contact_id'] if conv_row else None

            await conn.execute(
                """
                INSERT INTO escalations (agent_id, conversation_id, contact_id, reason, urgency)
                VALUES ($1, $2, $3, $4, $5)
                """,
                agent_id,
                conversation_id,
                contact_id,
                escalation_reason,
                'high' if escalation_reason == 'frustration' else 'normal',
            )

            await conn.execute(
                """
                INSERT INTO agent_actions
                    (agent_id, conversation_id, contact_id, action_type, input_message,
                     output_message, reasoning, was_escalated, escalation_reason)
                VALUES ($1, $2, $3, 'escalate', $4, NULL, $5, true, $6)
                """,
                agent_id,
                conversation_id,
                contact_id,
                message_body,
                f'Escalated due to: {escalation_reason}',
                escalation_reason,
            )

        log.info(
            'agent_escalated',
            agent_id=agent_id,
            conversation_id=conversation_id,
            reason=escalation_reason,
        )
        return {'action': 'escalated', 'escalated': True, 'reason': escalation_reason}

    # Retrieve KB context
    from .knowledge_retriever import retrieve_relevant_chunks
    kb_chunks = await retrieve_relevant_chunks(
        user_id=user_id,
        agent_id=agent_id,
        query=message_body,
        limit=5,
    )

    # Build prompt components
    contact_context_parts = []
    if contact_profile:
        if contact_profile['personality_summary']:
            contact_context_parts.append(f"Personality: {contact_profile['personality_summary']}")
        if contact_profile['current_life_context']:
            contact_context_parts.append(f"Life context: {contact_profile['current_life_context']}")
        if contact_profile['communication_style']:
            contact_context_parts.append(f"Communication style: {contact_profile['communication_style']}")
    contact_context = '\n'.join(contact_context_parts) if contact_context_parts else f'Name: {contact_name}'

    kb_context = (
        '\n\n'.join(f"[KB] {c['content']}" for c in kb_chunks)
        if kb_chunks
        else '(no knowledge base context available)'
    )

    history_lines = [
        f"[{msg['sender_type']}]: {msg['body']}"
        for msg in recent_messages
        if msg['id'] != message_id
    ]
    conversation_history = '\n'.join(history_lines) or '(start of conversation)'

    agent_system_prompt = agent['system_prompt'] or f"You are a helpful {agent['agent_type']} assistant."

    prompt = _AGENT_RESPONSE_PROMPT.format(
        agent_name=agent['name'],
        agent_type=agent['agent_type'],
        system_prompt=agent_system_prompt,
        contact_context=contact_context,
        kb_context=kb_context,
        conversation_history=conversation_history,
        latest_message=message_body,
    )

    client = get_ai_client()
    reply_text = await client.complete_text([{'role': 'user', 'content': prompt}])
    reply_text = reply_text.strip()

    if not contact_id:
        async with pool.acquire() as conn:
            conv_row = await conn.fetchrow(
                'SELECT contact_id FROM conversations WHERE id = $1', conversation_id
            )
            contact_id = conv_row['contact_id'] if conv_row else None

    # Record the agent action
    async with pool.acquire() as conn:
        action_id = await conn.fetchval(
            """
            INSERT INTO agent_actions
                (agent_id, conversation_id, contact_id, action_type,
                 input_message, output_message, reasoning, was_escalated)
            VALUES ($1, $2, $3, 'send_message', $4, $5, $6, false)
            RETURNING id
            """,
            agent_id,
            conversation_id,
            contact_id,
            message_body,
            reply_text,
            f'KB chunks used: {len(kb_chunks)}. Trust level: {trust_level}.',
        )

    log.info(
        'agent_reply_generated',
        agent_id=agent_id,
        action_id=str(action_id),
        trust_level=trust_level,
        message_length=len(reply_text),
    )

    # Enqueue send job for autonomous and delegated trust levels
    if trust_level in ('autonomous', 'delegated'):
        send_queue = get_queue('messages.send')
        await send_queue.add(
            'send',
            {
                'conversationId': conversation_id,
                'contactId': contact_id,
                'userId': user_id,
                'body': reply_text,
                'agentActionId': str(action_id),
            },
        )
        log.info(
            'agent_send_job_enqueued',
            agent_id=agent_id,
            conversation_id=conversation_id,
            trust_level=trust_level,
        )

    return {
        'action': 'responded',
        'message': reply_text,
        'escalated': False,
    }


async def check_escalation_triggers(
    message_body: str,
    agent: dict,
) -> tuple[bool, str]:
    """
    Use LiteLLM to classify whether the message warrants escalation.

    Checks for: frustration, explicit human request, or out-of-scope topic.
    Returns (should_escalate, reason) where reason is one of:
    'frustration', 'explicit_request', 'out_of_scope', or ''.
    """
    # Skip check if all escalation triggers are disabled
    if not (
        agent.get('escalate_on_frustration')
        or agent.get('escalate_on_explicit_human_request')
        or agent.get('escalate_on_out_of_scope')
    ):
        return False, ''

    agent_description = agent.get('description') or agent.get('agent_type', 'general assistant')

    prompt = _ESCALATION_PROMPT.format(
        agent_description=agent_description,
        message_body=message_body[:1000],
    )

    client = get_ai_client()
    try:
        raw = await client.complete_json([{'role': 'user', 'content': prompt}])
        should_escalate = bool(raw.get('should_escalate', False))
        reason = str(raw.get('reason', ''))

        # Honour per-agent escalation settings
        if reason == 'frustration' and not agent.get('escalate_on_frustration'):
            should_escalate = False
        elif reason == 'explicit_request' and not agent.get('escalate_on_explicit_human_request'):
            should_escalate = False
        elif reason == 'out_of_scope' and not agent.get('escalate_on_out_of_scope'):
            should_escalate = False

        if not should_escalate:
            reason = ''

        log.debug(
            'escalation_check',
            should_escalate=should_escalate,
            reason=reason,
        )
        return should_escalate, reason

    except Exception as exc:
        log.warning('escalation_check_failed', error=str(exc))
        # Fail safe: don't escalate on classifier error
        return False, ''
