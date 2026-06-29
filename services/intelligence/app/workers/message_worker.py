import structlog
from bullmq import Worker, Queue
from ..database import get_pool
from ..queue import redis_conn_opts
from ..services.analyser import MessageAnalyser
from ..services.reply_gen import ReplyGenerator
from ..services.event_extractor import EventExtractor
from ..services.health import RelationshipHealthService
from ..services.cadence_learner import CadenceLearner
from ..services.orchestrator import route_message

log = structlog.get_logger()

_analyser = MessageAnalyser()
_reply_gen = ReplyGenerator()
_extractor = EventExtractor()
_health_svc = RelationshipHealthService()
_cadence = CadenceLearner()
_msg_counter: dict[str, int] = {}

_profile_queue = Queue('analysis.contact_profile', {'connection': redis_conn_opts()})
_voice_queue   = Queue('analysis.user_profile',    {'connection': redis_conn_opts()})
_agent_queue   = Queue('agent.handle_message',     {'connection': redis_conn_opts()})

_user_msg_counter: dict[str, int] = {}


async def _process(job, token: str):
    data = job.data
    message_id    = data.get('messageId')
    user_id       = data.get('userId')
    conversation_id = data.get('conversationId')
    contact_id    = data.get('contactId')
    sender_type   = data.get('senderType', 'contact')
    is_historical = data.get('isHistorical', False)

    log.info('processing_message', message_id=message_id, is_historical=is_historical)

    analysis = await _analyser.analyse(
        message_id=message_id,
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=contact_id,
    )

    await _extractor.extract_from_analysis(message_id, contact_id, user_id, analysis)

    # Historical messages: skip reply generation and agent routing entirely
    if not is_historical and sender_type == 'contact':
        pool = await get_pool()
        async with pool.acquire() as conn:
            msg = await conn.fetchrow('SELECT body FROM messages WHERE id = $1', message_id)
        body = msg['body'] if msg else ''

        if body:
            # Orchestrator decides: route to an agent OR generate a suggestion for the user
            decision, agent_id = await route_message(
                message_id=message_id,
                conversation_id=conversation_id,
                contact_id=contact_id,
                user_id=user_id,
                requires_response=analysis.requires_response,
            )

            if decision == 'route_to_agent' and agent_id:
                await _agent_queue.add(
                    'agent.handle_message',
                    {
                        'conversationId': conversation_id,
                        'messageId': message_id,
                        'agentId': agent_id,
                        'userId': user_id,
                    },
                )
                log.info('message_routed_to_agent', agent_id=agent_id, message_id=message_id)

            elif decision == 'generate_suggestion':
                await _reply_gen.generate(
                    message_id=message_id,
                    user_id=user_id,
                    contact_id=contact_id,
                    conversation_id=conversation_id,
                    body=body,
                    analysis=analysis,
                )

    # ── Relationship maintenance (batched for historical) ───────────────────

    key = f'{user_id}:{contact_id}'
    count = _msg_counter.get(key, 0) + 1
    _msg_counter[key] = count

    # Recalculate health — for historical, run every 20 messages to avoid overload
    health_interval = 20 if is_historical else 5
    if count % health_interval == 0:
        await _health_svc.recalculate(contact_id, user_id)

    # Update cadence model
    cadence_interval = 20 if is_historical else 5
    if count % cadence_interval == 0 or count == 1:
        await _cadence.learn(contact_id, user_id)

    # Trigger contact profile rebuild — more aggressive for historical to populate product fast
    profile_interval = 25 if is_historical else 10
    if count == 1 or count % profile_interval == 0:
        await _profile_queue.add('profile', {'contactId': contact_id, 'userId': user_id})

    # Trigger user voice profile rebuild on outbound messages
    if sender_type == 'user':
        ucount = _user_msg_counter.get(user_id, 0) + 1
        _user_msg_counter[user_id] = ucount
        voice_interval = 50 if is_historical else 20
        if ucount == 1 or ucount % voice_interval == 0:
            await _voice_queue.add('voice', {'userId': user_id})

    log.info(
        'message_processed',
        message_id=message_id,
        requires_response=analysis.requires_response,
        is_historical=is_historical,
    )
    return {'ok': True}


def create_message_worker() -> Worker:
    return Worker('messages.incoming', _process, {'connection': redis_conn_opts()})
