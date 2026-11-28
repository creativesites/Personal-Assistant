/**
 * Warmth of a relationship, measured from the chat itself (Networking,
 * docs/ZURI_AI_PLAN.md Part C). No AI call: plain arithmetic over message
 * times, so it is cheap to compute on every read.
 *
 *  - Sessions: a message more than SESSION_GAP after the previous one starts
 *    a new conversation. The typical gap is the median time between session
 *    starts over the last year (default 30 days with little history).
 *  - Recency: days since the last message, against that typical gap.
 *    On rhythm = warm; twice the usual gap ≈ cooling; three times = cold.
 *  - They're waiting on you: their message is the last one, over a day old.
 *  - Initiative: who started the recent conversations.
 */
import { db } from './db'

const SESSION_GAP_MS = 6 * 3600_000
const DAY = 86_400_000
const DEFAULT_GAP_DAYS = 30

export type Warmth = {
  contactId: string
  warmth: number                // 0-100
  status: 'warm' | 'cooling' | 'cold' | 'new'
  daysSince: number | null
  typicalGapDays: number
  lastFrom: 'you' | 'them' | null
  waitingOnYou: boolean
  youStartedShare: number | null   // of the last 6 conversations
  messageCount: number
  reasons: string[]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function computeWarmth(contactId: string, rows: { ts: Date; fromMe: boolean }[], now = Date.now()): Warmth {
  if (!rows.length) {
    return { contactId, warmth: 0, status: 'new', daysSince: null, typicalGapDays: DEFAULT_GAP_DAYS, lastFrom: null,
             waitingOnYou: false, youStartedShare: null, messageCount: 0, reasons: ['You haven\'t talked on WhatsApp yet'] }
  }
  const starts: { ts: number; fromMe: boolean }[] = []
  let prev = 0
  for (const r of rows) {
    const t = r.ts.getTime()
    if (!prev || t - prev > SESSION_GAP_MS) starts.push({ ts: t, fromMe: r.fromMe })
    prev = t
  }
  const yearAgo = now - 365 * DAY
  const recentStarts = starts.filter((s) => s.ts >= yearAgo)
  const gaps = recentStarts.slice(1).map((s, i) => (s.ts - recentStarts[i].ts) / DAY)
  const typical = gaps.length >= 2 ? Math.min(90, Math.max(2, median(gaps))) : DEFAULT_GAP_DAYS
  const last = rows[rows.length - 1]
  const daysSince = (now - last.ts.getTime()) / DAY
  const ratio = daysSince / typical
  let warmth = ratio <= 1 ? 100 - 15 * ratio : 85 * Math.exp(-0.55 * (ratio - 1))
  const reasons: string[] = []
  const d = Math.round(daysSince)
  reasons.push(d === 0 ? 'You talked today'
    : `Last talked ${d} day${d === 1 ? '' : 's'} ago — usually every ${Math.round(typical)} day${Math.round(typical) === 1 ? '' : 's'}`)

  const waitingOnYou = !last.fromMe && daysSince >= 1
  if (waitingOnYou) {
    warmth -= 15
    reasons.push(`They're waiting on your reply (${d} day${d === 1 ? '' : 's'})`)
  }
  const lastSix = starts.slice(-6)
  const youStartedShare = lastSix.length >= 3 ? lastSix.filter((s) => s.fromMe).length / lastSix.length : null
  if (youStartedShare !== null && youStartedShare >= 0.8) reasons.push(`You started ${Math.round(youStartedShare * lastSix.length)} of the last ${lastSix.length} conversations`)
  else if (youStartedShare !== null && youStartedShare <= 0.2) {
    warmth += 5
    reasons.push('They usually reach out first')
  }
  warmth = Math.max(0, Math.min(100, Math.round(warmth)))
  const status = warmth >= 70 ? 'warm' : warmth >= 40 ? 'cooling' : 'cold'
  return { contactId, warmth, status, daysSince: Math.round(daysSince * 10) / 10, typicalGapDays: Math.round(typical * 10) / 10,
           lastFrom: last.fromMe ? 'you' : 'them', waitingOnYou, youStartedShare, messageCount: rows.length, reasons }
}

/** Warmth for many contacts of one owner, from their 1:1 chats (last 2 years). */
export async function warmthFor(ownerId: string, contactIds: string[]): Promise<Map<string, Warmth>> {
  const out = new Map<string, Warmth>()
  if (!contactIds.length) return out
  const { rows } = await db.query<{ contact_id: string; ts: Date; from_me: boolean }>(
    `SELECT cv.contact_id, m.whatsapp_timestamp AS ts, (m.sender_type = 'user') AS from_me
     FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
     WHERE cv.user_id = $1 AND cv.contact_id = ANY($2::uuid[])
       AND m.whatsapp_timestamp > NOW() - INTERVAL '730 days' AND NOT m.is_deleted
     ORDER BY cv.contact_id, m.whatsapp_timestamp`,
    [ownerId, contactIds],
  )
  const by = new Map<string, { ts: Date; fromMe: boolean }[]>()
  for (const r of rows) {
    const list = by.get(r.contact_id) ?? []
    list.push({ ts: r.ts, fromMe: r.from_me })
    by.set(r.contact_id, list)
  }
  for (const id of contactIds) out.set(id, computeWarmth(id, by.get(id) ?? []))
  return out
}
