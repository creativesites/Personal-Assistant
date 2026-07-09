import asyncio
import structlog
from datetime import datetime, timedelta, timezone
from bullmq import Worker, Queue
from ..queue import redis_conn_opts
from ..services.proactive import ProactiveService
from ..services.health import RelationshipHealthService

log = structlog.get_logger()

_proactive = ProactiveService()
_health = RelationshipHealthService()

_proactive_queue = Queue('proactive.generate_daily', {'connection': redis_conn_opts()})
_temporal_queue  = Queue('temporal.clock_check',     {'connection': redis_conn_opts()})
_world_queue     = Queue('world.knowledge_check',    {'connection': redis_conn_opts()})


async def _process_proactive(job, token: str):
    user_id = job.data.get('userId')
    if user_id:
        await _proactive.generate_for_user(user_id)
    else:
        await _proactive.generate_for_all_users()
    return {'ok': True}


def create_proactive_worker() -> Worker:
    return Worker('proactive.generate_daily', _process_proactive, {'connection': redis_conn_opts()})


async def run_daily_scheduler() -> None:
    """Asyncio background task: run proactive generation once per day at 07:00 UTC."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=7, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('daily_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('daily_proactive_enqueue')
            await _proactive_queue.add('proactive', {})
        except Exception as exc:
            log.error('daily_proactive_enqueue_failed', error=str(exc))


async def run_temporal_scheduler() -> None:
    """Asyncio background task: evaluate relationship clocks every 15 minutes."""
    while True:
        await asyncio.sleep(900)  # 15 minutes
        try:
            log.info('temporal_clock_check_enqueue')
            await _temporal_queue.add('clock_check', {})
        except Exception as exc:
            log.error('temporal_clock_check_enqueue_failed', error=str(exc))


async def run_world_knowledge_scheduler() -> None:
    """Asyncio background task: refresh news and match to contact interests every 2 hours."""
    while True:
        await asyncio.sleep(7200)  # 2 hours
        try:
            log.info('world_knowledge_enqueue')
            await _world_queue.add('refresh', {})
        except Exception as exc:
            log.error('world_knowledge_enqueue_failed', error=str(exc))
