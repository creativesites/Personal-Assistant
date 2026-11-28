/**
 * Idempotent sends (mobile plan G4, migration 0141).
 *
 * claimSendKey() records an Idempotency-Key before the send. A retry with the
 * same key gets the stored response back (replay) instead of a second
 * WhatsApp message. A key reused with a different request is refused, and a
 * claim whose send never finished (crash) can be retried after STALE_MS.
 */
import crypto from 'crypto'
import { db } from './db'

const STALE_MS = 60_000
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/

export type Claim =
  | { kind: 'new' }
  | { kind: 'replay'; response: unknown }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' }
  | { kind: 'invalid' }

export function requestHash(parts: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export async function claimSendKey(userId: string, key: string, conversationId: string, hash: string): Promise<Claim> {
  if (!KEY_RE.test(key)) return { kind: 'invalid' }
  const { rows: [inserted] } = await db.query(
    `INSERT INTO send_idempotency_keys (user_id, key, conversation_id, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, key) DO NOTHING RETURNING key`,
    [userId, key, conversationId, hash],
  )
  if (inserted) return { kind: 'new' }
  const { rows: [row] } = await db.query<{ request_hash: string; conversation_id: string; response: unknown; created_at: Date }>(
    `SELECT request_hash, conversation_id, response, created_at FROM send_idempotency_keys WHERE user_id = $1 AND key = $2`,
    [userId, key],
  )
  if (!row) return { kind: 'new' }
  if (row.request_hash !== hash || row.conversation_id !== conversationId) return { kind: 'mismatch' }
  if (row.response) return { kind: 'replay', response: row.response }
  if (Date.now() - new Date(row.created_at).getTime() < STALE_MS) return { kind: 'in_progress' }
  // The first attempt never finished: take the claim over.
  const { rowCount } = await db.query(
    `UPDATE send_idempotency_keys SET created_at = NOW()
     WHERE user_id = $1 AND key = $2 AND response IS NULL AND created_at < NOW() - make_interval(secs => $3)`,
    [userId, key, STALE_MS / 1000],
  )
  return rowCount ? { kind: 'new' } : { kind: 'in_progress' }
}

export async function completeSendKey(userId: string, key: string, messageId: string | null, response: unknown) {
  await db.query(
    `UPDATE send_idempotency_keys SET message_id = $3, response = $4::jsonb WHERE user_id = $1 AND key = $2`,
    [userId, key, messageId, JSON.stringify(response)],
  )
}

/** The send failed before anything went out: let the client retry with the same key. */
export async function releaseSendKey(userId: string, key: string) {
  await db.query(`DELETE FROM send_idempotency_keys WHERE user_id = $1 AND key = $2 AND response IS NULL`, [userId, key])
}

export async function pruneSendKeys() {
  await db.query(`DELETE FROM send_idempotency_keys WHERE created_at < NOW() - INTERVAL '7 days'`)
}
