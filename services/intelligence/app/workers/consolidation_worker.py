import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.consolidation import ConsolidationService

log = structlog.get_logger()

_consolidation = ConsolidationService()


async def _process(job, token: str):
    result = await _consolidation.run()
    return {'ok': True, **result}


def create_consolidation_worker() -> Worker:
    return Worker('memory.consolidate', _process, {'connection': redis_conn_opts()})
