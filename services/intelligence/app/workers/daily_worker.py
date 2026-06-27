import asyncio
import structlog
from datetime import datetime, timedelta, timezone
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.proactive import ProactiveService
from ..services.health import RelationshipHealthService
from ..services.clock_engine import ClockEngine
from ..database import get_pool

log = structlog.get_logger()

_proactive = ProactiveService()
_health = RelationshipHealthService()
_clock_engine = ClockEngine()


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
            log.info('daily_proactive_run_start')
            await _proactive.generate_for_all_users()
            log.info('daily_proactive_run_done')
        except Exception as exc:
            log.error('daily_proactive_run_failed', error=str(exc))


async def run_temporal_scheduler() -> None:
    """Asyncio background task: evaluate relationship clocks every 15 minutes."""
    while True:
        await asyncio.sleep(900)  # 15 minutes
        try:
            log.info('temporal_clock_check_start')
            await _clock_engine.evaluate_all_users()
            log.info('temporal_clock_check_done')
        except Exception as exc:
            log.error('temporal_clock_check_failed', error=str(exc))
