import json
import structlog
from ..queue import get_redis_publisher
from .web_search import get_web_search

log = structlog.get_logger()

_CACHE_KEY = 'world:news:headlines'
_CACHE_TTL = 3600  # 1 hour


class NewsIndexer:
    async def get_headlines(self) -> list[dict]:
        r = await get_redis_publisher()
        cached = await r.get(_CACHE_KEY)
        if cached:
            return json.loads(cached)
        return await self.refresh()

    async def refresh(self) -> list[dict]:
        search = get_web_search()
        results = await search.search('top news today', max_results=20)
        stories = [r.model_dump() for r in results]
        if stories:
            r = await get_redis_publisher()
            await r.setex(_CACHE_KEY, _CACHE_TTL, json.dumps(stories))
            log.info('news_cache_refreshed', count=len(stories))
        else:
            log.warning('news_refresh_empty')
        return stories


_indexer: NewsIndexer | None = None


def get_news_indexer() -> NewsIndexer:
    global _indexer
    if _indexer is None:
        _indexer = NewsIndexer()
    return _indexer
