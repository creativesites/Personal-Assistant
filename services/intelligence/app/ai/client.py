import json
import litellm
import structlog
from ..config import settings

log = structlog.get_logger()


class AIClient:
    def __init__(self) -> None:
        if settings.anthropic_api_key:
            litellm.anthropic_key = settings.anthropic_api_key
        if settings.openai_api_key:
            litellm.openai_key = settings.openai_api_key
        if settings.google_ai_api_key:
            litellm.vertex_key = settings.google_ai_api_key

        # Silence noisy litellm logging
        litellm.set_verbose = False

    async def complete_json(self, messages: list[dict], model: str | None = None) -> dict:
        m = model or settings.default_ai_model
        try:
            response = await litellm.acompletion(
                model=m,
                messages=messages,
                response_format={'type': 'json_object'},
                temperature=0.3,
                max_tokens=2048,
            )
            content = response.choices[0].message.content or '{}'
            return json.loads(content)
        except Exception as exc:
            log.error('ai_completion_failed', model=m, error=str(exc))
            raise

    async def complete_text(self, messages: list[dict], model: str | None = None) -> str:
        m = model or settings.default_ai_model
        response = await litellm.acompletion(
            model=m,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )
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
