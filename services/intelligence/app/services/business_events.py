"""Business Events — the generic detection log. See
docs/BUSINESS_EVENTS_PLAN.md §3. Every detected business signal (a new
product mentioned, a new supplier mentioned, an order intent, etc.) writes
one row here, independent of whether it ends up producing a user-facing
action — this is what makes extraction feel continuous rather than a
one-shot chat trick, and gives Studio's "Zuri Noticed" feed something
concrete to show.

Deliberately a pure insert with no side effects — callers (action_bundles.py
today) decide what, if anything, to do with the returned id.
"""
import structlog

from ..database import get_pool

log = structlog.get_logger()


class BusinessEventService:
    async def record(
        self, user_id: str, event_type: str,
        contact_id: str | None = None, conversation_id: str | None = None,
        message_id: str | None = None, confidence: float = 0.5,
        evidence: list[str] | None = None, payload: dict | None = None,
    ) -> str:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # NOTE: pass the native list/dict, not json.dumps(...) — the pool's
            # jsonb type codec (database.py's _init_conn) already does its own
            # json.dumps on the way in. Double-encoding here previously stored
            # evidence/payload as a JSON *string scalar* instead of a real
            # jsonb array/object, which made every reader that did
            # evidence[0] or payload.someField silently read the wrong thing
            # (e.g. evidence[0] on a string returns just its first character).
            row = await conn.fetchrow(
                """INSERT INTO business_events
                     (user_id, event_type, contact_id, conversation_id, message_id,
                      confidence, evidence, payload)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
                   RETURNING id""",
                user_id, event_type, contact_id, conversation_id, message_id,
                confidence, evidence or [], payload or {},
            )
        event_id = str(row['id'])
        log.info('business_event_recorded', user_id=user_id, event_type=event_type, event_id=event_id)
        return event_id

    async def mark_bundled(self, event_ids: list[str], bundle_id: str) -> None:
        if not event_ids:
            return
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE business_events SET bundle_id = $1, status = 'bundled' WHERE id = ANY($2::uuid[])",
                bundle_id, event_ids,
            )
