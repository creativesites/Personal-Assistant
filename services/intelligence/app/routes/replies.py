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



class BlindTestRequest(BaseModel):
    user_id: str
    samples: int = 20
    chain: list[str] | None = None
    include_texts: bool = False


@router.post('/blind-test')
async def blind_test(body: BlindTestRequest):
    """Can a judge tell the owner's real replies from the engine's drafts?"""
    from ..reply.blind_test import run_blind_test
    return await run_blind_test(body.user_id, samples=max(1, min(body.samples, 40)),
                                chain=body.chain, include_texts=body.include_texts)
