"""Daily credit gating for the pricing/payments system (see
docs/PRICING_PAYMENTS_PLAN.md §7). One atomic check-and-decrement primitive,
called immediately before every metered action across message analysis,
reply generation, and proactive nudges. `status IN ('active', 'trialing')`
means a `pending_payment`/`payment_rejected`/`expired` subscription always
returns False here — that's the enforcement point, not a separate check.
"""
from typing import Literal

import structlog

from ..database import get_pool

log = structlog.get_logger()

CreditType = Literal['message', 'ai_reply', 'nudge']

_COLUMN_BY_TYPE: dict[str, str] = {
    'message': 'messages_remaining_today',
    'ai_reply': 'ai_replies_remaining_today',
    'nudge': 'nudges_remaining_today',
}


async def try_consume_credit(user_id: str, credit_type: CreditType) -> bool:
    column = _COLUMN_BY_TYPE[credit_type]
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""UPDATE subscriptions SET {column} = {column} - 1
                WHERE user_id = $1 AND status IN ('active', 'trialing') AND {column} > 0
                RETURNING id""",
            user_id,
        )
    if row is None:
        log.info('credit_exhausted', user_id=user_id, credit_type=credit_type)
    return row is not None
