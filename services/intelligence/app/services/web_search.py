import httpx
import structlog
from pydantic import BaseModel
from ..config import settings

log = structlog.get_logger()

_http: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=15.0)
    return _http


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    source: str = ''


class WebSearchClient:
    async def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        if settings.tavily_api_key:
            return await self._tavily(query, max_results)
        if settings.serp_api_key:
            return await self._serpapi(query, max_results)
        log.debug('web_search_no_api_key_configured')
        return []

    async def _tavily(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            r = await _get_http().post(
                'https://api.tavily.com/search',
                json={
                    'api_key': settings.tavily_api_key,
                    'query': query,
                    'max_results': max_results,
                    'search_depth': 'basic',
                    'include_answer': False,
                },
            )
            r.raise_for_status()
            data = r.json()
            return [
                SearchResult(
                    title=item.get('title', ''),
                    url=item.get('url', ''),
                    snippet=(item.get('content') or item.get('snippet', ''))[:500],
                    source=item.get('source', ''),
                )
                for item in data.get('results', [])
            ]
        except Exception as exc:
            log.error('tavily_search_failed', query=query[:80], error=str(exc))
            return []

    async def _serpapi(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            r = await _get_http().get(
                'https://serpapi.com/search',
                params={
                    'api_key': settings.serp_api_key,
                    'q': query,
                    'num': max_results,
                    'engine': 'google',
                },
            )
            r.raise_for_status()
            data = r.json()
            return [
                SearchResult(
                    title=item.get('title', ''),
                    url=item.get('link', ''),
                    snippet=item.get('snippet', ''),
                    source=item.get('source', ''),
                )
                for item in data.get('organic_results', [])[:max_results]
            ]
        except Exception as exc:
            log.error('serpapi_search_failed', query=query[:80], error=str(exc))
            return []


_instance: WebSearchClient | None = None


def get_web_search() -> WebSearchClient:
    global _instance
    if _instance is None:
        _instance = WebSearchClient()
    return _instance
