"""
Model pool rotation for AI text generation.

Primary pool uses Google Gemini (generous free tier, high quality).
Falls back to Alibaba/DashScope Qwen models when Gemini quota runs low.
Each model gets a token budget before the pool advances to the next model.
Counters live in Redis so they survive restarts and are shared across workers.
"""

import structlog
import redis.asyncio as aioredis
from ..config import settings

log = structlog.get_logger()

TOKEN_LIMIT = 1_000_000

POOLS: dict[str, list[str]] = {
    # Gemini first (large free quota, excellent quality for all tasks).
    # Qwen models as fallback if Gemini quota is exhausted.
    'text': [
        'gemini/gemini-3.6-flash',
        'gemini/gemini-3.5-pro',
        'dashscope/qwen-3.8-max',
        'dashscope/qwen-3.8',
        'dashscope/qwen-3.7-max',
    ],

    'vision': [
        'dashscope/qwen3-vl-32b-thinking',
        'dashscope/qwen3-vl-235b-a22b-thinking',
    ],
    'ocr': [
        'dashscope/qwen-vl-ocr-2025-11-20',
    ],
    'translation': [
        'dashscope/qwen-mt-flash',
    ],
}

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _active_index_key(pool: str) -> str:
    return f'ai:model:active_index:{pool}'


def _tokens_key(model: str) -> str:
    return f'ai:tokens:{model}'


async def get_active_model(pool: str) -> str | None:
    """Current model for a pool, or None if every model in it is exhausted."""
    models = POOLS.get(pool)
    if not models:
        return None
    r = await _get_redis()
    idx_raw = await r.get(_active_index_key(pool))
    idx = int(idx_raw) if idx_raw is not None else 0
    if idx >= len(models):
        return None
    return models[idx]


async def force_advance(pool: str, model: str, reason: str = 'hard_error') -> str | None:
    """Immediately advance the pool past `model` due to a hard error (403, quota, etc).
    Returns the new active model, or None if the pool is exhausted."""
    models = POOLS.get(pool, [])
    try:
        current_idx = models.index(model)
    except ValueError:
        return await get_active_model(pool)

    next_idx = current_idx + 1
    r = await _get_redis()
    # Only advance if we haven't already passed this point (another worker may have)
    existing = await r.get(_active_index_key(pool))
    if existing is None or int(existing) <= current_idx:
        await r.set(_active_index_key(pool), next_idx)

    next_model = models[next_idx] if next_idx < len(models) else None
    log.warning(
        'ai_model_force_advanced', pool=pool,
        from_model=model, to_model=next_model, reason=reason,
    )
    return next_model


async def report_usage(pool: str, model: str, tokens: int) -> None:
    """Records token usage for `model` and advances the pool's active model
    if this call pushed it past the free-tier limit."""
    if tokens <= 0:
        return
    r = await _get_redis()
    total = await r.incrby(_tokens_key(model), tokens)

    await _mirror_to_postgres(model, pool, tokens)

    if total < TOKEN_LIMIT:
        return

    models = POOLS.get(pool, [])
    try:
        current_idx = models.index(model)
    except ValueError:
        return

    next_idx = current_idx + 1
    await r.set(_active_index_key(pool), next_idx)
    if next_idx < len(models):
        log.warning(
            'ai_model_rotated', pool=pool, from_model=model,
            to_model=models[next_idx], tokens_used=total,
        )
    else:
        log.warning('ai_pool_exhausted', pool=pool, tokens_used=total)


async def _mirror_to_postgres(model: str, pool: str, tokens: int) -> None:
    """Best-effort — Redis is the source of truth for rotation, Postgres is
    just for a future usage dashboard, so a failure here must not break a call."""
    try:
        from ..database import get_pool as get_db_pool

        db_pool = await get_db_pool()
        async with db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO ai_model_usage (model, pool, tokens_used, last_used_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (model) DO UPDATE SET
                    tokens_used  = ai_model_usage.tokens_used + $3,
                    last_used_at = NOW()
                """,
                model, pool, tokens,
            )
    except Exception as exc:
        log.warning('ai_model_usage_mirror_failed', model=model, error=str(exc))
