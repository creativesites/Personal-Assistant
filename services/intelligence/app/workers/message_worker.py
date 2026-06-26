import structlog
from bullmq import Worker, Queue
from ..database import get_pool
from ..queue import redis_conn_opts
from ..services.analyser import MessageAnalyser
from ..services.reply_gen import ReplyGenerator
from ..services.event_extractor import EventExtractor
from ..services.health import RelationshipHealthService

log = structlog.get_logger()

_analyser = MessageAnalyser()
_reply_gen = ReplyGenerator()
_extractor = EventExtractor()
_health_svc = RelationshipHealthService()
_msg_counter: dict[str, int] = {}

_profile_queue = Queue('analysis.contact_profile', {'connection': redis_conn_opts()})


async def _process(job, token: str):
    data = job.data
    message_id = data.get('messageId')
    user_id = data.get('userId')
    conversation_id = data.get('conversationId')
    contact_id = data.get('contactId')

    log.info('processing_message', message_id=message_id)

    analysis = await _analyser.analyse(
        message_id=message_id,
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=contact_id,
    )

    # Extract calendar events from analysis
    await _extractor.extract_from_analysis(message_id, contact_id, user_id, analysis)

    if analysis.requires_response:
        pool = await get_pool()
        async with pool.acquire() as conn:
            msg = await conn.fetchrow('SELECT body FROM messages WHERE id = $1', message_id)
        body = msg['body'] if msg else ''
        if body:
            await _reply_gen.generate(
                message_id=message_id,
                user_id=user_id,
                contact_id=contact_id,
                conversation_id=conversation_id,
                body=body,
                analysis=analysis,
            )

    key = f'{user_id}:{contact_id}'
    count = _msg_counter.get(key, 0) + 1
    _msg_counter[key] = count

    # Recalculate health every 5 messages per contact
    if count % 5 == 0:
        await _health_svc.recalculate(contact_id, user_id)

    # Trigger contact profile rebuild: first message and every 10 thereafter
    if count == 1 or count % 10 == 0:
        await _profile_queue.add('profile', {'contactId': contact_id, 'userId': user_id})

    log.info('message_processed', message_id=message_id, requires_response=analysis.requires_response)
    return {'ok': True}


def create_message_worker() -> Worker:
    return Worker('messages.incoming', _process, {'connection': redis_conn_opts()})
