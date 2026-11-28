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
import { lookupAvatarUrl, storeAvatarUrl } from '../workers/avatar-backfill-worker'

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media'
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Tag from the URL's path only. WhatsApp re-signs the same picture with new
 * query parameters (oh/oe expiry), so a refreshed link to an unchanged picture
 * keeps its tag and devices don't download it again.
 */
export function avatarTag(url: string): string {
  let key = url
  try {
    const u = new URL(url)
    key = u.host + u.pathname
  } catch { /* not a URL: hash as-is */ }
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)
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

export async function syncAvatarRoutes(fastify: FastifyInstance) {
  fastify.get('/api/sync/contacts/:id/avatar', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'Invalid id' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId

    const { rows: [c] } = await db.query<{ avatar_url: string | null; whatsapp_jid: string | null; checked: boolean }>(
      `SELECT avatar_url, whatsapp_jid, avatar_last_fetched_at IS NOT NULL AS checked
       FROM contacts WHERE id = $1 AND user_id = $2`,
      [id, ownerId],
    )
    if (!c) return reply.code(404).send({ error: 'no_avatar' })
    if (!c.avatar_url && !c.checked && c.whatsapp_jid) {
      // Never looked up yet (the backfill worker hasn't reached it): ask now.
      const found = await lookupAvatarUrl(ownerId, c.whatsapp_jid)
      if (found !== undefined) await storeAvatarUrl(id, ownerId, found)
      if (found) c.avatar_url = found
    }
    if (!c.avatar_url) return reply.code(404).send({ error: 'no_avatar' })

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
        const next = await lookupAvatarUrl(ownerId, c.whatsapp_jid)
        if (next === null) {
          // The picture was removed or hidden since: devices fall back to initials.
          await storeAvatarUrl(id, ownerId, null)
        } else if (next && next !== url) {
          bytes = await download(next)
          if (bytes) {
            url = next
            tag = avatarTag(url)
            await storeAvatarUrl(id, ownerId, url)
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
