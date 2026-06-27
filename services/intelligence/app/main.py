import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog

from .database import get_pool, close_pool
from .queue import close_redis_publisher
from .routes.health import router as health_router
from .workers.message_worker import create_message_worker
from .workers.profile_worker import create_profile_worker
from .workers.daily_worker import create_proactive_worker, run_daily_scheduler
from .workers.voice_worker import create_voice_worker

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    logger.info('database_connected')

    msg_worker = create_message_worker()
    profile_worker = create_profile_worker()
    proactive_worker = create_proactive_worker()
    voice_worker = create_voice_worker()
    logger.info('workers_started')

    scheduler_task = asyncio.create_task(run_daily_scheduler())

    yield

    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass

    await msg_worker.close()
    await profile_worker.close()
    await proactive_worker.close()
    await voice_worker.close()
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
