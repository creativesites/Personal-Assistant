/**
 * Keeps contacts.avatar_url filled for chats with recent messages, so the sync
 * feed carries an avatarTag and devices show real profile pictures instead of
 * initials. Previously a URL was only fetched when someone opened the contact
 * on the web.
 *
 * Every 6 hours (first run shortly after boot), per account, it asks the
 * WhatsApp session for the picture URL of up to MAX_PER_RUN contacts, newest
 * chats first, skipping any checked in the last RECHECK_DAYS. One lookup every
 * GAP_MS, so WhatsApp never sees a burst. Groups are included (display only).
 *
 * WhatsApp answers "no picture" (none set, or hidden from the owner) with a
 * null URL: avatar_url is cleared and the device shows initials. Any error
 * (session down) stops that account's run without touching its rows.
 */
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'

const RUN_EVERY_MS = 6 * 60 * 60_000
const FIRST_RUN_MS = 2 * 60_000
const GAP_MS = 1500
const MAX_PER_RUN = 400
const RECHECK_DAYS = 3
const RECENT_DAYS = 180

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Ask the WhatsApp session for a picture URL. undefined = lookup failed. */
export async function lookupAvatarUrl(ownerId: string, jid: string): Promise<string | null | undefined> {
  try {
    const res = await fetch(
      `${process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001'}/session/${ownerId}/profile-picture/${encodeURIComponent(jid)}`,
      { headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '' }, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return undefined
    return ((await res.json()) as { avatarUrl?: string | null }).avatarUrl ?? null
  } catch {
    return undefined
  }
}

/** Store a lookup result (null = no picture) and the time it was checked. */
export async function storeAvatarUrl(contactId: string, ownerId: string, url: string | null): Promise<void> {
  await db.query(
    `UPDATE contacts SET avatar_url = $1, avatar_last_fetched_at = NOW()
     WHERE id = $2 AND user_id = $3`,
    [url, contactId, ownerId],
  )
}

async function runOnce(log: FastifyBaseLogger, isStopped: () => boolean): Promise<void> {
  const { rows } = await db.query<{ id: string; user_id: string; whatsapp_jid: string }>(
    `SELECT c.id, c.user_id, c.whatsapp_jid
     FROM contacts c
     JOIN LATERAL (
       SELECT MAX(cv.last_message_at) AS last_at FROM conversations cv WHERE cv.contact_id = c.id
     ) cv ON TRUE
     WHERE c.whatsapp_jid IS NOT NULL
       AND c.merged_into_id IS NULL
       AND cv.last_at > NOW() - make_interval(days => $1)
       AND (c.avatar_last_fetched_at IS NULL OR c.avatar_last_fetched_at < NOW() - make_interval(days => $2))
     ORDER BY cv.last_at DESC
     LIMIT $3`,
    [RECENT_DAYS, RECHECK_DAYS, MAX_PER_RUN],
  )
  const failed = new Set<string>()
  let found = 0
  let none = 0
  for (const c of rows) {
    if (isStopped()) return
    if (failed.has(c.user_id)) continue
    const url = await lookupAvatarUrl(c.user_id, c.whatsapp_jid)
    if (url === undefined) {
      failed.add(c.user_id)
      continue
    }
    await storeAvatarUrl(c.id, c.user_id, url)
    if (url) found++
    else none++
    await sleep(GAP_MS)
  }
  if (rows.length) log.info({ checked: rows.length, found, none, failedAccounts: failed.size }, 'avatar_backfill_run')
}

export function startAvatarBackfillWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await runOnce(log, () => stopped)
    } catch (err) {
      log.error({ err }, 'avatar_backfill_failed')
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, FIRST_RUN_MS)
  const interval = setInterval(tick, RUN_EVERY_MS)
  return {
    stop: () => {
      stopped = true
      clearTimeout(first)
      clearInterval(interval)
    },
  }
}
