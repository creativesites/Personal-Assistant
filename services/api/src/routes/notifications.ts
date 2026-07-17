import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Membership Platform Phase 4 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — the
// /notifications frontend page has called GET /api/notifications since it
// was first built, but no backend route ever served it; the notifications
// table (migration 0009) has sat with no reader OR writer until the
// subscription-lifecycle-worker's expiry/grace-period/read-only
// transitions became its first writer this phase.

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  contact_id: string | null
  contact_name: string | null
  contact_avatar_url: string | null
}

function toApiShape(r: NotificationRow) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body ?? '',
    read: r.is_read,
    createdAt: r.created_at,
    contact: r.contact_id ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.contact_avatar_url } : undefined,
  }
}

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/notifications', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const { rows } = await db.query<NotificationRow>(
      `SELECT n.id, n.type, n.title, n.body, n.is_read, n.created_at,
              c.id AS contact_id, c.name AS contact_name, c.avatar_url AS contact_avatar_url
       FROM notifications n
       LEFT JOIN contacts c ON c.id = (n.data->>'contactId')::uuid
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [userId],
    )
    return reply.send({ notifications: rows.map(toApiShape) })
  })

  fastify.patch('/api/notifications/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rowCount } = await db.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )
    if (!rowCount) return reply.code(404).send({ error: 'Notification not found' })
    return reply.send({ ok: true })
  })

  fastify.patch('/api/notifications/read-all', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    await db.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    )
    return reply.send({ ok: true })
  })
}
