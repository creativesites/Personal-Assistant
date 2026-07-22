"""Ask About Anything (Platform Polish Phase 6, docs/PLATFORM_POLISH_PLAN.md
§8) — a genuinely new engine, reusing job_discovery.py's already-proven
shape: one complete_json call turns free text into a structured,
executable directive. Classification only — no SQL, no text-to-SQL. The
resulting {entityType, filters, sort} triple is handed to Node's
services/api/src/routes/search.ts, which owns the fixed per-entity query
builders (it already has the DB pool every other route uses; duplicating
that here would mean a second Postgres connection just for this one
feature).
"""
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import ASK_ANYTHING

log = structlog.get_logger()

_VALID_ENTITIES = {'contacts', 'documents', 'projects', 'suppliers', 'products', 'messages'}
_VALID_OPS = {'eq', 'contains', 'gt', 'gte', 'lt', 'lte'}


async def classify_question(question: str, user_id: str) -> dict:
    ai = get_ai_client()
    try:
        result = await ai.complete_json(
            [{'role': 'user', 'content': ASK_ANYTHING.format(question=question)}],
            service='intelligence', feature='ask_anything', user_id=user_id,
        )
    except Exception as exc:
        log.warning('ask_anything_classify_failed', error=str(exc))
        return {'entityType': None, 'filters': [], 'sort': None}

    entity_type = result.get('entityType')
    if entity_type not in _VALID_ENTITIES:
        return {'entityType': None, 'filters': [], 'sort': None}

    filters = [
        f for f in (result.get('filters') or [])
        if isinstance(f, dict) and f.get('field') and f.get('op') in _VALID_OPS and 'value' in f
    ]
    sort = result.get('sort')
    if not (isinstance(sort, dict) and sort.get('field') and sort.get('direction') in ('asc', 'desc')):
        sort = None

    return {'entityType': entity_type, 'filters': filters, 'sort': sort}
