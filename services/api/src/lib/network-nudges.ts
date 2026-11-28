/**
 * Keep-warm nudges (Networking, docs/ZURI_AI_PLAN.md Part C).
 *
 * Once a day, for each owner with a warm list: contacts that are cooling,
 * cold or waiting on a reply get a nudge — the reason, plus a ready opener
 * drafted by the reply engine in the owner's voice. Key contacts come first
 * and are nudged again sooner; a nudge the owner keeps skipping escalates
 * ("third reminder") instead of going quiet. Pending nudges expire after
 * three days.
 */
import { db } from './db'
import { publishInboxEvent } from './inbox-events'
import { warmthFor, type Warmth } from './network-warmth'

const MAX_PER_DAY = 5
const EXPIRE_DAYS = 3
const RENUDGE_DAYS: Record<string, number> = { key: 3, important: 7 }
const INTELLIGENCE = () => process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'

type Member = { contact_id: string; tier: string; role: string | null; note: string | null; name: string }

function reasonFor(m: Member, w: Warmth, skipped: number): string {
  const who = m.role ? `${m.name} (${m.role})` : m.name
  const parts = [w.waitingOnYou ? `${who} is waiting on your reply.` : `${who} is ${w.status === 'cold' ? 'going cold' : 'cooling off'}.`]
  parts.push(...w.reasons.filter((r) => !r.startsWith("They're waiting")))
  if (m.note) parts.push(`Why they matter: ${m.note}`)
  if (skipped >= 2) parts.unshift(skipped >= 3 ? `Reminder ${skipped + 1}:` : 'Third reminder:')
  return parts.join(' ')
}

async function draft(ownerId: string, contactId: string, reason: string): Promise<{ messages: string[] | null; model: string | null }> {
  try {
    const res = await fetch(`${INTELLIGENCE()}/internal/ai/network/opener`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: ownerId, contact_id: contactId, reason }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) return { messages: null, model: null }
    const j = (await res.json()) as { messages?: string[]; model?: string }
    return { messages: j.messages?.length ? j.messages : null, model: j.model ?? null }
  } catch {
    return { messages: null, model: null }
  }
}

/** Create today's nudges for one owner. Returns how many were made. */
export async function runNudgesFor(ownerId: string, opts: { max?: number } = {}): Promise<number> {
  await db.query(
    `UPDATE network_nudges SET status = 'expired', decided_at = NOW()
     WHERE user_id = $1 AND status = 'pending' AND created_at < NOW() - make_interval(days => $2)`,
    [ownerId, EXPIRE_DAYS],
  )
  const { rows: members } = await db.query<Member>(
    `SELECT nc.contact_id, nc.tier, nc.role, nc.note,
            COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'This contact') AS name
     FROM network_contacts nc JOIN contacts co ON co.id = nc.contact_id
     WHERE nc.user_id = $1 AND nc.tier IN ('key', 'important') AND NOT co.is_group AND co.merged_into_id IS NULL`,
    [ownerId],
  )
  if (!members.length) return 0
  const warmth = await warmthFor(ownerId, members.map((m) => m.contact_id))
  const { rows: recent } = await db.query<{ contact_id: string; status: string; created_at: Date; snooze_until: Date | null; skipped: number }>(
    `SELECT DISTINCT ON (contact_id) contact_id, status, created_at, snooze_until,
            (SELECT COUNT(*)::int FROM network_nudges x WHERE x.contact_id = n.contact_id AND x.user_id = n.user_id
               AND x.status IN ('dismissed', 'expired') AND x.created_at > NOW() - INTERVAL '60 days') AS skipped
     FROM network_nudges n WHERE user_id = $1 ORDER BY contact_id, created_at DESC`,
    [ownerId],
  )
  const last = new Map(recent.map((r) => [r.contact_id, r]))
  const now = Date.now()
  const due = members
    .map((m) => ({ m, w: warmth.get(m.contact_id)! }))
    .filter(({ m, w }) => {
      if (!w || w.status === 'new' || (w.status === 'warm' && !w.waitingOnYou)) return false
      const l = last.get(m.contact_id)
      if (!l) return true
      if (l.status === 'pending') return false
      if (l.status === 'snoozed' && l.snooze_until && l.snooze_until.getTime() > now) return false
      const days = (now - l.created_at.getTime()) / 86_400_000
      return days >= (RENUDGE_DAYS[m.tier] ?? 7)
    })
    .sort((a, b) => (a.m.tier === b.m.tier ? 0 : a.m.tier === 'key' ? -1 : 1)
      || Number(b.w.waitingOnYou) - Number(a.w.waitingOnYou) || a.w.warmth - b.w.warmth)
    .slice(0, opts.max ?? MAX_PER_DAY)

  let made = 0
  for (const { m, w } of due) {
    const skipped = last.get(m.contact_id)?.skipped ?? 0
    const reason = reasonFor(m, w, skipped)
    const d = await draft(ownerId, m.contact_id, reason)
    await db.query(
      `INSERT INTO network_nudges (user_id, contact_id, reason, warmth, messages, model, skipped_before)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [ownerId, m.contact_id, reason, w.warmth, d.messages ? JSON.stringify(d.messages) : null, d.model, skipped],
    )
    made++
  }
  if (made) {
    const title = made === 1 ? 'Keep a connection warm' : `Keep ${made} connections warm`
    const body = due.map(({ m }) => m.name).join(', ')
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, 'relationship_alert', $2, $3, $4)`,
      [ownerId, title, body.slice(0, 300), JSON.stringify({ kind: 'network_nudges', count: made })],
    )
    await publishInboxEvent(ownerId, 'network:nudges', { count: made })
  }
  return made
}

export async function ownersWithWarmLists(): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM network_contacts WHERE tier IN ('key', 'important')`,
  )
  return rows.map((r) => r.user_id)
}
