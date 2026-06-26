from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog

from .database import get_pool, close_pool
from .routes.health import router as health_router
from .workers.message_worker import create_message_worker
from .workers.profile_worker import create_profile_worker

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    logger.info('database_connected')

    msg_worker = create_message_worker()
    profile_worker = create_profile_worker()
    logger.info('workers_started')

    yield

    await msg_worker.close()
    await profile_worker.close()
    logger.info('workers_stopped')

    await close_pool()
    logger.info('database_closed')


app = FastAPI(
    title='Zuri Intelligence Service',
    version='0.0.1',
    lifespan=lifespan,
)

app.include_router(health_router)
