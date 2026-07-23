from urllib.parse import urlparse
import redis.asyncio as aioredis
from bullmq import Queue
from .config import settings


def redis_conn_opts() -> dict:
    p = urlparse(settings.redis_url)
    opts: dict = {"host": p.hostname or "localhost", "port": p.port or 6379}
    if p.password:
        opts["password"] = p.password
    if p.path and p.path.strip("/"):
        opts["db"] = int(p.path.strip("/"))
    return opts


def get_queue(name: str) -> Queue:
    return Queue(name, {"connection": redis_conn_opts()})


_redis_pub: aioredis.Redis | None = None


async def get_redis_publisher() -> aioredis.Redis:
    global _redis_pub
    if _redis_pub is None:
        _redis_pub = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_pub


async def publish_event(channel: str, payload: str) -> None:
    r = await get_redis_publisher()
    await r.publish(channel, payload)


async def close_redis_publisher() -> None:
    global _redis_pub
    if _redis_pub is not None:
        await _redis_pub.aclose()
        _redis_pub = None


async def acquire_conversation_lock(conversation_id: str, timeout_sec: int = 15) -> bool:
    r = await get_redis_publisher()
    key = f"lock:conversation:{conversation_id}"
    acquired = await r.set(key, "1", nx=True, ex=timeout_sec)
    return bool(acquired)


async def release_conversation_lock(conversation_id: str) -> None:
    r = await get_redis_publisher()
    key = f"lock:conversation:{conversation_id}"
    await r.delete(key)
