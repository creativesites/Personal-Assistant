import { db } from './db'
import { publishInboxEvent } from './inbox-events'

// Zuri Reality Engine (Phase 1) — see docs/REALITY_ENGINE_PLAN.md §7, Hook B.
// A document marked paid or a deal reaching closed_won resolves the
// matching invoice-gap nudge business_manager.py created, synchronously,
// from the Node route that already owns the write — no new Node->Python
// call, matching this codebase's existing credits.py precedent of direct
// Postgres access over a new HTTP round-trip. Reality Engine only ever
// resolves Zuri's own artifacts (business_events/proactive_queue rows),
// never the user's own business record.

export async function resolveInvoiceGapNudges(
  userId: string,
  { dealId, projectId }: { dealId?: string | null; projectId?: string | null },
  reason: string,
): Promise<number> {
  if (!dealId && !projectId) return 0

  const { rows: events } = await db.query(
    `UPDATE business_events
       SET status = 'expired'
     WHERE user_id = $1 AND event_type = 'invoice_gap' AND status != 'expired'
       AND ((payload->>'dealId' = $2) OR (payload->>'projectId' = $3))
     RETURNING id, contact_id`,
    [userId, dealId ?? null, projectId ?? null],
  )
  if (events.length === 0) return 0

  const eventIds = events.map((e) => e.id)
  const { rows: nudges } = await db.query(
    `UPDATE proactive_queue
       SET status = 'auto_resolved', resolved_reason = $1, updated_at = NOW()
     WHERE business_event_id = ANY($2::uuid[]) AND status = 'pending'
     RETURNING id`,
    [reason, eventIds],
  )

  const contactId = events[0].contact_id
  await publishInboxEvent(userId, 'reality.resolved', {
    contactId, count: nudges.length, reason,
  })

  return nudges.length
}
