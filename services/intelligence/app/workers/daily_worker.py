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
from ..services.gossip_detector import get_gossip_detector
from ..services.interest_companion import get_interest_companion
from ..services.spiritual_companion import get_spiritual_companion
from ..services.motivational_detector import get_motivational_detector
from ..services.advisor_memory_learner import get_advisor_memory_learner
from ..services.curiosity_engine import get_curiosity_engine
from ..services.project_progress import ProjectProgressService
from ..services.business_manager import BusinessManagerService
from ..services.reality_engine import RealityEngineService

log = structlog.get_logger()

_proactive = ProactiveService()
_health = RelationshipHealthService()
_document_followups = DocumentFollowupService()
_pricing_benchmarks = PricingBenchmarkService()
_inventory_forecast = InventoryForecastService()
_reflection = ReflectionService()
_project_progress = ProjectProgressService()
_business_manager = BusinessManagerService()
_reality_engine = RealityEngineService()

_proactive_queue     = Queue('proactive.generate_daily', {'connection': redis_conn_opts()})
_temporal_queue      = Queue('temporal.clock_check',     {'connection': redis_conn_opts()})
_world_queue         = Queue('world.knowledge_check',    {'connection': redis_conn_opts()})
_consolidation_queue = Queue('memory.consolidate',       {'connection': redis_conn_opts()})
_document_followup_queue = Queue('documents.check_followups', {'connection': redis_conn_opts()})
_pricing_benchmark_queue = Queue('documents.refresh_pricing_benchmarks', {'connection': redis_conn_opts()})
_inventory_forecast_queue = Queue('inventory.refresh_forecasts', {'connection': redis_conn_opts()})
_reflection_queue = Queue('reflection.generate_weekly', {'connection': redis_conn_opts()})
_emotion_reconsolidation_queue = Queue('emotion.reconsolidate', {'connection': redis_conn_opts()})
_gossip_detection_queue = Queue('companion.detect_gossip', {'connection': redis_conn_opts()})
_interest_cron_queue = Queue('companion.run_interest_cron', {'connection': redis_conn_opts()})
_spiritual_devotional_queue = Queue('companion.send_devotionals', {'connection': redis_conn_opts()})
_motivational_nudge_queue = Queue('companion.check_motivational', {'connection': redis_conn_opts()})
_advisor_memory_learning_queue = Queue('advisor.learn_memories', {'connection': redis_conn_opts()})
_curiosity_proactive_queue = Queue('curiosity.ask_proactively', {'connection': redis_conn_opts()})
_project_progress_queue = Queue('project.check_progress', {'connection': redis_conn_opts()})
_business_manager_queue = Queue('business.check_manager_nudges', {'connection': redis_conn_opts()})
_reality_engine_hourly_queue = Queue('reality.hourly_sweep', {'connection': redis_conn_opts()})
_reality_engine_daily_queue = Queue('reality.daily_sweep', {'connection': redis_conn_opts()})


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


async def _process_gossip_detection(job, token: str):
    count = await get_gossip_detector().detect_for_all_users()
    return {'ok': True, 'count': count}


def create_gossip_detection_worker() -> Worker:
    return Worker('companion.detect_gossip', _process_gossip_detection, {'connection': redis_conn_opts()})


async def run_gossip_detection_scheduler() -> None:
    """Advisor Companion Plan Phase 4.5 (§6.9): daily gossip-signal
    aggregation at 12:00 UTC — after reflection's Monday-only 11:00 slot,
    same load-spreading convention as every other daily job."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=12, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('gossip_detection_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('gossip_detection_enqueue')
            await _gossip_detection_queue.add('detect', {})
        except Exception as exc:
            log.error('gossip_detection_enqueue_failed', error=str(exc))


async def _process_interest_cron(job, token: str):
    count = await get_interest_companion().run_for_all_users()
    return {'ok': True, 'count': count}


def create_interest_cron_worker() -> Worker:
    return Worker('companion.run_interest_cron', _process_interest_cron, {'connection': redis_conn_opts()})


async def run_interest_cron_scheduler() -> None:
    """Advisor Companion Plan Phase 4.5 (§3.8/§6.10): every 6 hours, per
    §11's recommended default. Simplification vs. the plan's "user's own
    timezone" wording — no per-user timezone-offset scheduling exists
    anywhere else in this file either, so this runs on a single fixed UTC
    cadence like every other cron here."""
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            log.info('interest_cron_enqueue')
            await _interest_cron_queue.add('run', {})
        except Exception as exc:
            log.error('interest_cron_enqueue_failed', error=str(exc))


async def _process_spiritual_devotionals(job, token: str):
    count = await get_spiritual_companion().run_for_all_users()
    return {'ok': True, 'count': count}


def create_spiritual_devotional_worker() -> Worker:
    return Worker('companion.send_devotionals', _process_spiritual_devotionals, {'connection': redis_conn_opts()})


async def run_spiritual_devotional_scheduler() -> None:
    """Advisor Companion Plan Phase 4.5 (§3.9/§6.11): daily devotional at
    13:00 UTC — after the gossip detector (12:00). Simplification vs. the
    plan's "user-configured time" — no per-user scheduling infra exists
    yet; every opted-in user gets it at the same fixed UTC hour for now."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=13, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('spiritual_devotional_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('spiritual_devotional_enqueue')
            await _spiritual_devotional_queue.add('send', {})
        except Exception as exc:
            log.error('spiritual_devotional_enqueue_failed', error=str(exc))


async def _process_motivational_check(job, token: str):
    count = await get_motivational_detector().run_for_all_users()
    return {'ok': True, 'count': count}


def create_motivational_nudge_worker() -> Worker:
    return Worker('companion.check_motivational', _process_motivational_check, {'connection': redis_conn_opts()})


async def run_motivational_nudge_scheduler() -> None:
    """Advisor Companion Plan Phase 4.5 (§3.10/§6.12): daily at 14:00 UTC —
    after the devotional (13:00), same load-spreading convention."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=14, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('motivational_nudge_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('motivational_nudge_enqueue')
            await _motivational_nudge_queue.add('check', {})
        except Exception as exc:
            log.error('motivational_nudge_enqueue_failed', error=str(exc))


async def _process_advisor_memory_learning(job, token: str):
    count = await get_advisor_memory_learner().run_for_all_users()
    return {'ok': True, 'count': count}


def create_advisor_memory_learning_worker() -> Worker:
    return Worker('advisor.learn_memories', _process_advisor_memory_learning, {'connection': redis_conn_opts()})


async def run_advisor_memory_learning_scheduler() -> None:
    """Advisor Companion Plan Phase 5 (§6.5/§9): nightly at 15:00 UTC —
    after the motivational nudge check (14:00), same load-spreading
    convention as every other daily job in this file."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=15, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('advisor_memory_learning_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('advisor_memory_learning_enqueue')
            await _advisor_memory_learning_queue.add('learn', {})
        except Exception as exc:
            log.error('advisor_memory_learning_enqueue_failed', error=str(exc))


async def _process_curiosity_proactive(job, token: str):
    count = await get_curiosity_engine().run_proactive_for_all_users()
    return {'ok': True, 'count': count}


def create_curiosity_proactive_worker() -> Worker:
    return Worker('curiosity.ask_proactively', _process_curiosity_proactive, {'connection': redis_conn_opts()})


async def run_curiosity_proactive_scheduler() -> None:
    """Zuri Curiosity Layer: daily at 16:00 UTC — after the advisor
    memory learner (15:00). The "randomly ask about something" feel comes
    from a per-user probability roll inside run_proactive_for_all_users()
    itself, not from this scheduler's cadence — every opted-in user is
    checked daily, but only a fraction actually get asked on any given day."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=16, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('curiosity_proactive_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('curiosity_proactive_enqueue')
            await _curiosity_proactive_queue.add('ask', {})
        except Exception as exc:
            log.error('curiosity_proactive_enqueue_failed', error=str(exc))


async def _process_project_progress(job, token: str):
    count = await _project_progress.generate_for_all_users()
    return {'ok': True, 'count': count}


def create_project_progress_worker() -> Worker:
    return Worker('project.check_progress', _process_project_progress, {'connection': redis_conn_opts()})


async def run_project_progress_scheduler() -> None:
    """Project Management Phase 1 (docs/SERVICES_PROJECTS_PLAN.md §11.7):
    daily at 17:00 UTC — the next free slot after the curiosity layer's
    proactive check (16:00)."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=17, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('project_progress_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('project_progress_enqueue')
            await _project_progress_queue.add('check_progress', {})
        except Exception as exc:
            log.error('project_progress_enqueue_failed', error=str(exc))


async def _process_business_manager(job, token: str):
    count = await _business_manager.generate_for_all_users()
    return {'ok': True, 'count': count}


def create_business_manager_worker() -> Worker:
    return Worker('business.check_manager_nudges', _process_business_manager, {'connection': redis_conn_opts()})


async def run_business_manager_scheduler() -> None:
    """Business Manager Assistant (docs/BUSINESS_EVENTS_PLAN.md Part E):
    daily at 18:00 UTC — the next free slot after Project Management's
    17:00 progress check."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=18, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('business_manager_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('business_manager_enqueue')
            await _business_manager_queue.add('check_manager_nudges', {})
        except Exception as exc:
            log.error('business_manager_enqueue_failed', error=str(exc))


async def _process_reality_engine_hourly(job, token: str):
    count = await _reality_engine.run_hourly_sweep()
    return {'ok': True, 'count': count}


def create_reality_engine_hourly_worker() -> Worker:
    return Worker('reality.hourly_sweep', _process_reality_engine_hourly, {'connection': redis_conn_opts()})


async def run_reality_engine_hourly_scheduler() -> None:
    """Reality Engine Layer 2 (docs/REALITY_ENGINE_PLAN.md §8): hourly
    deterministic contradiction sweep, same fixed-interval shape as
    run_interest_cron_scheduler."""
    while True:
        await asyncio.sleep(3600)
        try:
            log.info('reality_engine_hourly_enqueue')
            await _reality_engine_hourly_queue.add('hourly_sweep', {})
        except Exception as exc:
            log.error('reality_engine_hourly_enqueue_failed', error=str(exc))


async def _process_reality_engine_daily(job, token: str):
    count = await _reality_engine.run_daily_sweep()
    return {'ok': True, 'count': count}


def create_reality_engine_daily_worker() -> Worker:
    return Worker('reality.daily_sweep', _process_reality_engine_daily, {'connection': redis_conn_opts()})


async def run_reality_engine_daily_scheduler() -> None:
    """Reality Engine Layer 3 (docs/REALITY_ENGINE_PLAN.md §9): daily at
    19:00 UTC — the next free slot after Business Manager's 18:00 check."""
    while True:
        now = datetime.now(tz=timezone.utc)
        target = now.replace(hour=19, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info('reality_engine_daily_scheduler_sleeping', next_run=str(target), seconds=int(wait_secs))
        await asyncio.sleep(wait_secs)
        try:
            log.info('reality_engine_daily_enqueue')
            await _reality_engine_daily_queue.add('daily_sweep', {})
        except Exception as exc:
            log.error('reality_engine_daily_enqueue_failed', error=str(exc))


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
