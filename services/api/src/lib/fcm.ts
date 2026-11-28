/**
 * G7 — FCM sync tickles (docs/SYNC_FEED.md).
 *
 * Data-only, high-priority messages that tell the phone "something changed,
 * pull /api/sync/changes". They never carry message content: the feed stays
 * the single source of truth, and nothing private passes through Google.
 *
 * Auth: on the GCE VM the access token comes from the metadata server (the
 * VM's service account, which needs roles/firebasecloudmessaging.admin).
 * Elsewhere (local dev) FCM is simply off.
 */
import { db } from './db'

const PROJECT = process.env.FCM_PROJECT_ID ?? 'propzi-imbk'
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/firebase.messaging'
const DEBOUNCE_MS = 3_000

let cached: { token: string; expiresAt: number } | null = null
let disabledUntil = 0

async function accessToken(): Promise<string | null> {
  if (process.env.FCM_DISABLED === 'true') return null
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  if (Date.now() < disabledUntil) return null
  try {
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3_000),
    })
    if (!res.ok) throw new Error(`metadata ${res.status}`)
    const j = (await res.json()) as { access_token: string; expires_in: number }
    cached = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 }
    return cached.token
  } catch {
    // Not on GCE (local dev) — don't retry on every event.
    disabledUntil = Date.now() + 10 * 60_000
    return null
  }
}

export type SendResult = { token: string; ok: boolean; status: number; error?: string }

async function sendOne(bearer: string, token: string, data: Record<string, string>): Promise<SendResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data,
        android: { priority: 'HIGH', collapse_key: 'sync', ttl: '600s' },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.ok) return { token, ok: true, status: res.status }
  const body = await res.text().catch(() => '')
  return { token, ok: false, status: res.status, error: body.slice(0, 300) }
}

/** Send a tickle to every token of one owner. Drops tokens FCM says are dead. */
export async function sendTickle(ownerId: string, reasons: string[]): Promise<SendResult[]> {
  const bearer = await accessToken()
  if (!bearer) return []
  const { rows } = await db.query<{ token: string }>(`SELECT token FROM push_tokens WHERE user_id = $1`, [ownerId])
  if (!rows.length) return []
  const data = { type: 'sync', reasons: reasons.join(','), sentAt: new Date().toISOString() }
  const results = await Promise.all(
    rows.map((r) => sendOne(bearer, r.token, data).catch((e) => ({ token: r.token, ok: false, status: 0, error: String(e) }))),
  )
  for (const r of results) {
    if (r.ok) {
      await db.query(`UPDATE push_tokens SET last_sent_at = NOW(), failures = 0 WHERE token = $1`, [r.token])
    } else if (r.status === 404 || (r.status === 400 && /UNREGISTERED|INVALID_ARGUMENT|registration/i.test(r.error ?? ''))) {
      await db.query(`DELETE FROM push_tokens WHERE token = $1`, [r.token])
    } else if (r.status === 401 || r.status === 403) {
      cached = null // permission/credential problem — refetch next time
    } else {
      await db.query(`UPDATE push_tokens SET failures = failures + 1 WHERE token = $1`, [r.token])
    }
  }
  return results
}

// Per-owner debounce: a burst of events becomes one tickle.
const pending = new Map<string, { timer: NodeJS.Timeout; reasons: Set<string> }>()

export function scheduleTickle(ownerId: string, reason: string): void {
  const p = pending.get(ownerId)
  if (p) {
    p.reasons.add(reason)
    return
  }
  const reasons = new Set([reason])
  const timer = setTimeout(() => {
    pending.delete(ownerId)
    sendTickle(ownerId, [...reasons]).catch(() => {})
  }, DEBOUNCE_MS)
  timer.unref?.()
  pending.set(ownerId, { timer, reasons })
}

/** Redis channel event types that should wake the phone. */
export const TICKLE_EVENTS: Record<string, string> = {
  'message:new': 'message',
  'message:changed': 'message',
  'message:reaction': 'message',
  'suggestion:ready': 'draft',
  'network:nudges': 'nudges',
}
