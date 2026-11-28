/**
 * G7 — FCM token registration (docs/SYNC_FEED.md "Push tickles").
 *
 *   PUT    /api/push/tokens          { token, platform?, deviceId?, appVersion? } → 204
 *   DELETE /api/push/tokens          { token }                                    → 204
 *   POST   /api/push/test            sends one tickle now → { sent, results }
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { getEffectiveScope } from '../lib/org-scope'
import { sendTickle } from '../lib/fcm'

const registerBody = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['android']).default('android'),
  deviceId: z.string().min(1).max(128).optional(),
  appVersion: z.string().max(40).optional(),
})

export async function pushRoutes(fastify: FastifyInstance) {
  fastify.put('/api/push/tokens', { preHandler: authenticate }, async (request, reply) => {
    const parsed = registerBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() })
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const b = parsed.data
    // One token per device: a refreshed token replaces the device's old one.
    if (b.deviceId) {
      await db.query(`DELETE FROM push_tokens WHERE user_id = $1 AND device_id = $2 AND token <> $3`, [ownerId, b.deviceId, b.token])
    }
    await db.query(
      `INSERT INTO push_tokens (token, user_id, platform, device_id, app_version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
         device_id = COALESCE(EXCLUDED.device_id, push_tokens.device_id),
         app_version = COALESCE(EXCLUDED.app_version, push_tokens.app_version),
         last_seen_at = NOW(), failures = 0`,
      [b.token, ownerId, b.platform, b.deviceId ?? null, b.appVersion ?? null],
    )
    return reply.code(204).send()
  })

  fastify.delete('/api/push/tokens', { preHandler: authenticate }, async (request, reply) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' })
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    await db.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [parsed.data.token, ownerId])
    return reply.code(204).send()
  })

  fastify.post('/api/push/test', { preHandler: authenticate }, async (request) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const results = await sendTickle(ownerId, ['test'])
    return {
      sent: results.filter((r) => r.ok).length,
      results: results.map((r) => ({ ok: r.ok, status: r.status, error: r.error ?? null, token: `…${r.token.slice(-8)}` })),
    }
  })
}
