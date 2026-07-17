from fastapi import APIRouter
from pydantic import BaseModel

from ..services.ask_anything import classify_question

# Platform Polish Phase 6 — Ask About Anything (docs/PLATFORM_POLISH_PLAN.md
# §8). Internal-only: services/api/src/routes/search.ts proxies
# POST /api/search/ask here for classification, then runs the fixed
# per-entity SQL builders itself.

router = APIRouter(prefix='/internal/search', tags=['search'])


class AskRequest(BaseModel):
    userId: str
    question: str


@router.post('/ask')
async def ask(body: AskRequest):
    return await classify_question(body.question, body.userId)
