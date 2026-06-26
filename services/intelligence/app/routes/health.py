from fastapi import APIRouter
from fastapi.responses import JSONResponse
import redis.asyncio as aioredis
from ..config import settings
from ..database import get_pool

router = APIRouter()


@router.get('/health')
async def health_check():
    checks = {
        'status': 'ok',
        'services': {
            'database': 'unknown',
            'redis': 'unknown',
        },
    }

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval('SELECT 1')
        checks['services']['database'] = 'ok'
    except Exception:
        checks['services']['database'] = 'error'
        checks['status'] = 'degraded'

    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        checks['services']['redis'] = 'ok'
    except Exception:
        checks['services']['redis'] = 'error'
        checks['status'] = 'degraded'

    status_code = 200 if checks['status'] == 'ok' else 503
    return JSONResponse(content=checks, status_code=status_code)
