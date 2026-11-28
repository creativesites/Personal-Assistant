"""Internal AI routing endpoints for the settings screen (docs/ZURI_AI_PLAN.md, Part A)."""
import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from ..ai.router import DEFAULT_CHAINS, JOBS, get_chain, test_model

router = APIRouter(prefix='/internal/ai', tags=['ai-routing'])


@router.get('/routing')
async def routing(user_id: str):
    """Effective chain per job, plus the built-in defaults."""
    chains = {job: await get_chain(user_id, job) for job in JOBS}
    return {
        'jobs': [{'job': j, 'chain': chains[j], 'isDefault': chains[j] == DEFAULT_CHAINS[j]} for j in JOBS],
        'defaults': DEFAULT_CHAINS,
    }


class RouteTestRequest(BaseModel):
    user_id: str | None = None
    models: list[str]


@router.post('/route-test')
async def route_test(body: RouteTestRequest):
    """Check each model with a tiny call."""
    results = await asyncio.gather(*(test_model(body.user_id, m) for m in body.models[:10]))
    return {'results': [r.__dict__ for r in results]}


class OpenerRequest(BaseModel):
    user_id: str
    contact_id: str
    reason: str


@router.post('/network/opener')
async def network_opener(body: OpenerRequest):
    """A keep-warm opener in the owner's voice (Networking nudges)."""
    from ..reply.opener import draft_opener
    return await draft_opener(body.user_id, body.contact_id, body.reason[:400])
