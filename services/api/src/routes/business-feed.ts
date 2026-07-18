import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { requireFeature } from '../lib/entitlements'

// Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
// — a superset read of the same business_events table Studio's "Zuri
// Noticed" card already reads (GET /api/studio/insights's recentEvents,
// capped at 10). This is the first-class, paginated version of that same
// feed, promoting the pattern out of being just an Overview-tab card.
export async function businessFeedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/business-feed',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { cursor, limit: limitRaw, eventType, status } = request.query as {
        cursor?: string; limit?: string; eventType?: string; status?: string
      }
      const limit = Math.min(parseInt(limitRaw ?? '30', 10) || 30, 100)
      // Dismissed events are hidden by default (same convention as
      // Catalog's secondary items) — pass ?status=dismissed to see them.
      const statusFilter = status ? 'be.status = $4' : `be.status != 'dismissed'`

      const { rows } = await db.query(
        `SELECT be.id, be.event_type, be.confidence, be.evidence, be.payload, be.status,
                be.bundle_id, be.created_at,
                COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
         FROM business_events be
         LEFT JOIN contacts c ON c.id = be.contact_id
         WHERE be.user_id = $1 AND ($2::timestamptz IS NULL OR be.created_at < $2)
           AND ($3::text IS NULL OR be.event_type = $3)
           AND ${statusFilter}
         ORDER BY be.created_at DESC
         LIMIT $${status ? 5 : 4}`,
        status
          ? [userId, cursor ?? null, eventType ?? null, status, limit]
          : [userId, cursor ?? null, eventType ?? null, limit],
      )

      return reply.send({
        events: rows.map((r: any) => ({
          id: r.id,
          eventType: r.event_type,
          confidence: r.confidence !== null ? parseFloat(r.confidence) : null,
          evidence: r.evidence ?? [],
          payload: r.payload ?? {},
          status: r.status,
          bundleId: r.bundle_id,
          contactName: r.contact_name,
          createdAt: r.created_at,
        })),
        nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null,
      })
    },
  )

  fastify.post(
    '/api/business-feed/:id/dismiss',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE business_events SET status = 'dismissed' WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Event not found' })
      return reply.send({ ok: true })
    },
  )
}
