from urllib.parse import urlparse
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
