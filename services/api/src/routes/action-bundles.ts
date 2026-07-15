import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

// Business OS Phase E — the conversation-to-automation loop. See
// docs/BUSINESS_OS_PLAN.md §15/§16. A passive detector in the intelligence
// service (action_bundles.py) proposes a bundle of related actions from an
// ordinary WhatsApp conversation; this is the CRUD layer the Inbox reads
// from and updates once the user approves/dismisses. Action *execution*
// stays client-side (the same {type, params} dispatch the [ACTION: ...]
// chat-tag system already has) — this route only tracks the bundle's
// lifecycle, not what each action does.

const patchBody = z.object({
  status: z.enum(['approved', 'partially_approved', 'dismissed']),
})

function bundleApiShape(r: any) {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name ?? null,
    conversationId: r.conversation_id,
    summary: r.summary,
    actions: r.actions,
    status: r.status,
    detectedAt: r.detected_at,
    resolvedAt: r.resolved_at,
  }
}

export async function actionBundlesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/action-bundles',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { status, contactId } = request.query as { status?: string; contactId?: string }

      const conditions = ['ab.user_id = $1']
      const params: any[] = [userId]
      if (status) { params.push(status); conditions.push(`ab.status = $${params.length}`) }
      if (contactId) { params.push(contactId); conditions.push(`ab.contact_id = $${params.length}`) }

      const { rows } = await db.query(
        `SELECT ab.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
         FROM action_bundles ab
         LEFT JOIN contacts c ON c.id = ab.contact_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ab.detected_at DESC
         LIMIT 50`,
        params,
      )

      return reply.send({ bundles: rows.map(bundleApiShape) })
    },
  )

  fastify.patch(
    '/api/action-bundles/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const { rowCount } = await db.query(
        `UPDATE action_bundles SET status = $1, resolved_at = NOW()
         WHERE id = $2 AND user_id = $3`,
        [body.status, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Action bundle not found' })

      return reply.send({ ok: true })
    },
  )
}
