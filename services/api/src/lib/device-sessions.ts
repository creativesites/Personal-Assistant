import { db } from './db'

/**
 * Per-device sessions for native app tokens (mobile plan G1, migration 0138).
 *
 * A token minted by /api/auth/clerk-exchange carries `sid` (device_sessions.id)
 * and `tv` (token_version). It stays valid only while that row is not revoked
 * and its token_version still matches. Web tokens carry no sid and always pass.
 *
 * Checks are cached briefly per process (one API container); revoking clears
 * the cache entry, so a logout takes effect immediately on this server.
 */

export interface SessionClaims {
  userId?: string
  sid?: string
  tv?: number
}

const CACHE_TTL_MS = 30_000
const SEEN_EVERY_MS = 5 * 60_000
const cache = new Map<string, { at: number; ok: boolean; userId: string; tv: number }>()
const lastSeenWrite = new Map<string, number>()

export function forgetDeviceSession(sid: string): void {
  cache.delete(sid)
}

/** True when the token may be used: web tokens, or a live device session. */
export async function isTokenTrusted(claims: SessionClaims | null | undefined): Promise<boolean> {
  if (!claims || !claims.sid) return true
  const { sid, tv, userId } = claims
  if (!/^[0-9a-f-]{36}$/i.test(sid) || typeof tv !== 'number' || !userId) return false

  const hit = cache.get(sid)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.ok && hit.userId === userId && hit.tv === tv
  }

  const { rows: [row] } = await db.query<{ user_id: string; token_version: number; revoked: boolean }>(
    `SELECT user_id, token_version, revoked_at IS NOT NULL AS revoked FROM device_sessions WHERE id = $1`,
    [sid],
  )
  const entry = row
    ? { at: Date.now(), ok: !row.revoked, userId: row.user_id, tv: row.token_version }
    : { at: Date.now(), ok: false, userId: '', tv: -1 }
  cache.set(sid, entry)
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string)

  const ok = entry.ok && entry.userId === userId && entry.tv === tv
  if (ok && Date.now() - (lastSeenWrite.get(sid) ?? 0) > SEEN_EVERY_MS) {
    lastSeenWrite.set(sid, Date.now())
    db.query('UPDATE device_sessions SET last_seen_at = NOW() WHERE id = $1', [sid]).catch(() => {})
  }
  return ok
}

/**
 * Start or refresh the session for (user, device). An existing live session
 * keeps its token_version, so re-exchanging doesn't kill tokens still in use;
 * a revoked one is revived with a new version, so old tokens stay dead.
 */
export async function upsertDeviceSession(
  userId: string,
  deviceId: string,
  deviceName: string | null,
  platform: string,
): Promise<{ id: string; tokenVersion: number }> {
  const { rows: [row] } = await db.query<{ id: string; token_version: number }>(
    `INSERT INTO device_sessions (user_id, device_id, device_name, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_id) DO UPDATE SET
       device_name = COALESCE(EXCLUDED.device_name, device_sessions.device_name),
       platform = EXCLUDED.platform,
       last_exchange_at = NOW(),
       token_version = device_sessions.token_version
         + CASE WHEN device_sessions.revoked_at IS NOT NULL THEN 1 ELSE 0 END,
       revoked_at = NULL
     RETURNING id, token_version`,
    [userId, deviceId, deviceName, platform],
  )
  forgetDeviceSession(row.id)
  return { id: row.id, tokenVersion: row.token_version }
}

/** Revoke one device session of this user. Returns false if it isn't theirs. */
export async function revokeDeviceSession(userId: string, sessionId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE device_sessions
     SET revoked_at = NOW(), token_version = token_version + 1
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  )
  forgetDeviceSession(sessionId)
  return (rowCount ?? 0) > 0
}
