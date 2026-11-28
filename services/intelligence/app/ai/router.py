"""Per-job AI routing with ordered fallback chains (docs/ZURI_AI_PLAN.md, Part A).

Each job (reply_draft, chat_summary, ...) has an ordered chain of models.
`complete_routed()` tries them in order and returns the first success,
recording every attempt. The owner can override a chain per job in
`ai_routing` (PUT /api/ai/routing); otherwise the quality-first defaults
below apply.

Keys, per provider: the owner's own active key in user_ai_keys first, then
the system key from settings. A link with no key at all is skipped (and
reported as such), so a chain only uses providers that are actually set up.

This sits beside AIClient rather than inside it: AIClient's pools/rotation
serve every older feature; the router serves the features that explicitly
ask for a job's chain.
"""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field

import litellm
import structlog

from ..config import settings
from ..database import get_pool
from .claude import claude_complete, extract_json_text, resolve_claude_model
from .encryption import decrypt_api_key
from .token_usage import estimate_tokens_from_messages, estimate_tokens_from_text, log_usage

log = structlog.get_logger()

# Quality first: the strongest model leads every chain the owner sees or sends.
DEFAULT_CHAINS: dict[str, list[str]] = {
    'reply_draft': ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'gemini/gemini-4-hydrogen', 'gemini/gemini-pro-latest',
                    'openai/gpt-5', 'deepseek/deepseek-chat'],
    'auto_reply': ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'gemini/gemini-4-hydrogen', 'gemini/gemini-pro-latest',
                   'openai/gpt-5', 'deepseek/deepseek-chat'],
    'chat_summary': ['anthropic/claude-sonnet-5-5', 'gemini/gemini-4-hydrogen', 'gemini/gemini-pro-latest', 'openai/gpt-5'],
    'analysis': ['anthropic/claude-haiku-5-5', 'gemini/gemini-3.6-flash', 'deepseek/deepseek-chat'],
    'networking_coach': ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'gemini/gemini-4-hydrogen', 'gemini/gemini-pro-latest'],
}
JOBS = tuple(DEFAULT_CHAINS)

# Claude thinking effort per job (other providers ignore it).
JOB_EFFORT = {'reply_draft': 'medium', 'auto_reply': 'medium', 'networking_coach': 'high'}

PROVIDERS = {'anthropic': 'anthropic/', 'google': 'gemini/', 'openai': 'openai/', 'deepseek': 'deepseek/'}


def provider_of(model: str) -> str | None:
    m = model.strip().lower()
    if m.startswith('anthropic/') or m.startswith('claude-'):
        return 'anthropic'
    for provider, prefix in PROVIDERS.items():
        if m.startswith(prefix):
            return provider
    return None


def _system_key(provider: str) -> str:
    return {
        'anthropic': settings.anthropic_api_key,
        'google': settings.google_ai_api_key,
        'openai': settings.openai_api_key,
        'deepseek': settings.deepseek_api_key,
    }.get(provider, '') or ''


@dataclass
class Attempt:
    model: str
    ok: bool
    error: str = ''
    ms: int = 0
    byok: bool = False


@dataclass
class RoutedResult:
    text: str
    model: str
    attempts: list[Attempt] = field(default_factory=list)


class AllModelsFailed(RuntimeError):
    def __init__(self, job: str, attempts: list[Attempt]):
        self.attempts = attempts
        summary = '; '.join(f'{a.model}: {a.error}' for a in attempts) or 'no models configured'
        super().__init__(f'All models for {job} failed ({summary})')


async def get_chain(user_id: str | None, job: str) -> list[str]:
    if user_id:
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                raw = await conn.fetchval('SELECT chain FROM ai_routing WHERE user_id = $1 AND job = $2', user_id, job)
            if raw:
                chain = json.loads(raw) if isinstance(raw, str) else raw
                chain = [str(m) for m in chain if isinstance(m, str) and provider_of(m)]
                if chain:
                    return chain
        except Exception as exc:  # noqa: BLE001 — fall back to defaults
            log.warning('ai_routing_read_failed', job=job, error=str(exc)[:200])
    return list(DEFAULT_CHAINS.get(job, DEFAULT_CHAINS['analysis']))


async def _user_keys(user_id: str | None) -> dict[str, str]:
    if not user_id:
        return {}
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT provider, encrypted_key FROM user_ai_keys
                   WHERE user_id = $1 AND team_id IS NULL AND is_active = TRUE AND status <> 'invalid'""",
                user_id,
            )
    except Exception as exc:  # noqa: BLE001
        log.warning('ai_router_keys_failed', error=str(exc)[:200])
        return {}
    keys: dict[str, str] = {}
    for r in rows:
        try:
            k = decrypt_api_key(r['encrypted_key'])
            if k:
                keys[r['provider']] = k
        except Exception:  # noqa: BLE001
            continue
    return keys


async def _call(model: str, provider: str, key: str, messages: list[dict], *, json_mode: bool,
                max_tokens: int, effort: str | None, timeout_sec: float) -> tuple[str, int, int]:
    if provider == 'anthropic':
        resp = await claude_complete(
            messages, resolve_claude_model(model), json_mode=json_mode, max_tokens=max_tokens,
            timeout_sec=timeout_sec, effort=effort, api_key=key,
        )
        return resp.choices[0].message.content or '', resp.usage.prompt_tokens, resp.usage.completion_tokens
    # Thinking models (Gemini 4, GPT-5, ...) count reasoning toward max_tokens:
    # leave headroom above the visible-output budget, as the Claude path does.
    budget = min(max(max_tokens * 4, 8192), 32000)
    kwargs: dict = dict(model=model, messages=messages, max_tokens=budget, api_key=key, timeout=timeout_sec)
    if json_mode:
        kwargs['response_format'] = {'type': 'json_object'}
    resp = await litellm.acompletion(**kwargs)
    text = resp.choices[0].message.content or ''
    if json_mode:
        text = extract_json_text(text)
    usage = getattr(resp, 'usage', None)
    return text, getattr(usage, 'prompt_tokens', 0) or 0, getattr(usage, 'completion_tokens', 0) or 0


async def complete_routed(
    job: str,
    messages: list[dict],
    *,
    user_id: str | None,
    json_mode: bool = False,
    max_tokens: int = 2048,
    timeout_sec: float = 120.0,
    chain: list[str] | None = None,
) -> RoutedResult:
    """Try the job's chain in order. Raises AllModelsFailed if nothing worked."""
    chain = chain or await get_chain(user_id, job)
    user_keys = await _user_keys(user_id)
    effort = JOB_EFFORT.get(job)
    attempts: list[Attempt] = []
    for model in chain:
        provider = provider_of(model)
        if not provider:
            continue
        key = user_keys.get(provider) or _system_key(provider)
        if not key:
            attempts.append(Attempt(model=model, ok=False, error='no key'))
            continue
        started = time.monotonic()
        try:
            text, p_tok, c_tok = await asyncio.wait_for(
                _call(model, provider, key, messages, json_mode=json_mode, max_tokens=max_tokens,
                      effort=effort, timeout_sec=timeout_sec),
                timeout=timeout_sec + 5,
            )
            if not text.strip():
                raise RuntimeError('empty response')
            if json_mode:
                json.loads(text)  # a malformed answer counts as a failure: try the next model
        except Exception as exc:  # noqa: BLE001 — any failure moves down the chain
            attempts.append(Attempt(model=model, ok=False, error=str(exc)[:200],
                                    ms=int((time.monotonic() - started) * 1000), byok=provider in user_keys))
            log.warning('ai_route_attempt_failed', job=job, model=model, error=str(exc)[:200])
            continue
        attempts.append(Attempt(model=model, ok=True, ms=int((time.monotonic() - started) * 1000),
                                byok=provider in user_keys))
        await log_usage(
            user_id=user_id, service='intelligence', feature=job, model=model,
            prompt_tokens=p_tok or estimate_tokens_from_messages(messages),
            completion_tokens=c_tok or estimate_tokens_from_text(text),
        )
        return RoutedResult(text=text, model=model, attempts=attempts)
    raise AllModelsFailed(job, attempts)


async def test_model(user_id: str | None, model: str) -> Attempt:
    """One tiny call, for the settings screen's per-link check."""
    provider = provider_of(model)
    if not provider:
        return Attempt(model=model, ok=False, error='unknown provider')
    keys = await _user_keys(user_id)
    key = keys.get(provider) or _system_key(provider)
    if not key:
        return Attempt(model=model, ok=False, error='no key')
    started = time.monotonic()
    try:
        await _call(model, provider, key, [{'role': 'user', 'content': 'Reply with the single word: ok'}],
                    json_mode=False, max_tokens=16, effort='low', timeout_sec=30)
        return Attempt(model=model, ok=True, ms=int((time.monotonic() - started) * 1000), byok=provider in keys)
    except Exception as exc:  # noqa: BLE001
        return Attempt(model=model, ok=False, error=str(exc)[:200],
                       ms=int((time.monotonic() - started) * 1000), byok=provider in keys)
