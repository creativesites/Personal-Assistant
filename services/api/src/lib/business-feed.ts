import { db } from './db'

// Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
// — reuses business_events + the existing "Zuri Noticed" render pattern
// rather than a new table. recordBusinessEvent() is the Node-side twin of
// Python's BusinessEventService.record() — a pure insert with no side
// effects, callers decide what (if anything) to do with it.
export async function recordBusinessEvent(
  userId: string,
  eventType: string,
  opts: {
    contactId?: string | null
    confidence?: number
    evidence?: string[]
    payload?: Record<string, unknown>
  } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO business_events (user_id, event_type, contact_id, confidence, evidence, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      userId, eventType, opts.contactId ?? null, opts.confidence ?? 1.0,
      JSON.stringify(opts.evidence ?? []), JSON.stringify(opts.payload ?? {}),
    ],
  )
}

// "The Nth invoice paid" / "the Nth deal closed" milestone-counter-crossing
// (plan §7.2). Checks for an EXACT match against a fixed set of round
// numbers, not >=, so it fires exactly once per threshold rather than on
// every write past it.
const MILESTONE_THRESHOLDS = [5, 10, 25, 50, 100, 250, 500, 1000]

export function checkMilestoneCrossing(count: number): number | null {
  return MILESTONE_THRESHOLDS.includes(count) ? count : null
}
