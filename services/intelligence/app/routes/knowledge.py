from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.knowledge_retriever import search_knowledge, chat_with_knowledge, update_chunk_content

router = APIRouter(prefix='/internal/knowledge', tags=['knowledge'])


class SearchRequest(BaseModel):
    user_id: str
    query: str
    limit: int = 10


class ChatRequest(BaseModel):
    user_id: str
    question: str


class UpdateChunkRequest(BaseModel):
    user_id: str
    content: str


@router.post('/search')
async def knowledge_search(req: SearchRequest):
    try:
        results = await search_knowledge(req.user_id, req.query, req.limit)
        return {'results': results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/chat')
async def knowledge_chat(req: ChatRequest):
    try:
        result = await chat_with_knowledge(req.user_id, req.question)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put('/chunks/{chunk_id}')
async def knowledge_update_chunk(chunk_id: str, req: UpdateChunkRequest):
    try:
        updated = await update_chunk_content(req.user_id, chunk_id, req.content)
        return {'ok': True, 'chunk': updated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
