import structlog
from bullmq import Worker

from ..queue import redis_conn_opts
from ..reply.engine import COMPOSE_QUEUE, run_compose

log = structlog.get_logger()


async def _process(job, token: str):
    d = job.data
    result = await run_compose(
        d['userId'], d['conversationId'], trigger_message_id=d.get('messageId'), mode='live',
    )
    log.info('reply_compose_done', conversation_id=d['conversationId'], message_id=d.get('messageId'),
             skipped=result.get('skipped'), options=len(result.get('options') or []),
             needs_owner=result.get('needsOwner'), auto_send=result.get('autoSend'), rejected=result.get('rejected'))
    return {k: v for k, v in result.items() if k in ('skipped', 'autoSend', 'needsOwner')}


def create_compose_worker() -> Worker:
    return Worker(COMPOSE_QUEUE, _process, {'connection': redis_conn_opts(), 'concurrency': 3})
