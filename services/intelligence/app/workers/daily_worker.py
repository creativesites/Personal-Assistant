import asyncio
import structlog
from datetime import datetime, timedelta, timezone
from bullmq import Worker, Queue
from ..queue import redis_conn_opts
from ..services.proactive import ProactiveService
from ..services.health import RelationshipHealthService
from ..services.document_followups import DocumentFollowupService
from ..services.pricing_benchmarks import PricingBenchmarkService
from ..services.inventory_forecast import InventoryForecastService
from ..neural.reflection import ReflectionService
from ..neural.emotion import get_emotion_engine

log = structlog.get_logger()

_proactive = ProactiveService()
_health = RelationshipHealthService()
_document_followups = DocumentFollowupService()
_pricing_benchmarks = PricingBenchmarkService()
_inventory_forecast = InventoryForecastService()
_reflection = ReflectionService()

_proactive_queue     = Queue('proactive.generate_daily', {'connection': redis_conn_opts()})
_temporal_queue      = Queue('temporal.clock_check',     {'connection': redis_conn_opts()})
_world_queue         = Queue('world.knowledge_check',    {'connection': redis_conn_opts()})
_consolidation_queue = Queue('memory.consolidate',       {'connection': redis_conn_opts()})
_document_followup_queue = Queue('documents.check_followups', {'connection': redis_conn_opts()})
_pricing_benchmark_queue = Queue('documents.refresh_pricing_benchmarks', {'connection': redis_conn_opts()})
_inventory_forecast_queue = Queue('inventory.refresh_forecasts', {'connection': redis_conn_opts()})
_reflection_queue = Queue('reflection.generate_weekly', {'connection': redis_conn_opts()})
_emotion_reconsolidation_queue = Queue('emotion.reconsolidate', {'connection': redis_conn_opts()})


async def _process_proactive(job, token: str):
    user_id = job.data.get('userId')
    if user_id:
        await _proactive.generate_for_user(user_id)
    else:
        await _proactive.generate_for_all_users()
    return {'ok': True}


def create_proactive_worker() -> Worker:
    return Worker('proactive.generate_daily', _process_proactive, {'connection': redis_conn_opts()})


async def _process_document_followups(job, token: str):
    count = await _document_followups.generate_for_all_users()
    return {'ok': True, 'count': count}


def create_document_followup_worker() -> Worker:
    return Worker('documents.check_followups', _process_document_followups, {'connection': redis_conn_opts()})


async def _process_pricing_benchmarks(job, token: str):
    count = await _pricing_benchmarks.refresh_for_all_users()
    return {'ok': True, 'count': count}


def create_pricing_benchmark_worker() -> Worker:
    return Worker('documents.refresh_pricing_benchmarks', _process_pricing_benchmarks, {'connection': redis_conn_opts()})


async def _process_inventory_forecast(job, token: str):
    count = await _inventory_forecast.generate_for_all_users()
    return {'ok': True, 'count': count}


def create_inventory_forecast_worker() -> Worker:
    return Worker('inventory.refresh_forecasts', _process_inventory_forecast, {'connection': redis_conn_opts()})


async def _process_reflection(job, token: str):
    count = await _reflection.generate_for_all_users('weekly')
    return {'ok': True, 'count': count}


def create_reflection_worker() -> Worker:
    return Worker('reflection.generate_weekly', _process_reflection, {'connection': redis_conn_opts()})


async def _process_emotion_reconsolidation(job, token: str):
    count = await get_emotion_engine().reconsolidate()
    return {'ok': True, 'count': count}


def create_emotion_reconsolidation_worker() -> Worker:
    return Worker('emotion.reconsolidate', _process_emotion_reconsolidation, {'connection': redis_conn_opts()})


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


async def run_document_followup_scheduler() -> None:
    """Asyncio background task: check for expired quotations / overdue
    invoices once per day at 08:00 UTC (plan §15 Phase 3)."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('document_followup_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('document_followup_enqueue')
            await _document_followup_queue.add('check_followups', {})
        except Exception as exc:
            log.error('document_followup_enqueue_failed', error=str(exc))


async def run_pricing_benchmark_scheduler() -> None:
    """Asyncio background task: refresh pricing benchmarks (plan §9/§15
    Phase 4) once per day at 09:00 UTC — after document follow-ups (08:00),
    since neither depends on the other but spreading the daily jobs out
    keeps the DB from doing all of them in the same instant."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=9, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('pricing_benchmark_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('pricing_benchmark_enqueue')
            await _pricing_benchmark_queue.add('refresh', {})
        except Exception as exc:
            log.error('pricing_benchmark_enqueue_failed', error=str(exc))


async def run_inventory_forecast_scheduler() -> None:
    """Asyncio background task: refresh inventory forecasts (plan §7.3) once
    per day at 10:00 UTC — after pricing benchmarks (09:00), spreading the
    daily jobs out so the DB isn't hit by all of them at once."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=10, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('inventory_forecast_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('inventory_forecast_enqueue')
            await _inventory_forecast_queue.add('refresh', {})
        except Exception as exc:
            log.error('inventory_forecast_enqueue_failed', error=str(exc))


async def run_reflection_scheduler() -> None:
    """Asyncio background task: generate weekly reflection summaries (plan
    §4.7/§10 Phase 3) every Monday at 11:00 UTC — after inventory forecasts
    (10:00), same load-spreading convention as the other daily jobs. This is
    the first scheduler in this file with a day-of-week gate rather than a
    plain daily cadence."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=11, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        while target.weekday() != 0:  # Monday
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('reflection_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('reflection_enqueue')
            await _reflection_queue.add('generate', {})
        except Exception as exc:
            log.error('reflection_enqueue_failed', error=str(exc))


async def run_emotion_reconsolidation_scheduler() -> None:
    """Asyncio background task: nightly emotional-memory reconsolidation
    (Advisor Companion Plan §6.8) at 04:00 UTC — after consolidation's
    03:00, same load-spreading convention as every other daily job. This
    is platform-wide (Neural Layer, not Advisor-owned) even though it
    shipped as part of the Advisor Companion Plan's Phase 0, since Neural
    Layer Phase 1 left `emotional_signals.memory_weight` write-once."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=4, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('emotion_reconsolidation_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('emotion_reconsolidation_enqueue')
            await _emotion_reconsolidation_queue.add('reconsolidate', {})
        except Exception as exc:
            log.error('emotion_reconsolidation_enqueue_failed', error=str(exc))


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


async def run_consolidation_scheduler() -> None:
    """Asyncio background task: nightly memory consolidation at 03:00 UTC.

    Uses the same asyncio-loop pattern as the three schedulers above rather
    than BullMQ's native `repeat` option, which would be the more "real
    scheduling infra" choice in principle — but the Python BullMQ port has
    an open, unresolved bug where repeatable jobs fire once and never
    reschedule (taskforcesh/bullmq#2772). Shipping a nightly job on a
    mechanism that silently stops after one run is worse than the asyncio
    loop's known limitation (duplicate runs if this service scales to
    multiple replicas — same caveat as the other three loops already have).
    """
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=3, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('consolidation_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('consolidation_enqueue')
            await _consolidation_queue.add('consolidate', {})
        except Exception as exc:
            log.error('consolidation_enqueue_failed', error=str(exc))
