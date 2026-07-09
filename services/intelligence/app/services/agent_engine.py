"""
Autonomous Agent Engine — Phase 8.

Handles autonomous conversation responses for configured agents.
Called by agent_worker when a new message arrives for an agent-assigned conversation.
"""

import structlog
from ..ai.client import get_ai_client
from ..config import settings
from ..database import get_pool
from ..memory import retrieval_service as memory
from ..models import AgentMemoryCandidate
from ..queue import get_queue
from .agent_memory import AgentMemoryService

log = structlog.get_logger()
_agent_memory = AgentMemoryService()


def _format_agent_memories(memories: list[dict]) -> str:
    lines = []
    for m in memories:
        if m['memory_type'] == 'experience':
            outcome_note = ' (worked)' if m['worked'] else (' (did not work)' if m['worked'] is False else '')
            lines.append(
                f"- Situation: {m['situation']} | Did: {m['action_taken']} | Outcome: {m['outcome']}{outcome_note}"
            )
        else:
            lines.append(f"- {m['memory_key']}: {m['memory_value']}")
    return '\n'.join(lines)

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

== What you remember from past interactions ==
{agent_memory_context}

== Conversation history (oldest first) ==
{conversation_history}

== Latest message ==
{latest_message}

== Available tools ==
You may optionally call one or more tools alongside your reply:
{available_tools}

Compose a single, natural reply and optionally call tools. Be concise. Stay within your defined role.
Do not mention that you are an AI unless the contact asks directly.
Respond in the same language as the latest message.
Use what you remember from past interactions where relevant, but don't mention that you have "memory" explicitly.

Respond ONLY with a JSON object — no markdown, no extra text:
{{
  "reply": "your reply text here",
  "confidence": 0.0-1.0,
  "tools": [
    {{"name": "tool_name", "params": {{"key": "value"}}}}
  ],
  "reasoning": "one sentence explaining your reply",
  "memories": [
    {{"memory_type": "fact", "scope": "contact", "key": "snake_case_key", "value": "what you learned"}},
    {{"memory_type": "experience", "scope": "contact", "situation": "what was happening",
      "action_taken": "what you did", "outcome": "what resulted", "worked": true}}
  ]
}}

If no tools are needed, set "tools" to []. Only include "memories" entries for things genuinely worth
remembering for future interactions (a preference, a negotiation pattern, an objection and how it was
handled, a promise made) — most replies won't produce any. Use scope "general" only for something true
of your role broadly, not specific to this one contact.
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
            SELECT id, name, agent_type, role_title, description, system_prompt, trust_level,
                   tone, goals, capabilities,
                   can_send_links, can_share_pricing, can_book_meetings,
                   escalate_on_frustration, escalate_on_explicit_human_request,
                   escalate_on_out_of_scope, max_messages_per_day
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

    # Contact summary, KB chunks, Business Memory, Agent Memory, and Relationship
    # Memory all go through the shared retrieval service (memory/retrieval_service.py)
    # instead of each being fetched ad-hoc here.
    contact_name = 'Contact'
    contact_profile = None
    rel_mem_text = ''
    if contact_id:
        contact_summary_data = await memory.get_contact_summary(user_id, contact_id)
        contact_name = contact_summary_data['contact_name']
        contact_profile = contact_summary_data
        rel_mem_text = memory.format_relationship_memory(
            await memory.get_relationship_memory(user_id, contact_id)
        )

    kb_chunks = await memory.get_kb_chunks(user_id, message_body, agent_id=agent_id, limit=5)
    business_facts = await memory.get_business_facts(user_id)
    agent_memories = await _agent_memory.retrieve(agent_id, contact_id, message_body, limit=5)

    # Build prompt components
    contact_context_parts = []
    if contact_profile:
        if contact_profile['personality_summary']:
            contact_context_parts.append(f"Personality: {contact_profile['personality_summary']}")
        if contact_profile['current_life_context']:
            contact_context_parts.append(f"Life context: {contact_profile['current_life_context']}")
        if contact_profile['communication_style']:
            contact_context_parts.append(f"Communication style: {contact_profile['communication_style']}")
    if rel_mem_text:
        contact_context_parts.append(f'Relationship memory:\n{rel_mem_text}')
    contact_context = '\n'.join(contact_context_parts) if contact_context_parts else f'Name: {contact_name}'

    kb_context = (
        '\n\n'.join(f"[KB] {c['content']}" for c in kb_chunks)
        if kb_chunks
        else '(no knowledge base context available)'
    )
    facts_text = memory.format_business_facts(business_facts)
    if facts_text:
        kb_context = f'{kb_context}\n\n{facts_text}'

    agent_memory_context = _format_agent_memories(agent_memories) or '(nothing remembered yet)'

    history_lines = [
        f"[{msg['sender_type']}]: {msg['body']}"
        for msg in recent_messages
        if msg['id'] != message_id
    ]
    conversation_history = '\n'.join(history_lines) or '(start of conversation)'

    agent_system_prompt = agent['system_prompt'] or f"You are a helpful {agent['agent_type']} assistant."

    # Build tool list based on agent capabilities
    capabilities = agent['capabilities'] or {}
    available_tools = _build_tool_list(capabilities, agent)

    prompt = _AGENT_RESPONSE_PROMPT.format(
        agent_name=agent['name'],
        agent_type=agent['agent_type'],
        system_prompt=agent_system_prompt,
        contact_context=contact_context,
        kb_context=kb_context,
        agent_memory_context=agent_memory_context,
        conversation_history=conversation_history,
        latest_message=message_body,
        available_tools=available_tools,
    )

    if not contact_id:
        async with pool.acquire() as conn:
            conv_row = await conn.fetchrow(
                'SELECT contact_id FROM conversations WHERE id = $1', conversation_id
            )
            contact_id = conv_row['contact_id'] if conv_row else None

    client = get_ai_client()
    try:
        reply_data = await client.complete_json([{'role': 'user', 'content': prompt}])
        reply_text = str(reply_data.get('reply', '')).strip()
        confidence = float(reply_data.get('confidence', 0.8))
        tools_to_run = reply_data.get('tools', []) or []
        reasoning = str(reply_data.get('reasoning', ''))
        memories_raw = reply_data.get('memories', []) or []
    except Exception as exc:
        log.warning('agent_json_parse_failed', error=str(exc), agent_id=agent_id)
        # Fallback to plain text generation
        reply_text = await client.complete_text([{'role': 'user', 'content': prompt}])
        reply_text = reply_text.strip()
        confidence = 0.7
        tools_to_run = []
        reasoning = 'fallback plain text generation'
        memories_raw = []

    memory_candidates: list[AgentMemoryCandidate] = []
    for raw in memories_raw:
        try:
            memory_candidates.append(AgentMemoryCandidate(**raw))
        except Exception as exc:
            log.warning('agent_memory_candidate_invalid', error=str(exc), agent_id=agent_id)

    if not reply_text:
        log.warning('agent_empty_reply', agent_id=agent_id)
        return {'action': 'skipped', 'reason': 'empty_reply'}

    # Execute tools (non-blocking — tool failures don't abort the reply)
    executed_tools = []
    for tool_call in tools_to_run:
        tool_name = tool_call.get('name', '')
        tool_params = tool_call.get('params', {})
        result = await execute_tool(
            tool_name=tool_name,
            params=tool_params,
            contact_id=contact_id,
            user_id=user_id,
            conversation_id=conversation_id,
        )
        executed_tools.append({'name': tool_name, 'params': tool_params, 'result': result})
        log.info('agent_tool_executed', tool=tool_name, result=result, agent_id=agent_id)

    # Record the agent action
    async with pool.acquire() as conn:
        action_id = await conn.fetchval(
            """
            INSERT INTO agent_actions
                (agent_id, conversation_id, contact_id, action_type,
                 input_message, output_message, reasoning, was_escalated,
                 confidence, tools_used)
            VALUES ($1, $2, $3, 'send_message', $4, $5, $6, false, $7, $8)
            RETURNING id
            """,
            agent_id,
            conversation_id,
            contact_id,
            message_body,
            reply_text,
            reasoning or f'KB chunks: {len(kb_chunks)}. Trust: {trust_level}.',
            confidence,
            executed_tools,
        )

    if memory_candidates:
        await _agent_memory.record_candidates(agent_id, user_id, contact_id, str(action_id), memory_candidates)

    log.info(
        'agent_reply_generated',
        agent_id=agent_id,
        action_id=str(action_id),
        trust_level=trust_level,
        confidence=confidence,
        tools_executed=len(executed_tools),
        message_length=len(reply_text),
    )

    # Enqueue send job for autonomous and delegated trust levels
    if trust_level in ('autonomous', 'delegated'):
        async with pool.acquire() as conn:
            contact_row = await conn.fetchrow(
                'SELECT whatsapp_jid FROM contacts WHERE id = $1', contact_id,
            )
        recipient_jid = contact_row['whatsapp_jid'] if contact_row else None
        if not recipient_jid:
            log.warning(
                'agent_send_skipped_no_jid',
                agent_id=agent_id,
                contact_id=contact_id,
                action_id=str(action_id),
            )
        else:
            send_queue = get_queue('send.reply')
            await send_queue.add(
                'send',
                {
                    'userId': user_id,
                    'messageId': message_id,
                    'suggestedReplyId': None,
                    'recipientJid': recipient_jid,
                    'text': reply_text,
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
        'confidence': confidence,
        'tools_executed': len(executed_tools),
        'escalated': False,
    }


def _build_tool_list(capabilities: dict, agent: dict) -> str:
    """Build a human-readable list of tools the agent may call based on capabilities."""
    tools = []

    # Core CRM tools — always available
    tools.append('- update_contact_status(status: "contact"|"lead"|"customer"|"churned") — change CRM status')
    tools.append('- update_pipeline_stage(stage: string) — move contact to a pipeline stage')
    tools.append('- update_lead_score(score: 0-100) — update the lead score')
    tools.append('- add_note(text: string) — append a CRM note to the contact record')
    tools.append('- create_task(title: string, description: string, due_date: "YYYY-MM-DD") — create a follow-up task')
    tools.append('- schedule_followup(title: string, body: string, days_from_now: 1-30) — schedule a proactive follow-up suggestion')

    if not tools:
        return '(no tools available)'
    return '\n'.join(tools)


async def execute_tool(
    tool_name: str,
    params: dict,
    contact_id: str | None,
    user_id: str,
    conversation_id: str,
) -> str:
    """Execute a single tool call server-side. Returns a status string."""
    if not contact_id:
        return 'skipped: no contact_id'

    pool = await get_pool()
    try:
        if tool_name == 'update_contact_status':
            status = params.get('status', '')
            valid = ('contact', 'lead', 'customer', 'churned')
            if status not in valid:
                return f'error: invalid status "{status}"'
            async with pool.acquire() as conn:
                await conn.execute(
                    'UPDATE contacts SET customer_status = $1 WHERE id = $2 AND user_id = $3',
                    status, contact_id, user_id,
                )
            return f'ok: status → {status}'

        elif tool_name == 'update_pipeline_stage':
            stage = str(params.get('stage', '')).strip()
            if not stage:
                return 'error: missing stage'
            async with pool.acquire() as conn:
                await conn.execute(
                    'UPDATE contacts SET pipeline_stage = $1 WHERE id = $2 AND user_id = $3',
                    stage, contact_id, user_id,
                )
            return f'ok: pipeline_stage → {stage}'

        elif tool_name == 'update_lead_score':
            try:
                score = max(0, min(100, int(params.get('score', 0))))
            except (TypeError, ValueError):
                return 'error: score must be 0-100'
            async with pool.acquire() as conn:
                await conn.execute(
                    'UPDATE contacts SET lead_score = $1 WHERE id = $2 AND user_id = $3',
                    score, contact_id, user_id,
                )
            return f'ok: lead_score → {score}'

        elif tool_name == 'add_note':
            text = str(params.get('text', '')).strip()
            if not text:
                return 'error: empty note'
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE contacts
                    SET notes = CASE
                        WHEN notes IS NULL OR notes = '' THEN $1
                        ELSE notes || E'\n\n' || $1
                    END
                    WHERE id = $2 AND user_id = $3
                    """,
                    text, contact_id, user_id,
                )
            return 'ok: note appended'

        elif tool_name == 'create_task':
            title = str(params.get('title', '')).strip()
            description = str(params.get('description', '')).strip() or None
            due_date_raw = params.get('due_date')
            if not title:
                return 'error: missing title'
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO contact_tasks
                        (user_id, contact_id, title, description, due_date, created_by)
                    VALUES ($1, $2, $3, $4, $5::date, 'ai')
                    """,
                    user_id, contact_id, title, description, due_date_raw,
                )
            return f'ok: task created "{title}"'

        elif tool_name == 'schedule_followup':
            title = str(params.get('title', '')).strip()
            body = str(params.get('body', '')).strip()
            try:
                days = max(1, min(30, int(params.get('days_from_now', 1))))
            except (TypeError, ValueError):
                days = 1
            if not title:
                return 'error: missing title'
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO proactive_queue
                        (user_id, contact_id, suggestion_type, title, body,
                         priority, status, suggested_for_date)
                    VALUES ($1, $2, 'agent_followup', $3, $4, 5, 'pending',
                            CURRENT_DATE + $5 * INTERVAL '1 day')
                    """,
                    user_id, contact_id, title, body, days,
                )
            return f'ok: followup scheduled in {days} day(s)'

        else:
            return f'error: unknown tool "{tool_name}"'

    except Exception as exc:
        log.warning('tool_execution_failed', tool=tool_name, error=str(exc))
        return f'error: {exc}'


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
