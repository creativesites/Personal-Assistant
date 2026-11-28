/**
 * POST /api/device/messages:batch — phone-captured WhatsApp messages
 * (mobile plan G5). Replaces /api/companion/message for Zuri Android: no
 * pseudo-JIDs, idempotent per (user, clientId), reconciled with the messages
 * the WhatsApp link stored. See lib/device-captures.ts for the rules.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { getEffectiveScope } from '../lib/org-scope'
import { reconcile } from '../lib/device-captures'

// A capture older than this has had every chance to arrive through the
// WhatsApp link; if Baileys still has no match, create it right away.
const LATE_MS = 10 * 60_000

const item = z.object({
  clientId: z.string().min(1).max(128),
  source: z.string().min(1).max(40).default('whatsapp'),
  chatKey: z.string().min(1).max(255),
  chatKeyKind: z.enum(['jid', 'title']).default('jid'),
  isGroup: z.boolean().default(false),
  senderKey: z.string().max(255).nullish(),
  senderName: z.string().max(255).nullish(),
  fromMe: z.boolean().default(false),
  text: z.string().max(20_000).nullish(),
  placeholderKind: z.string().max(20).nullish(),
  sentAt: z.number().int().positive(),            // ms epoch
  fingerprint: z.string().max(128).nullish(),
})
const batchBody = z.object({
  deviceId: z.string().min(1).max(128),
  items: z.array(item).min(1).max(200),
})

export async function deviceMessageRoutes(fastify: FastifyInstance) {
  // '::' is Fastify's escape for a literal ':' in the path.
  fastify.post('/api/device/messages::batch', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const parsed = batchBody.safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const now = Date.now()

    const results = []
    for (const it of parsed.data.items) {
      if (!it.text?.trim() && !it.placeholderKind) {
        results.push({ clientId: it.clientId, status: 'skipped', reason: 'empty' })
        continue
      }
      const sentAt = Math.min(it.sentAt, now + 60_000)
      const { rows: [inserted] } = await db.query(
        `INSERT INTO device_message_captures
           (user_id, client_id, device_id, source, chat_key, chat_key_kind, is_group, sender_key, sender_name,
            from_me, text, placeholder_kind, sent_at, fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13 / 1000.0), $14)
         ON CONFLICT (user_id, client_id) DO NOTHING
         RETURNING *`,
        [ownerId, it.clientId, parsed.data.deviceId, it.source, it.chatKey, it.chatKeyKind, it.isGroup,
         it.senderKey ?? null, it.senderName ?? null, it.fromMe, it.text ?? null, it.placeholderKind ?? null,
         sentAt, it.fingerprint ?? null],
      )
      if (!inserted) {
        // Already uploaded: report where it stands (idempotent retry).
        const { rows: [prev] } = await db.query(
          `SELECT status, message_id, conversation_id FROM device_message_captures WHERE user_id = $1 AND client_id = $2`,
          [ownerId, it.clientId],
        )
        results.push({ clientId: it.clientId, status: prev.status, messageId: prev.message_id ?? undefined,
                       conversationId: prev.conversation_id ?? undefined })
        continue
      }
      try {
        const r = await reconcile(inserted, now - sentAt > LATE_MS)
        results.push({ clientId: it.clientId, ...r })
      } catch (err) {
        request.log.error({ err, clientId: it.clientId }, 'device_capture_reconcile_failed')
        results.push({ clientId: it.clientId, status: 'pending' })
      }
    }
    return reply.send({ results })
  })
}
