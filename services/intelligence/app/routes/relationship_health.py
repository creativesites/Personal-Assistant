import asyncio
from fastapi import APIRouter
from pydantic import BaseModel
from ..database import get_pool
from ..services.health import RelationshipHealthService
from ..services.network_value import NetworkValueService

router = APIRouter(prefix='/internal/relationship-health', tags=['relationship-health'])
_health_svc = RelationshipHealthService()
_network_value_svc = NetworkValueService()

# Bounded to the DB pool size (database.py: max_size=5) — recalculate()/
# recompute() are pure SQL, no LLM call, so this is cheap; the limit just
# avoids every contact fighting over the same 5 connections at once.
_CONCURRENCY = 5


class RecalculateRequest(BaseModel):
    contactId: str
    userId: str


class RecalculateAllRequest(BaseModel):
    userId: str


async def _recalculate_one(contact_id: str, user_id: str) -> int:
    score = await _health_svc.recalculate(contact_id, user_id)
    await _network_value_svc.recompute(contact_id, user_id)
    return score


@router.post('/recalculate')
async def recalculate(body: RecalculateRequest):
    """Manual trigger for the Cmd+K palette's "run health recalculation"
    action (docs/RELATIONSHIP_OS_PLAN.md §11) — calls the exact same
    RelationshipHealthService used by message_worker.py on its normal
    every-Nth-message cadence, just on demand instead of waiting. Contact
    ownership is verified by the caller (services/api) before this is hit."""
    score = await _recalculate_one(body.contactId, body.userId)
    return {'healthScore': score}


@router.post('/recalculate-all')
async def recalculate_all(body: RecalculateAllRequest):
    """"Analyze All Relationships" — recalculates health + network value for
    every contact this user has a relationship row for, working purely from
    message history already on file. No WhatsApp connection or LLM call is
    involved, so this is safe to run any time regardless of live session state."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT contact_id FROM relationships WHERE user_id = $1', body.userId,
        )
    contact_ids = [str(r['contact_id']) for r in rows]

    semaphore = asyncio.Semaphore(_CONCURRENCY)

    async def _bounded(contact_id: str) -> None:
        async with semaphore:
            await _recalculate_one(contact_id, body.userId)

    await asyncio.gather(*(_bounded(cid) for cid in contact_ids))
    return {'analyzedCount': len(contact_ids)}
