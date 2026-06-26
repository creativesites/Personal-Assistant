from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog

from .config import settings
from .database import get_pool, close_pool
from .routes.health import router as health_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    logger.info('database_connected')
    yield
    await close_pool()
    logger.info('database_closed')


app = FastAPI(
    title='Zuri Intelligence Service',
    version='0.0.1',
    lifespan=lifespan,
)

app.include_router(health_router)
