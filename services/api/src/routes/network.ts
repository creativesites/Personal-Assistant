/**
 * Networking (docs/ZURI_AI_PLAN.md Part C): the warm list, Zuri's
 * suggestions for it, and keep-warm nudges.
 *
 *   GET    /api/network/warm-list
 *   PUT    /api/network/contacts/:contactId   { tier: key|important|dismissed, role?, note? }
 *   DELETE /api/network/contacts/:contactId
 *   GET    /api/network/suggestions
 *   GET    /api/network/nudges?status=pending
 *   POST   /api/network/nudges/:id            { action: sent|snooze|dismiss, sentMessages?, snoozeDays? }
 *   POST   /api/network/nudges/run            make today's nudges now
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { getEffectiveScope } from '../lib/org-scope'
import { avatarTag } from './sync-avatars'
import { warmthFor } from '../lib/network-warmth'
import { runNudgesFor } from '../lib/network-nudges'

const ROLES = ['client', 'prospect', 'partner', 'investor', 'mentor', 'supplier', 'peer', 'community', 'other'] as const
const BUSINESS_REL = ['client', 'customer', 'business_contact', 'supplier', 'vendor', 'lead', 'prospect', 'colleague']
const UUID = /^[0-9a-f-]{36}$/i

type ContactRow = { id: string; name: string; avatar_url: string | null; company: string | null; job_title: string | null }

function contactCard(c: ContactRow) {
  return { contactId: c.id, name: c.name, avatarTag: c.avatar_url ? avatarTag(c.avatar_url) : null,
           company: c.company, jobTitle: c.job_title }
}

export async function networkRoutes(fastify: FastifyInstance) {
  fastify.get('/api/network/warm-list', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const { rows } = await db.query<ContactRow & { tier: string; role: string | null; note: string | null; added_by: string }>(
      `SELECT co.id, COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'This contact') AS name,
              co.avatar_url, co.company, co.job_title, nc.tier, nc.role, nc.note, nc.added_by
       FROM network_contacts nc JOIN contacts co ON co.id = nc.contact_id
       WHERE nc.user_id = $1 AND nc.tier IN ('key', 'important') AND co.merged_into_id IS NULL`,
      [ownerId],
    )
    const warmth = await warmthFor(ownerId, rows.map((r) => r.id))
    const { rows: pending } = await db.query<{ contact_id: string }>(
      `SELECT contact_id FROM network_nudges WHERE user_id = $1 AND status = 'pending'`, [ownerId])
    const nudged = new Set(pending.map((p) => p.contact_id))
    const list = rows.map((r) => ({
      ...contactCard(r), tier: r.tier, role: r.role, note: r.note, addedBy: r.added_by,
      ...warmth.get(r.id)!, hasPendingNudge: nudged.has(r.id),
    }))
    // Coldest key contacts first; anyone waiting on a reply jumps the queue.
    list.sort((a, b) => Number(b.waitingOnYou) - Number(a.waitingOnYou)
      || (a.tier === b.tier ? 0 : a.tier === 'key' ? -1 : 1) || a.warmth - b.warmth)
    const counts = { warm: 0, cooling: 0, cold: 0, new: 0 }
    for (const c of list) counts[c.status]++
    return reply.send({ contacts: list, counts })
  })

  fastify.put('/api/network/contacts/:contactId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }
    if (!UUID.test(contactId)) return reply.code(400).send({ error: 'invalid_id' })
    const body = z.object({
      tier: z.enum(['key', 'important', 'dismissed']),
      role: z.enum(ROLES).nullish(),
      note: z.string().max(500).nullish(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'invalid_body', details: body.error.flatten() })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const { rows: [c] } = await db.query<{ is_group: boolean }>(
      `SELECT is_group FROM contacts WHERE id = $1 AND user_id = $2`, [contactId, ownerId])
    if (!c) return reply.code(404).send({ error: 'not_found' })
    if (c.is_group) return reply.code(422).send({ error: 'group_chat' })
    await db.query(
      `INSERT INTO network_contacts (user_id, contact_id, tier, role, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, contact_id) DO UPDATE SET tier = EXCLUDED.tier,
         role = COALESCE(EXCLUDED.role, network_contacts.role),
         note = COALESCE(EXCLUDED.note, network_contacts.note), updated_at = NOW()`,
      [ownerId, contactId, body.data.tier, body.data.role ?? null, body.data.note ?? null],
    )
    if (body.data.tier === 'dismissed') {
      await db.query(`UPDATE network_nudges SET status = 'dismissed', decided_at = NOW()
                      WHERE user_id = $1 AND contact_id = $2 AND status = 'pending'`, [ownerId, contactId])
    }
    return reply.code(204).send()
  })

  fastify.delete('/api/network/contacts/:contactId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }
    if (!UUID.test(contactId)) return reply.code(400).send({ error: 'invalid_id' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const { rowCount } = await db.query(`DELETE FROM network_contacts WHERE user_id = $1 AND contact_id = $2`, [ownerId, contactId])
    await db.query(`UPDATE network_nudges SET status = 'dismissed', decided_at = NOW()
                    WHERE user_id = $1 AND contact_id = $2 AND status = 'pending'`, [ownerId, contactId])
    return rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' })
  })

  // Contacts that look like business connections, for the owner to add.
  fastify.get('/api/network/suggestions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const { rows } = await db.query<ContactRow & { relationship_type: string | null; is_business: boolean;
      customer_status: string | null; msgs: number; biz_msgs: number; last_at: Date }>(
      `SELECT co.id, COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'This contact') AS name,
              co.avatar_url, co.company, co.job_title, co.is_business, co.customer_status, r.relationship_type,
              s.msgs, s.biz_msgs, s.last_at
       FROM contacts co
       JOIN conversations cv ON cv.contact_id = co.id AND cv.user_id = co.user_id
       LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = co.user_id
       JOIN LATERAL (
         SELECT COUNT(*)::int AS msgs, MAX(m.whatsapp_timestamp) AS last_at,
                COUNT(*) FILTER (WHERE m.body ~* '\\m(invoice|quot|proposal|contract|project|website|app|payment|deposit|meeting|client|deal|budget|launch|design|logo|domain|hosting|software|system|business|partner)')::int AS biz_msgs
         FROM messages m WHERE m.conversation_id = cv.id
       ) s ON TRUE
       WHERE co.user_id = $1 AND NOT co.is_group AND co.merged_into_id IS NULL AND NOT co.is_partner
         AND s.msgs >= 15 AND s.last_at > NOW() - INTERVAL '365 days'
         AND NOT EXISTS (SELECT 1 FROM network_contacts nc WHERE nc.user_id = co.user_id AND nc.contact_id = co.id)
         AND COALESCE(r.relationship_type, '') NOT IN ('family', 'partner', 'spouse')`,
      [ownerId],
    )
    const scored = rows.map((r) => {
      const why: string[] = []
      let score = 0
      if (r.relationship_type && BUSINESS_REL.includes(r.relationship_type)) { score += 3; why.push(r.relationship_type.replace('_', ' ')) }
      if (r.is_business) { score += 2; why.push('business account') }
      if (r.company || r.job_title) { score += 2; why.push([r.job_title, r.company].filter(Boolean).join(' at ')) }
      if (r.customer_status && r.customer_status !== 'contact') { score += 2; why.push(r.customer_status) }
      if (r.biz_msgs >= 3) { score += Math.min(4, Math.floor(r.biz_msgs / 3)); why.push(`${r.biz_msgs} work-related messages`) }
      return { r, score, why }
    }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 25)
    const warmth = await warmthFor(ownerId, scored.map((x) => x.r.id))
    return reply.send({
      suggestions: scored.map(({ r, why }) => ({
        ...contactCard(r), why, messageCount: r.msgs,
        warmth: warmth.get(r.id)?.warmth ?? null, status: warmth.get(r.id)?.status ?? null,
      })),
    })
  })

  fastify.get('/api/network/nudges', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const status = (request.query as { status?: string }).status ?? 'pending'
    const { rows } = await db.query(
      `SELECT n.id, n.contact_id, n.reason, n.warmth, n.messages, n.model, n.skipped_before, n.status,
              n.snooze_until, n.created_at,
              COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number, 'This contact') AS name,
              co.avatar_url, nc.tier, nc.role,
              (SELECT cv.id FROM conversations cv WHERE cv.contact_id = co.id AND cv.user_id = n.user_id
               ORDER BY cv.last_message_at DESC NULLS LAST LIMIT 1) AS conversation_id
       FROM network_nudges n JOIN contacts co ON co.id = n.contact_id
       LEFT JOIN network_contacts nc ON nc.user_id = n.user_id AND nc.contact_id = n.contact_id
       WHERE n.user_id = $1 AND ($2 = 'all' OR n.status = $2)
       ORDER BY n.created_at DESC LIMIT 50`,
      [ownerId, status],
    )
    return reply.send({
      nudges: rows.map((n) => ({
        id: n.id, contactId: n.contact_id, conversationId: n.conversation_id, name: n.name,
        avatarTag: n.avatar_url ? avatarTag(n.avatar_url) : null, tier: n.tier, role: n.role,
        reason: n.reason, warmth: n.warmth, messages: n.messages ?? [], model: n.model,
        skippedBefore: n.skipped_before, status: n.status,
        snoozeUntil: n.snooze_until ? new Date(n.snooze_until).getTime() : null,
        createdAt: new Date(n.created_at).getTime(),
      })),
    })
  })

  fastify.post('/api/network/nudges/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    if (!UUID.test(id)) return reply.code(400).send({ error: 'invalid_id' })
    const body = z.object({
      action: z.enum(['sent', 'snooze', 'dismiss']),
      snoozeDays: z.number().int().min(1).max(60).default(3),
      sentMessages: z.array(z.string().max(4000)).max(5).optional(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const status = body.data.action === 'sent' ? 'sent' : body.data.action === 'snooze' ? 'snoozed' : 'dismissed'
    const { rowCount } = await db.query(
      `UPDATE network_nudges
       SET status = $3::text, decided_at = NOW(),
           snooze_until = CASE WHEN $3::text = 'snoozed' THEN NOW() + make_interval(days => $4::int) ELSE NULL END,
           messages = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE messages END
       WHERE id = $1 AND user_id = $2`,
      [id, ownerId, status, body.data.snoozeDays, body.data.sentMessages ? JSON.stringify(body.data.sentMessages) : null],
    )
    return rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' })
  })

  fastify.post('/api/network/nudges/run', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const made = await runNudgesFor(ownerId)
    return reply.send({ made })
  })
}
