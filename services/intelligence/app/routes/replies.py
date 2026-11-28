"""Internal reply-engine endpoints: regenerate (save) and dry-run (eval)."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..reply.engine import run_compose

router = APIRouter(prefix='/internal/replies', tags=['replies'])


class ComposeRequest(BaseModel):
    user_id: str
    dry_run: bool = False
    as_of_message_id: str | None = None
    owner_answer: str | None = None
    instruction: str | None = None


@router.post('/{conversation_id}/compose')
async def compose_now(conversation_id: str, body: ComposeRequest):
    return await run_compose(body.user_id, conversation_id, mode='dry_run' if body.dry_run else 'regenerate',
                             as_of_message_id=body.as_of_message_id,
                             owner_answer=body.owner_answer, instruction=body.instruction)

