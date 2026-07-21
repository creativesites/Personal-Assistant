import json
import os
import base64
import litellm
import structlog
from ..config import settings
from .model_router import get_active_model, report_usage, force_advance
from .token_usage import (
    log_usage as log_token_usage,
    estimate_tokens_from_text,
    estimate_tokens_from_messages,
)

log = structlog.get_logger()

_HARD_FAIL_CODES = {401, 402, 403}
_QUOTA_PHRASES = (
    'quota', 'exhausted', 'insufficient_quota', 'free trial',
    'rate limit', 'too many requests', 'billing', 'access denied',
    # credential / key errors — treat as hard fail so Gemini fallback kicks in
    'missing credentials', 'no api_key', 'api_key', 'api key',
    'authentication', 'unauthorized', 'dashscopeexception',
)


def _is_hard_error(exc: Exception) -> bool:
    """True if this error means the model/key is dead — advance the pool."""
    msg = str(exc).lower()
    status = getattr(exc, 'status_code', None) or getattr(exc, 'code', None)
    if status in _HARD_FAIL_CODES:
        return True
    if any(phrase in msg for phrase in _QUOTA_PHRASES):
        return True
    return False


# True when a private Alibaba MaaS workspace is configured.
# We prefer the OpenAI-compatible endpoint because LiteLLM's dashscope/
# provider ignores api_base and always dials the public DashScope URL.
_USE_ALIBABA_CUSTOM_ENDPOINT = bool(
    settings.alibaba_ai_api_key
    and (settings.alibaba_openai_compatible_host or settings.alibaba_api_host)
)


def _normalize_model(model: str) -> str:
    """Ensure provider prefix is present for Gemini models used via AI Studio."""
    if model.startswith('gemini-'):
        return f'gemini/{model}'
    return model


def _build_dashscope_kwargs(model: str) -> dict:
    """
    Route dashscope/ models through the Alibaba MaaS OpenAI-compatible endpoint.

    LiteLLM's built-in dashscope/ provider hardcodes the public DashScope base
    URL and silently ignores api_base overrides, so we switch to the openai/
    provider (which fully supports api_base) and point it at the
    /compatible-mode/v1 path of the private workspace.

    Falls back to standard dashscope/ routing (DASHSCOPE_API_KEY) if no
    custom endpoint is configured.
    """
    if not _USE_ALIBABA_CUSTOM_ENDPOINT:
        return {}  # standard dashscope/ routing — nothing extra needed

    # Prefer the OpenAI-compatible path; fall back to api_host if only that is set
    base = settings.alibaba_openai_compatible_host or settings.alibaba_api_host

    # LiteLLM openai/ provider: strip the dashscope/ prefix
    model_name = model.split('/', 1)[-1]
    return {
        '_override_model': f'openai/{model_name}',
        'api_base': base,
        'api_key': settings.alibaba_ai_api_key,
    }


class AIClient:
    def __init__(self) -> None:
        if settings.anthropic_api_key:
            litellm.anthropic_key = settings.anthropic_api_key
        if settings.openai_api_key:
            litellm.openai_key = settings.openai_api_key
        if settings.google_ai_api_key:
            os.environ['GEMINI_API_KEY'] = settings.google_ai_api_key
        # Only set the standard DASHSCOPE_API_KEY when NOT using the custom endpoint
        if settings.dashscope_api_key and not _USE_ALIBABA_CUSTOM_ENDPOINT:
            os.environ['DASHSCOPE_API_KEY'] = settings.dashscope_api_key

        if _USE_ALIBABA_CUSTOM_ENDPOINT:
            log.info(
                'alibaba_maas_endpoint_active',
                host=settings.alibaba_openai_compatible_host,
            )

        # Silence noisy litellm logging
        litellm.set_verbose = False

    async def _resolve_model(self, model: str | None, pool: str) -> str:
        if model:
            return _normalize_model(model)
        routed = await get_active_model(pool)
        return routed or _normalize_model(settings.default_ai_model)

    async def _report_usage(self, model: str, pool: str, response) -> None:
        # model is the original dashscope/ name; track under that for pool rotation
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

    async def _log_token_usage(
        self, model: str, messages: list[dict], response, *,
        service: str, feature: str, user_id: str | None,
    ) -> None:
        """Comprehensive, provider-agnostic token/cost logging for the
        Diagnostics "Token Usage & AI Costs" dashboard — unlike
        _report_usage() above (dashscope-only, pool-rotation bookkeeping),
        this runs for every model on every call. Falls back to a
        conservative char-count estimate when a response has no usage
        block (some providers/fallback paths omit it)."""
        usage = getattr(response, 'usage', None)
        prompt_tokens = getattr(usage, 'prompt_tokens', 0) if usage else 0
        completion_tokens = getattr(usage, 'completion_tokens', 0) if usage else 0
        if not prompt_tokens and not completion_tokens:
            prompt_tokens = estimate_tokens_from_messages(messages)
            content = ''
            try:
                content = response.choices[0].message.content or ''
            except Exception:
                pass
            completion_tokens = estimate_tokens_from_text(content)
        await log_token_usage(
            user_id=user_id, service=service, feature=feature, model=model,
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        )

    async def _call_with_failover(
        self,
        messages: list[dict],
        pool: str,
        model: str | None,
        *,
        json_mode: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        service: str = 'intelligence',
        feature: str = 'unknown',
        user_id: str | None = None,
    ):
        """Call litellm with automatic pool advance on hard errors (403, quota, etc).
        After 3 consecutive hard failures on dashscope, falls back to Gemini."""
        attempted: set[str] = set()
        consecutive_hard_failures = 0
        _GEMINI_FALLBACK_AFTER = 3

        for _ in range(20):  # generous upper bound
            m = await self._resolve_model(model, pool)

            # Dashscope pool exhausted — fall back to Gemini
            if consecutive_hard_failures >= _GEMINI_FALLBACK_AFTER or m in attempted:
                gemini = _normalize_model(settings.default_ai_model)
                if gemini.startswith('gemini/') and settings.google_ai_api_key:
                    log.warning(
                        'ai_gemini_fallback', pool=pool,
                        reason=f'{consecutive_hard_failures} consecutive hard failures',
                    )
                    try:
                        kwargs: dict = dict(
                            model=gemini, messages=messages,
                            temperature=temperature, max_tokens=max_tokens,
                        )
                        if json_mode:
                            kwargs['response_format'] = {'type': 'json_object'}
                        response = await litellm.acompletion(**kwargs)
                        await self._log_token_usage(
                            gemini, messages, response, service=service, feature=feature, user_id=user_id,
                        )
                        return gemini, response
                    except Exception as exc:
                        log.error('ai_gemini_fallback_failed', error=str(exc))
                        raise
                raise RuntimeError(f'All models in pool "{pool}" failed and no Gemini key configured')

            attempted.add(m)
            extra = _build_dashscope_kwargs(m) if m.startswith('dashscope/') else {}
            effective_model = extra.pop('_override_model', m)
            kwargs = dict(
                model=effective_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **extra,
            )
            if json_mode:
                kwargs['response_format'] = {'type': 'json_object'}

            try:
                response = await litellm.acompletion(**kwargs)
                await self._report_usage(m, pool, response)
                await self._log_token_usage(
                    m, messages, response, service=service, feature=feature, user_id=user_id,
                )
                return m, response
            except Exception as exc:
                log.error('ai_completion_failed', model=m, error=str(exc))
                if _is_hard_error(exc):
                    consecutive_hard_failures += 1
                    next_m = await force_advance(pool, m, reason=str(exc)[:120])
                    model = None  # let _resolve_model pick next active model
                    log.info('ai_failover', pool=pool, next_model=next_m,
                             consecutive_failures=consecutive_hard_failures)
                    continue
                raise  # transient / unexpected — don't loop

        raise RuntimeError(f'All models in pool "{pool}" failed or exhausted')

    async def complete_json(
        self, messages: list[dict], model: str | None = None, pool: str = 'text',
        *, service: str = 'intelligence', feature: str = 'unknown', user_id: str | None = None,
    ) -> dict:
        _, response = await self._call_with_failover(
            messages, pool, model, json_mode=True, temperature=0.3, max_tokens=2048,
            service=service, feature=feature, user_id=user_id,
        )
        content = response.choices[0].message.content or '{}'
        return json.loads(content)

    async def complete_text(
        self, messages: list[dict], model: str | None = None, pool: str = 'text',
        *, service: str = 'intelligence', feature: str = 'unknown', user_id: str | None = None,
    ) -> str:
        _, response = await self._call_with_failover(
            messages, pool, model, temperature=0.7, max_tokens=1024,
            service=service, feature=feature, user_id=user_id,
        )
        return response.choices[0].message.content or ''

    async def extract_image_text(
        self,
        *,
        image_bytes: bytes,
        mime_type: str,
        prompt: str | None = None,
        service: str = 'intelligence',
        feature: str = 'ocr_extraction',
        user_id: str | None = None,
    ) -> str:
        m = await self._resolve_model(None, 'ocr')
        extra = _build_dashscope_kwargs(m) if m.startswith('dashscope/') else {}
        effective_model = extra.pop('_override_model', m)
        data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        vision_messages = [{
            'role': 'user',
            'content': [
                {
                    'type': 'text',
                    'text': prompt or (
                        'Extract all readable text from this business document/image. '
                        'Preserve prices, product names, contact details, policies, dates, '
                        'tables, labels, addresses, and phone numbers. Return plain text only.'
                    ),
                },
                {'type': 'image_url', 'image_url': {'url': data_url}},
            ],
        }]
        response = await litellm.acompletion(
            model=effective_model,
            messages=vision_messages,
            temperature=0.1,
            max_tokens=4096,
            **extra,
        )
        await self._report_usage(m, 'ocr', response)
        await self._log_token_usage(
            m, vision_messages, response, service=service, feature=feature, user_id=user_id,
        )
        return response.choices[0].message.content or ''

    async def embed(
        self, text: str, *, service: str = 'intelligence', feature: str = 'embedding', user_id: str | None = None,
    ) -> list[float] | None:
        if not settings.openai_api_key:
            return None
        try:
            response = await litellm.aembedding(
                model=settings.embedding_model,
                input=[text[:8192]],  # truncate to model limit
            )
            usage = getattr(response, 'usage', None)
            prompt_tokens = getattr(usage, 'prompt_tokens', 0) if usage else estimate_tokens_from_text(text)
            await log_token_usage(
                user_id=user_id, service=service, feature=feature, model=settings.embedding_model,
                prompt_tokens=prompt_tokens, completion_tokens=0,
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
