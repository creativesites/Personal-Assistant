import json
import asyncpg
from pgvector.asyncpg import register_vector
from .config import settings

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    await register_vector(conn)
    await conn.set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')
    await conn.set_type_codec('json', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        ssl = 'require' if 'supabase.com' in settings.database_url else None
        _pool = await asyncpg.create_pool(settings.database_url, init=_init_conn, ssl=ssl, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
