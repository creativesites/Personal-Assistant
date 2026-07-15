"""Client for the PDF render endpoint, which now lives in services/api
(Node, @react-pdf/renderer) instead of this service (Jinja2+Playwright).

This is the first Python -> Node synchronous HTTP call in the codebase —
every other cross-service call went the other direction (Node calling into
this service) or through a BullMQ job. Mirrors services/api's own
x-internal-secret convention (auth.ts's clerk-sync), just in reverse: this
service is now the caller, not the receiver.

Used in-process by agent_engine.py's create_document tool and
document_packs.py's Automatic Business Packs — neither has a browser/user
session in scope, so they can't call the render endpoint the way a
logged-in user's request to documents.ts does.
"""
import httpx
import structlog

from ..config import settings

log = structlog.get_logger()


async def render_document(document_id: str, user_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f'{settings.api_url}/api/documents/internal/{document_id}/render',
                json={'userId': user_id},
                headers={'x-internal-secret': settings.internal_api_secret},
            )
        except httpx.HTTPError as exc:
            log.error('document_render_request_failed', document_id=document_id, error=str(exc))
            raise

    if response.status_code == 404:
        raise ValueError('Document not found')
    if response.status_code >= 400:
        log.error('document_render_failed', document_id=document_id, status=response.status_code, body=response.text)
        raise RuntimeError(f'Document render failed with status {response.status_code}')

    return response.json()
