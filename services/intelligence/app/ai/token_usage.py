"""Token usage tracking — logs every AI call (any provider) into
`token_usage_logs` for the Diagnostics "Token Usage & AI Costs" dashboard.

Separate from `model_router.py`'s `report_usage()`, which only tracks
dashscope free-tier rotation (a single running total per model, no time/
user/feature dimension). This module tracks ALL models with per-call
granularity — user, service, feature, model, token counts, and an
estimated cost — so the diagnostics page can answer "how many tokens did
we use today/this month, broken down by feature/model/user."
"""
import json
import time
from decimal import Decimal

import structlog

from ..database import get_pool

log = structlog.get_logger()

# Gemini Flash rates are the model's real public per-token pricing at the
# time this was written; dashscope/Qwen rates are approximate (DashScope's
# published pricing, converted to USD) since they shift and vary by
# region/tier — good enough for an *estimate*, not a billing-grade figure.
# The `default` bucket covers any model not explicitly listed.
DEFAULT_COST_RATES: dict[str, dict[str, float]] = {
    'gemini/gemini-3.5-flash': {'input_per_1k': 0.000075, 'output_per_1k': 0.0003},
    'dashscope/qwen-turbo':    {'input_per_1k': 0.00004,  'output_per_1k': 0.00012},
    'dashscope/qwen-plus':     {'input_per_1k': 0.00008,  'output_per_1k': 0.00024},
    'dashscope/qwen-long':     {'input_per_1k': 0.00007,  'output_per_1k': 0.00007},
    'dashscope/qwen-max':      {'input_per_1k': 0.00016,  'output_per_1k': 0.00048},
    'default': {'input_per_1k': 0.0001, 'output_per_1k': 0.0003},
}

_CONFIG_KEY = 'cost_per_1k_tokens'
_CACHE_TTL_SECONDS = 300

_cached_rates: dict | None = None
_cached_at: float = 0.0


async def get_cost_rates() -> dict:
    """Reads the global cost-rate map from `system_config` (key
    `cost_per_1k_tokens`), cached in-process for 5 minutes so a token-
    logging call never adds a DB round-trip to the hot path. Falls back
    to `DEFAULT_COST_RATES` if the row doesn't exist yet."""
    global _cached_rates, _cached_at
    now = time.monotonic()
    if _cached_rates is not None and (now - _cached_at) < _CACHE_TTL_SECONDS:
        return _cached_rates

    rates = dict(DEFAULT_COST_RATES)
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT value FROM system_config WHERE key = $1", _CONFIG_KEY,
            )
        if row and row['value']:
            rates = dict(row['value'])
    except Exception as exc:
        log.warning('cost_rates_fetch_failed', error=str(exc))

    _cached_rates = rates
    _cached_at = now
    return rates


def _rate_for(rates: dict, model: str) -> dict:
    return rates.get(model) or rates.get('default') or DEFAULT_COST_RATES['default']


def estimate_tokens_from_text(text: str) -> int:
    """Conservative fallback when a provider's response has no usage
    block — ~4 characters per token, the standard rule-of-thumb estimate
    used when a real tokenizer isn't available."""
    return max(1, len(text or '') // 4)


def estimate_tokens_from_messages(messages: list[dict]) -> int:
    parts = []
    for m in messages or []:
        content = m.get('content')
        parts.append(content if isinstance(content, str) else json.dumps(content))
    return estimate_tokens_from_text(' '.join(parts))


async def log_usage(
    *, user_id: str | None, service: str, feature: str, model: str,
    prompt_tokens: int, completion_tokens: int,
) -> None:
    """Fire-and-forget: a logging failure must never break the AI call it
    describes, so every exception here is swallowed after a warning log."""
    try:
        rates = await get_cost_rates()
        rate = _rate_for(rates, model)
        cost = (
            (max(0, prompt_tokens) / 1000) * float(rate.get('input_per_1k', 0))
            + (max(0, completion_tokens) / 1000) * float(rate.get('output_per_1k', 0))
        )
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO token_usage_logs
                     (user_id, service, feature, model, prompt_tokens, completion_tokens, estimated_cost_usd)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                user_id, service, feature, model,
                max(0, prompt_tokens), max(0, completion_tokens), Decimal(str(round(cost, 6))),
            )
    except Exception as exc:
        log.warning('token_usage_log_failed', model=model, feature=feature, error=str(exc))
