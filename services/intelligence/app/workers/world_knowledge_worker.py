import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.interest_matcher import WorldKnowledgeEngine

log = structlog.get_logger()

_engine = WorldKnowledgeEngine()


async def _process(job, token: str):
    user_id = job.data.get('userId')
    if user_id:
        await _engine.run_for_user(user_id)
    else:
        await _engine.run_for_all_users()
    return {'ok': True}


def create_world_knowledge_worker() -> Worker:
    return Worker('world.knowledge_check', _process, {'connection': redis_conn_opts()})
