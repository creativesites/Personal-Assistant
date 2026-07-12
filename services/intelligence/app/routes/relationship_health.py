from fastapi import APIRouter
from pydantic import BaseModel
from ..services.health import RelationshipHealthService
from ..services.network_value import NetworkValueService

router = APIRouter(prefix='/internal/relationship-health', tags=['relationship-health'])
_health_svc = RelationshipHealthService()
_network_value_svc = NetworkValueService()


class RecalculateRequest(BaseModel):
    contactId: str
    userId: str


@router.post('/recalculate')
async def recalculate(body: RecalculateRequest):
    """Manual trigger for the Cmd+K palette's "run health recalculation"
    action (docs/RELATIONSHIP_OS_PLAN.md §11) — calls the exact same
    RelationshipHealthService used by message_worker.py on its normal
    every-Nth-message cadence, just on demand instead of waiting. Contact
    ownership is verified by the caller (services/api) before this is hit."""
    score = await _health_svc.recalculate(body.contactId, body.userId)
    await _network_value_svc.recompute(body.contactId, body.userId)
    return {'healthScore': score}
