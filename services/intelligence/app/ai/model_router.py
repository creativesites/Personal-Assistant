"""
Free-tier rotation across Alibaba/DashScope Qwen models.

Each model gets ~1M free tokens for testing. Pools are task-scoped (a
sentiment-analysis call must never land on an OCR-only model), and once a
model's cumulative usage crosses the limit the pool advances to the next
model in its list. Counters live in Redis (not memory) because the
intelligence service has no leader election — an in-process counter would
reset on every restart and blow through the free tier unpredictably across
workers.
"""

import structlog
import redis.asyncio as aioredis
from ..config import settings

log = structlog.get_logger()

TOKEN_LIMIT = 1_000_000

POOLS: dict[str, list[str]] = {
    # Ordered: most free-tier headroom first, quality preserved throughout.
    # qwen-turbo: ~2M free, very fast — ideal for per-message analysis.
    # qwen-plus: ~4M free, good quality for reply generation / profiling.
    # qwen-long: ~10M free, handles long conversation contexts well.
    # Remaining are ~1M free each; quality escalates as the pool rotates.
    'text': [
        'dashscope/qwen-turbo',
        'dashscope/qwen-plus',
        'dashscope/qwen-long',
        'dashscope/qwen-max',
        'dashscope/qwen3-max',
        'dashscope/qwen3.5-plus-2026-02-1',
        'dashscope/qwen-plus-2025-07-28',
        'dashscope/qwen3.7-plus',
        'dashscope/qwen3.5-122b-a10b',
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
