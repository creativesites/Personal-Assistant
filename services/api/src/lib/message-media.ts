import * as fs from 'fs'
import * as path from 'path'
import { db } from './db'
import { config } from '../config'

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media'

export class MessageMediaError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message) }
}

/** Keep in sync with services/whatsapp/src/lib/media-store.ts mediaPathFor(). */
function mediaPathFor(userId: string, messageId: string): string {
  return path.join(MEDIA_DIR, userId, messageId)
}

/**
 * Local file for a message's WhatsApp media, downloading it through the
 * WhatsApp service on first use. Only resolves messages owned by `userId`.
 */
export async function ensureMessageMedia(
  userId: string,
  messageId: string,
): Promise<{ path: string; mimeType: string }> {
  const { rows: [row] } = await db.query<{ media_mime_type: string | null; has_meta: boolean }>(
    `SELECT m.media_mime_type, m.media_meta IS NOT NULL AS has_meta
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE m.id = $1 AND c.user_id = $2`,
    [messageId, userId],
  )
  if (!row) throw new MessageMediaError('Message not found', 404)

  const file = mediaPathFor(userId, messageId)
  const mimeType = row.media_mime_type?.split(';')[0].trim() || 'application/octet-stream'
  if (fs.existsSync(file)) return { path: file, mimeType }
  if (!row.has_meta) throw new MessageMediaError('Media is not available for this message', 404)

  const res = await fetch(
    `${process.env.WHATSAPP_SERVICE_URL ?? config.WHATSAPP_SERVICE_URL}/internal/media/${userId}/${messageId}`,
    { method: 'POST', signal: AbortSignal.timeout(90_000) },
  ).catch(() => null)
  if (!res) throw new MessageMediaError('WhatsApp service unreachable', 503)
  if (!res.ok || !fs.existsSync(file)) {
    throw new MessageMediaError('WhatsApp no longer has this media', 404)
  }
  return { path: file, mimeType }
}
