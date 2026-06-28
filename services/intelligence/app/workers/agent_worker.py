import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.agent_engine import handle_agent_message
from ..services.knowledge_retriever import process_document

log = structlog.get_logger()


async def _process(job, token: str):
    job_name: str = job.name
    data: dict = job.data

    if job_name == 'agent.handle_message':
        conversation_id = data.get('conversationId')
        message_id = data.get('messageId')
        agent_id = data.get('agentId')
        user_id = data.get('userId')

        if not all([conversation_id, message_id, agent_id, user_id]):
            log.warning(
                'agent_handle_message_missing_fields',
                conversation_id=conversation_id,
                message_id=message_id,
                agent_id=agent_id,
                user_id=user_id,
            )
            return {'ok': False, 'error': 'missing_required_fields'}

        log.info(
            'agent_handle_message_start',
            conversation_id=conversation_id,
            message_id=message_id,
            agent_id=agent_id,
        )
        result = await handle_agent_message(
            conversation_id=conversation_id,
            message_id=message_id,
            agent_id=agent_id,
            user_id=user_id,
        )
        log.info(
            'agent_handle_message_done',
            conversation_id=conversation_id,
            action=result.get('action'),
        )
        return result

    elif job_name == 'kb.process_document':
        document_id = data.get('documentId')
        user_id = data.get('userId')

        if not all([document_id, user_id]):
            log.warning(
                'kb_process_document_missing_fields',
                document_id=document_id,
                user_id=user_id,
            )
            return {'ok': False, 'error': 'missing_required_fields'}

        log.info('kb_process_document_start', document_id=document_id)
        await process_document(document_id=document_id, user_id=user_id)
        log.info('kb_process_document_done', document_id=document_id)
        return {'ok': True}

    else:
        log.warning('agent_worker_unknown_job', job_name=job_name)
        return {'ok': False, 'error': f'unknown_job_type: {job_name}'}


def create_agent_worker() -> Worker:
    """
    Returns a BullMQ Worker that listens on the 'agent.handle_message' queue.

    Both 'agent.handle_message' and 'kb.process_document' jobs are routed
    through the same worker process function — BullMQ dispatches by job.name.
    The worker listens on the primary queue name; the kb jobs share the same
    Redis connection pool.
    """
    return Worker('agent.handle_message', _process, {'connection': redis_conn_opts()})


def create_kb_worker() -> Worker:
    """
    Returns a BullMQ Worker dedicated to the 'kb.process_document' queue.

    Document processing can be CPU/network-heavy (URL fetching + embedding),
    so it runs in its own worker to avoid blocking agent message handling.
    """
    return Worker('kb.process_document', _process, {'connection': redis_conn_opts()})
