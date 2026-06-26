import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.profiler import ContactProfiler

log = structlog.get_logger()

_profiler = ContactProfiler()


async def _process(job, token: str):
    data = job.data
    contact_id = data.get('contactId')
    user_id = data.get('userId')

    log.info('profiling_contact', contact_id=contact_id)
    await _profiler.profile(contact_id=contact_id, user_id=user_id)
    return {'ok': True}


def create_profile_worker() -> Worker:
    return Worker('analysis.contact_profile', _process, {'connection': redis_conn_opts()})
