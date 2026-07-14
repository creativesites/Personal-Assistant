from fastapi import APIRouter
from pydantic import BaseModel

from ..services.exclusion_parser import parse_exclusion_instruction

router = APIRouter(prefix='/internal/auto-reply', tags=['auto-reply'])


class ParseExclusionRequest(BaseModel):
    user_id: str
    instruction: str


@router.post('/parse-exclusion')
async def parse_exclusion(body: ParseExclusionRequest):
    """Plain-English exclusion parsing (plan §4) — preview only, never
    saves. The caller (routes/settings.ts) persists after the user
    confirms the parsed result."""
    return await parse_exclusion_instruction(body.user_id, body.instruction)
