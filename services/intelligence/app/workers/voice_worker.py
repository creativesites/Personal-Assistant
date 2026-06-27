import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.voice_builder import UserVoiceBuilder

log = structlog.get_logger()

_builder = UserVoiceBuilder()


async def _process(job, token: str):
    user_id = job.data.get('userId')
    log.info('building_voice_profile', user_id=user_id)
    await _builder.build(user_id)
    return {'ok': True}


def create_voice_worker() -> Worker:
    return Worker('analysis.user_profile', _process, {'connection': redis_conn_opts()})
