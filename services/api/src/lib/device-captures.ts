/**
 * Phone-captured message reconciliation (mobile plan G5,
 * docs/mobile/DATA_OWNERSHIP_AND_SYNC.md §6, migration 0140).
 *
 * The phone sees WhatsApp messages through notifications: text, chat, sender
 * and time, but no WhatsApp message id. The WhatsApp link (Baileys) usually
 * stores the same message too, a few seconds earlier or later. So a capture
 * is never turned into a message straight away:
 *
 *  1. On upload, it is matched against Baileys rows in the same chat
 *     (same direction, same sender for groups, text equal / truncated /
 *     ≥ 95% similar or the same media kind, within ±120 s).
 *  2. Unmatched captures wait WAIT_MS. The worker then matches again, and if
 *     Baileys still has nothing, creates the message (capture_source='device').
 *  3. If Baileys delivers that message later anyway (e.g. after reconnecting),
 *     the device row is deleted (the feed sends a tombstone) and the capture
 *     points at the Baileys row.
 *
 * Several equally good candidates → 'ambiguous': never auto-merged.
 */
import { db } from './db'
import { getInboxConversation, publishInboxEvent } from './inbox-events'

export const WAIT_MS = 3 * 60_000
const WINDOW_SEC = 120

export type CaptureInput = {
  clientId: string
  source: string
  chatKey: string
  chatKeyKind: 'jid' | 'title'
  isGroup: boolean
  senderKey?: string | null
  senderName?: string | null
  fromMe: boolean
  text?: string | null
  placeholderKind?: string | null
  sentAt: number
  fingerprint?: string | null
}

type CaptureRow = {
  id: string
  user_id: string
  client_id: string
  chat_key: string
  chat_key_kind: string
  is_group: boolean
  sender_name: string | null
  from_me: boolean
  text: string | null
  placeholder_kind: string | null
  sent_at: Date
  status: string
  conversation_id: string | null
  message_id: string | null
}

const PLACEHOLDER_TYPES: Record<string, string> = {
  photo: 'image', image: 'image', video: 'video', gif: 'video', voice: 'audio', audio: 'audio',
  sticker: 'sticker', document: 'document', file: 'document', location: 'location',
  contact: 'contact_card', contact_card: 'contact_card',
}

export function normaliseText(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFKC')
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[…]+$/u, '')
    .replace(/\.{3,}$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const x = a.slice(0, 400)
  const y = b.slice(0, 400)
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length)
}

/** How well a stored message fits a capture: 0 = not the same message. */
function score(c: CaptureRow, m: { body: string | null; message_type: string; sender_display_name: string | null }): number {
  const kind = c.placeholder_kind ? PLACEHOLDER_TYPES[c.placeholder_kind.toLowerCase()] : null
  const ct = normaliseText(c.text)
  const mt = normaliseText(m.body)
  if (c.is_group && !c.from_me && c.sender_name && m.sender_display_name) {
    const a = normaliseText(c.sender_name)
    const b = normaliseText(m.sender_display_name)
    if (a && b && !a.includes(b) && !b.includes(a) && similarity(a, b) < 0.8) return 0
  }
  if (kind) {
    if (m.message_type !== kind) return 0
    // Caption, if any, must agree too.
    if (ct && mt && similarity(ct, mt) < 0.9 && !mt.startsWith(ct)) return 0
    return 0.9
  }
  if (!ct || !mt) return 0
  if (ct === mt) return 1
  // Notifications truncate long messages.
  if (ct.length >= 8 && (mt.startsWith(ct) || ct.startsWith(mt))) return 0.95
  const s = similarity(ct, mt)
  return s >= 0.95 ? s : 0
}

/** The conversation a capture belongs to, or null if it can't be told. */
export async function resolveConversation(userId: string, chatKey: string, kind: string): Promise<string | null> {
  if (kind === 'jid') {
    const { rows: [row] } = await db.query<{ id: string }>(
      `SELECT cv.id FROM conversations cv
       JOIN contacts co ON co.id = cv.contact_id
       WHERE cv.user_id = $1 AND co.merged_into_id IS NULL
         AND (co.whatsapp_jid = $2
              OR co.whatsapp_jid IN (SELECT pn_jid FROM whatsapp_lid_map WHERE user_id = $1 AND lid_jid = $2)
              OR co.whatsapp_jid IN (SELECT lid_jid FROM whatsapp_lid_map WHERE user_id = $1 AND pn_jid = $2))
       ORDER BY cv.last_message_at DESC NULLS LAST LIMIT 1`,
      [userId, chatKey],
    )
    return row?.id ?? null
  }
  // Title: only when exactly one chat has that name.
  const { rows } = await db.query<{ id: string }>(
    `SELECT cv.id FROM conversations cv JOIN contacts co ON co.id = cv.contact_id
     WHERE cv.user_id = $1 AND co.merged_into_id IS NULL
       AND lower(COALESCE(NULLIF(co.custom_name, ''), co.display_name)) = lower($2)
     LIMIT 2`,
    [userId, chatKey.trim()],
  )
  return rows.length === 1 ? rows[0].id : null
}

type MatchResult = { kind: 'one'; messageId: string } | { kind: 'none' } | { kind: 'many' }

export async function findMatch(c: CaptureRow, conversationId: string): Promise<MatchResult> {
  const { rows } = await db.query<{ id: string; body: string | null; message_type: string; sender_display_name: string | null; whatsapp_timestamp: Date }>(
    `SELECT m.id, m.body, m.message_type::text AS message_type, m.sender_display_name, m.whatsapp_timestamp
     FROM messages m
     WHERE m.conversation_id = $1 AND m.capture_source IS DISTINCT FROM 'device'
       AND m.sender_type = $2::message_sender
       AND m.whatsapp_timestamp BETWEEN $3::timestamptz - make_interval(secs => $4)
                                    AND $3::timestamptz + make_interval(secs => $4)
       AND NOT EXISTS (SELECT 1 FROM device_message_captures d
                       WHERE d.message_id = m.id AND d.status = 'matched' AND d.id <> $5)`,
    [conversationId, c.from_me ? 'user' : 'contact', c.sent_at, WINDOW_SEC, c.id],
  )
  const scored = rows
    .map((m) => ({ m, s: score(c, m), dt: Math.abs(m.whatsapp_timestamp.getTime() - c.sent_at.getTime()) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.dt - b.dt)
  if (!scored.length) return { kind: 'none' }
  if (scored.length > 1 && scored[1].s === scored[0].s && Math.abs(scored[1].dt - scored[0].dt) < 5_000) {
    return { kind: 'many' }
  }
  return { kind: 'one', messageId: scored[0].m.id }
}

async function setStatus(id: string, status: string, fields: { reason?: string | null; messageId?: string | null; conversationId?: string | null }) {
  await db.query(
    `UPDATE device_message_captures
     SET status = $2, reason = $3, message_id = COALESCE($4, message_id),
         conversation_id = COALESCE($5, conversation_id), resolved_at = NOW()
     WHERE id = $1`,
    [id, status, fields.reason ?? null, fields.messageId ?? null, fields.conversationId ?? null],
  )
}

/** Try to settle one capture. `final` = the wait is over: create if still unmatched. */
export async function reconcile(c: CaptureRow, final: boolean): Promise<{ status: string; messageId?: string; conversationId?: string }> {
  const conversationId = c.conversation_id ?? (await resolveConversation(c.user_id, c.chat_key, c.chat_key_kind))
  if (!conversationId) {
    if (final) await setStatus(c.id, 'skipped', { reason: 'unknown_chat' })
    return { status: final ? 'skipped' : 'pending' }
  }
  const match = await findMatch(c, conversationId)
  if (match.kind === 'one') {
    await setStatus(c.id, 'matched', { messageId: match.messageId, conversationId })
    return { status: 'matched', messageId: match.messageId, conversationId }
  }
  if (match.kind === 'many') {
    await setStatus(c.id, 'ambiguous', { conversationId, reason: 'several_candidates' })
    return { status: 'ambiguous', conversationId }
  }
  if (!final) {
    await db.query('UPDATE device_message_captures SET conversation_id = $2 WHERE id = $1', [c.id, conversationId])
    return { status: 'pending', conversationId }
  }
  const messageId = await createFromCapture(c, conversationId)
  await setStatus(c.id, 'created', { messageId, conversationId })
  return { status: 'created', messageId, conversationId }
}

async function createFromCapture(c: CaptureRow, conversationId: string): Promise<string> {
  const kind = c.placeholder_kind ? PLACEHOLDER_TYPES[c.placeholder_kind.toLowerCase()] ?? 'text' : 'text'
  const body = c.text?.trim() || null
  const { rows: [m] } = await db.query<{ id: string }>(
    `INSERT INTO messages
       (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp,
        sender_display_name, capture_source)
     VALUES ($1, $2, $3::message_sender, $4::message_type, $5, $6, $7, 'device')
     ON CONFLICT (conversation_id, whatsapp_message_id) DO UPDATE SET body = EXCLUDED.body
     RETURNING id`,
    [conversationId, `device:${c.client_id}`.slice(0, 255), c.from_me ? 'user' : 'contact', kind, body,
     c.sent_at, c.is_group && !c.from_me ? c.sender_name : null],
  )
  const preview = body ?? `[${c.placeholder_kind ?? 'message'}]`
  await db.query(
    `UPDATE conversations
     SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
         last_message_preview = CASE WHEN last_message_at IS NULL OR $2 >= last_message_at THEN $3 ELSE last_message_preview END,
         unread_count = unread_count + CASE WHEN $4 THEN 0 ELSE 1 END,
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, c.sent_at, preview.slice(0, 200), c.from_me],
  )
  const conversation = await getInboxConversation(c.user_id, conversationId)
  if (conversation) await publishInboxEvent(c.user_id, 'conversation:upsert', { conversation })
  await publishInboxEvent(c.user_id, 'message:new', {
    messageId: m.id, conversationId, senderType: c.from_me ? 'user' : 'contact', messageType: kind,
    body, timestamp: c.sent_at.toISOString(), source: 'device',
  })
  return m.id
}

/** Device rows that Baileys has since delivered: drop the device copy. */
export async function retireDuplicates(limit = 200): Promise<number> {
  const { rows } = await db.query<CaptureRow & { created_message_id: string }>(
    `SELECT d.*, d.message_id AS created_message_id FROM device_message_captures d
     WHERE d.status = 'created' AND d.resolved_at > NOW() - INTERVAL '7 days' AND d.message_id IS NOT NULL
     ORDER BY d.resolved_at DESC LIMIT $1`,
    [limit],
  )
  let retired = 0
  for (const c of rows) {
    if (!c.conversation_id) continue
    const match = await findMatch(c, c.conversation_id)
    if (match.kind !== 'one') continue
    await db.query(`DELETE FROM messages WHERE id = $1 AND capture_source = 'device'`, [c.created_message_id])
    await setStatus(c.id, 'matched', { messageId: match.messageId, reason: 'baileys_later' })
    retired++
  }
  return retired
}

export async function pendingDue(limit = 300): Promise<CaptureRow[]> {
  const { rows } = await db.query<CaptureRow>(
    `SELECT * FROM device_message_captures
     WHERE status = 'pending' AND received_at < NOW() - make_interval(secs => $1)
     ORDER BY received_at LIMIT $2`,
    [Math.round(WAIT_MS / 1000), limit],
  )
  return rows
}
