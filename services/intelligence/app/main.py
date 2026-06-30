import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog

from .database import get_pool, close_pool
from .queue import close_redis_publisher
from .routes.health import router as health_router
from .routes.knowledge import router as knowledge_router
from .routes.conversations import router as conversations_router
from .routes.vision import router as vision_router
from .workers.message_worker import create_message_worker
from .workers.profile_worker import create_profile_worker
from .workers.daily_worker import create_proactive_worker, run_daily_scheduler, run_temporal_scheduler, run_world_knowledge_scheduler
from .workers.voice_worker import create_voice_worker
from .workers.temporal_worker import create_temporal_worker
from .workers.world_knowledge_worker import create_world_knowledge_worker
from .workers.agent_worker import create_agent_worker, create_kb_worker

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
    logger.info('workers_started')

    scheduler_task = asyncio.create_task(run_daily_scheduler())
    temporal_task = asyncio.create_task(run_temporal_scheduler())
    world_knowledge_task = asyncio.create_task(run_world_knowledge_scheduler())

    yield

    for task in (scheduler_task, temporal_task, world_knowledge_task):
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
app.include_router(conversations_router)
app.include_router(vision_router)
