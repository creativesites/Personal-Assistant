import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog

from .database import get_pool, close_pool
from .queue import close_redis_publisher
from .routes.health import router as health_router
from .routes.knowledge import router as knowledge_router
from .routes.conversation import router as conversation_router, advisor_router, studio_router
from .routes.content import router as content_router
from .routes.goals import router as goals_router
from .routes.relationship_health import router as relationship_health_router
from .routes.proactive import router as proactive_router
from .routes.documents import router as documents_router
from .routes.auto_reply import router as auto_reply_router
from .workers.message_worker import create_message_worker
from .workers.profile_worker import create_profile_worker
from .workers.daily_worker import (
    create_proactive_worker, run_daily_scheduler, run_temporal_scheduler,
    run_world_knowledge_scheduler, run_consolidation_scheduler,
    create_document_followup_worker, run_document_followup_scheduler,
    create_pricing_benchmark_worker, run_pricing_benchmark_scheduler,
    create_inventory_forecast_worker, run_inventory_forecast_scheduler,
    create_reflection_worker, run_reflection_scheduler,
)
from .workers.voice_worker import create_voice_worker
from .workers.temporal_worker import create_temporal_worker
from .workers.world_knowledge_worker import create_world_knowledge_worker
from .workers.agent_worker import create_agent_worker, create_kb_worker
from .workers.consolidation_worker import create_consolidation_worker

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    logger.info('database_connected')

    msg_worker = create_message_worker()
    profile_worker = create_profile_worker()
    proactive_worker = create_proactive_worker()
    voice_worker = create_voice_worker()
    temporal_worker = create_temporal_worker()
    world_knowledge_worker = create_world_knowledge_worker()
    agent_worker = create_agent_worker()
    kb_worker = create_kb_worker()
    consolidation_worker = create_consolidation_worker()
    document_followup_worker = create_document_followup_worker()
    pricing_benchmark_worker = create_pricing_benchmark_worker()
    inventory_forecast_worker = create_inventory_forecast_worker()
    logger.info('workers_started')

    scheduler_task = asyncio.create_task(run_daily_scheduler())
    temporal_task = asyncio.create_task(run_temporal_scheduler())
    world_knowledge_task = asyncio.create_task(run_world_knowledge_scheduler())
    consolidation_task = asyncio.create_task(run_consolidation_scheduler())
    document_followup_task = asyncio.create_task(run_document_followup_scheduler())
    pricing_benchmark_task = asyncio.create_task(run_pricing_benchmark_scheduler())
    inventory_forecast_task = asyncio.create_task(run_inventory_forecast_scheduler())

    yield

    for task in (
        scheduler_task, temporal_task, world_knowledge_task, consolidation_task,
        document_followup_task, pricing_benchmark_task, inventory_forecast_task,
    ):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    await msg_worker.close()
    await profile_worker.close()
    await proactive_worker.close()
    await voice_worker.close()
    await temporal_worker.close()
    await world_knowledge_worker.close()
    await agent_worker.close()
    await kb_worker.close()
    await consolidation_worker.close()
    await document_followup_worker.close()
    await pricing_benchmark_worker.close()
    await inventory_forecast_worker.close()
    logger.info('workers_stopped')

    await close_redis_publisher()
    await close_pool()
    logger.info('database_closed')


app = FastAPI(
    title='Zuri Intelligence Service',
    version='0.0.1',
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(knowledge_router)
app.include_router(conversation_router)
app.include_router(advisor_router)
app.include_router(studio_router)
app.include_router(content_router)
app.include_router(goals_router)
app.include_router(relationship_health_router)
app.include_router(proactive_router)
app.include_router(documents_router)
app.include_router(auto_reply_router)
