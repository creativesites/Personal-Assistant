/**
 * GET /api/sync/contacts/:id/avatar — a contact's WhatsApp profile picture as
 * bytes, for devices (mobile plan G3; the feed carries hasAvatar/avatarTag).
 *
 * contacts.avatar_url is a WhatsApp CDN link that expires, so the server
 * fetches it, caches the JPEG under MEDIA_DIR/avatars, and asks the WhatsApp
 * session for a fresh link when the old one has gone stale. The ETag is the
 * same value as the feed's avatarTag, so a device only refetches when the
 * picture actually changed.
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { getEffectiveScope } from '../lib/org-scope'

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media'
const MAX_BYTES = 2 * 1024 * 1024

export function avatarTag(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null
  } catch {
    return null
  }
}

async function freshUrl(ownerId: string, jid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001'}/session/${ownerId}/profile-picture/${encodeURIComponent(jid)}`,
      { headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '' }, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return null
    return ((await res.json()) as { avatarUrl?: string | null }).avatarUrl ?? null
  } catch {
    return null
  }
}

export async function syncAvatarRoutes(fastify: FastifyInstance) {
  fastify.get('/api/sync/contacts/:id/avatar', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'Invalid id' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId

    const { rows: [c] } = await db.query<{ avatar_url: string | null; whatsapp_jid: string | null }>(
      `SELECT avatar_url, whatsapp_jid FROM contacts WHERE id = $1 AND user_id = $2`,
      [id, ownerId],
    )
    if (!c || !c.avatar_url) return reply.code(404).send({ error: 'no_avatar' })

    let url = c.avatar_url
    let tag = avatarTag(url)
    if (request.headers['if-none-match'] === `"${tag}"`) return reply.code(304).send()

    const dir = path.join(MEDIA_DIR, 'avatars', ownerId)
    const file = (t: string) => path.join(dir, `${id}.${t}.jpg`)

    let bytes: Buffer | null = await fs.readFile(file(tag)).catch(() => null)
    if (!bytes) {
      bytes = await download(url)
      if (!bytes && c.whatsapp_jid) {
        // The CDN link expired: ask WhatsApp for a new one.
        const next = await freshUrl(ownerId, c.whatsapp_jid)
        if (next && next !== url) {
          bytes = await download(next)
          if (bytes) {
            url = next
            tag = avatarTag(url)
            await db.query(
              `UPDATE contacts SET avatar_url = $1, avatar_last_fetched_at = NOW() WHERE id = $2 AND user_id = $3`,
              [url, id, ownerId],
            )
          }
        }
      }
      if (!bytes) return reply.code(404).send({ error: 'no_avatar' })
      await fs.mkdir(dir, { recursive: true })
      for (const old of await fs.readdir(dir).catch(() => [] as string[])) {
        if (old.startsWith(`${id}.`)) await fs.unlink(path.join(dir, old)).catch(() => {})
      }
      await fs.writeFile(file(tag), bytes).catch(() => {})
    }

    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .header('ETag', `"${tag}"`)
      .send(bytes)
  })
}
