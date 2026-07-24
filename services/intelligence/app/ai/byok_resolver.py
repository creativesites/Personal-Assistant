"""
BYOK Key & Settings Resolution Layer.
Implements 3-tier key resolution hierarchy:
1. Organization / Team AI Key
2. Personal AI Key
3. Zuri System Fallback
Also handles budget checking and provider selection.
"""

import time
import structlog
from typing import TypedDict
from .encryption import decrypt_api_key

log = structlog.get_logger()


class ResolvedAIContext(TypedDict):
    api_key: str | None
    provider: str
    model: str
    is_byok: bool
    daily_budget_usd: float
    monthly_budget_usd: float
    hard_limit_enabled: bool


async def resolve_ai_context(
    user_id: str | None,
    requested_model: str | None = None,
    requested_provider: str | None = None,
) -> ResolvedAIContext:
    """
    Resolves active API key, provider, preferred model, and budget limits for a given user.
    """
    default_context: ResolvedAIContext = {
        'api_key': None,
        'provider': 'dashscope',
        'model': requested_model or 'dashscope/qwen-max',
        'is_byok': False,
        'daily_budget_usd': 0.0,
        'monthly_budget_usd': 0.0,
        'hard_limit_enabled': False,
    }

    if not user_id:
        return default_context

    try:
        from ..database import get_pool
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            # 1. Fetch user AI settings
            settings_row = await conn.fetchrow(
                """
                SELECT default_provider, preferred_model, reasoning_model, fast_model,
                       daily_budget_usd, monthly_budget_usd, budget_hard_limit_enabled
                FROM user_ai_settings
                WHERE user_id = $1 AND team_id IS NULL
                """,
                user_id,
            )

            provider = (
                requested_provider
                or (settings_row['default_provider'] if settings_row else None)
                or 'dashscope'
            )
            model = (
                requested_model
                or (settings_row['preferred_model'] if settings_row else None)
                or 'dashscope/qwen-max'
            )
            daily_budget = float(settings_row['daily_budget_usd']) if settings_row else 0.0
            monthly_budget = float(settings_row['monthly_budget_usd']) if settings_row else 0.0
            hard_limit = bool(settings_row['budget_hard_limit_enabled']) if settings_row else False

            # 2. Key Resolution Hierarchy: Organization -> Personal -> System Default
            key_row = None

            # Check if user is in an organization/team with a team key
            team_row = await conn.fetchrow(
                "SELECT team_id FROM team_members WHERE user_id = $1 LIMIT 1",
                user_id,
            )
            if team_row and team_row['team_id']:
                key_row = await conn.fetchrow(
                    """
                    SELECT encrypted_key, provider FROM user_ai_keys
                    WHERE team_id = $1 AND provider = $2 AND is_active = true
                    """,
                    team_row['team_id'], provider,
                )

            # Fall back to Personal Key for specified provider
            if not key_row:
                key_row = await conn.fetchrow(
                    """
                    SELECT encrypted_key, provider FROM user_ai_keys
                    WHERE user_id = $1 AND team_id IS NULL AND provider = $2 AND is_active = true
                    """,
                    user_id, provider,
                )

            # Fall back to ANY active key if specified provider has no key and provider wasn't explicitly requested
            if not key_row and not requested_provider:
                if team_row and team_row['team_id']:
                    key_row = await conn.fetchrow(
                        """
                        SELECT encrypted_key, provider FROM user_ai_keys
                        WHERE team_id = $1 AND is_active = true
                        ORDER BY created_at DESC LIMIT 1
                        """,
                        team_row['team_id'],
                    )
                if not key_row:
                    key_row = await conn.fetchrow(
                        """
                        SELECT encrypted_key, provider FROM user_ai_keys
                        WHERE user_id = $1 AND team_id IS NULL AND is_active = true
                        ORDER BY created_at DESC LIMIT 1
                        """,
                        user_id,
                    )

            if key_row and key_row['encrypted_key']:
                provider = key_row['provider']
                if not requested_model:
                    if provider == 'openai':
                        model = 'openai/gpt-4o-mini'
                    elif provider == 'anthropic':
                        model = 'anthropic/claude-3-5-sonnet-20241022'
                    elif provider == 'google':
                        model = 'gemini/gemini-3.5-flash'
                    elif provider == 'dashscope':
                        model = 'dashscope/qwen-max'

                try:
                    decrypted = decrypt_api_key(key_row['encrypted_key'])
                    if decrypted:
                        # 3. Budget Hard Limit Check
                        if hard_limit and (daily_budget > 0 or monthly_budget > 0):
                            usage_today = await conn.fetchval(
                                """
                                SELECT COALESCE(SUM(estimated_cost_usd), 0)
                                FROM token_usage_logs
                                WHERE user_id = $1 AND created_at >= CURRENT_DATE
                                """,
                                user_id,
                            )
                            if daily_budget > 0 and float(usage_today) >= daily_budget:
                                raise RuntimeError(
                                    f"Daily AI budget limit of ${daily_budget:.2f} has been reached. "
                                    "You can increase or remove your budget in AI Settings."
                                )

                        return {
                            'api_key': decrypted,
                            'provider': provider,
                            'model': model,
                            'is_byok': True,
                            'daily_budget_usd': daily_budget,
                            'monthly_budget_usd': monthly_budget,
                            'hard_limit_enabled': hard_limit,
                        }
                except RuntimeError:
                    raise
                except Exception as exc:
                    log.warning('byok_key_decryption_failed', user_id=user_id, provider=provider, error=str(exc))

            # Return fallback context with system default
            return {
                'api_key': None,
                'provider': provider,
                'model': model,
                'is_byok': False,
                'daily_budget_usd': daily_budget,
                'monthly_budget_usd': monthly_budget,
                'hard_limit_enabled': hard_limit,
            }

    except RuntimeError:
        raise
    except Exception as exc:
        log.warning('byok_resolution_error', user_id=user_id, error=str(exc))
        return default_context
