import numpy as np
from .client import get_ai_client


async def embed_text(text: str) -> 'np.ndarray | None':
    if not text:
        return None
    client = get_ai_client()
    vec = await client.embed(text[:8192])
    if vec is None:
        return None
    return np.array(vec, dtype=np.float32)
