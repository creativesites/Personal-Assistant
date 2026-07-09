import json
import os
import litellm
import structlog
from ..config import settings
from .model_router import get_active_model, report_usage

log = structlog.get_logger()


def _normalize_model(model: str) -> str:
    """Ensure provider prefix is present for Gemini models used via AI Studio."""
    if model.startswith('gemini-'):
        return f'gemini/{model}'
    return model


class AIClient:
    def __init__(self) -> None:
        if settings.anthropic_api_key:
            litellm.anthropic_key = settings.anthropic_api_key
        if settings.openai_api_key:
            litellm.openai_key = settings.openai_api_key
        if settings.google_ai_api_key:
            os.environ['GEMINI_API_KEY'] = settings.google_ai_api_key
        if settings.dashscope_api_key:
            os.environ['DASHSCOPE_API_KEY'] = settings.dashscope_api_key

        # Silence noisy litellm logging
        litellm.set_verbose = False

    async def _resolve_model(self, model: str | None, pool: str) -> str:
        if model:
            return _normalize_model(model)
        routed = await get_active_model(pool)
        return routed or _normalize_model(settings.default_ai_model)

    async def _report_usage(self, model: str, pool: str, response) -> None:
        if not model.startswith('dashscope/'):
            return
        usage = getattr(response, 'usage', None)
        tokens = getattr(usage, 'total_tokens', 0) if usage else 0
        if not tokens:
            return
        try:
            await report_usage(pool, model, tokens)
        except Exception as exc:
            log.warning('ai_usage_report_failed', model=model, error=str(exc))

    async def complete_json(
        self, messages: list[dict], model: str | None = None, pool: str = 'text',
    ) -> dict:
        m = await self._resolve_model(model, pool)
        try:
            response = await litellm.acompletion(
                model=m,
                messages=messages,
                response_format={'type': 'json_object'},
                temperature=0.3,
                max_tokens=2048,
            )
            await self._report_usage(m, pool, response)
            content = response.choices[0].message.content or '{}'
            return json.loads(content)
        except Exception as exc:
            log.error('ai_completion_failed', model=m, error=str(exc))
            raise

    async def complete_text(
        self, messages: list[dict], model: str | None = None, pool: str = 'text',
    ) -> str:
        m = await self._resolve_model(model, pool)
        response = await litellm.acompletion(
            model=m,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )
        await self._report_usage(m, pool, response)
        return response.choices[0].message.content or ''

    async def embed(self, text: str) -> list[float] | None:
        if not settings.openai_api_key:
            return None
        try:
            response = await litellm.aembedding(
                model=settings.embedding_model,
                input=[text[:8192]],  # truncate to model limit
            )
            return response.data[0]['embedding']
        except Exception as exc:
            log.warning('embedding_failed', error=str(exc))
            return None


_client: AIClient | None = None


def get_ai_client() -> AIClient:
    global _client
    if _client is None:
        _client = AIClient()
    return _client
