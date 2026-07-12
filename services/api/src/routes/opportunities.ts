import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const patchBody = z.object({
  status: z.enum(['open', 'acted_on', 'dismissed', 'expired']).optional(),
  linkedDealId: z.string().uuid().nullable().optional(),
})

type OpportunityRow = {
  id: string
  contact_id: string
  contact_name: string | null
  opportunity_type: string
  title: string
  description: string | null
  estimated_value_cents: string | null
  confidence: string
  status: string
  linked_deal_id: string | null
  detected_at: string
  expires_at: string | null
  resolved_at: string | null
}

function toApiShape(o: OpportunityRow) {
  return {
    id: o.id,
    contactId: o.contact_id,
    contactName: o.contact_name,
    opportunityType: o.opportunity_type,
    title: o.title,
    description: o.description,
    estimatedValueCents: o.estimated_value_cents !== null ? parseInt(o.estimated_value_cents, 10) : null,
    confidence: parseFloat(o.confidence),
    status: o.status,
    linkedDealId: o.linked_deal_id,
    detectedAt: o.detected_at,
    expiresAt: o.expires_at,
    resolvedAt: o.resolved_at,
  }
}

const SELECT_OPPORTUNITY = `
  SELECT o.id, o.contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
         o.opportunity_type, o.title, o.description, o.estimated_value_cents, o.confidence,
         o.status, o.linked_deal_id, o.detected_at, o.expires_at, o.resolved_at
  FROM opportunities o
  JOIN contacts c ON c.id = o.contact_id
`

export async function opportunitiesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/opportunities — list, optionally filtered ───────────────────
  fastify.get(
    '/api/opportunities',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as { contactId?: string; status?: string; type?: string }

      const filters: string[] = ['o.user_id = $1', '(o.expires_at IS NULL OR o.expires_at > NOW())']
      const params: unknown[] = [userId]
      let idx = 2

      if (query.contactId) {
        filters.push(`o.contact_id = $${idx++}`)
        params.push(query.contactId)
      }
      filters.push(`o.status = $${idx++}`)
      params.push(query.status ?? 'open')
      if (query.type) {
        filters.push(`o.opportunity_type = $${idx++}`)
        params.push(query.type)
      }

      const { rows } = await db.query<OpportunityRow>(
        `${SELECT_OPPORTUNITY} WHERE ${filters.join(' AND ')} ORDER BY o.confidence DESC, o.detected_at DESC LIMIT 100`,
        params,
      )

      return reply.send({ opportunities: rows.map(toApiShape) })
    },
  )

  // ── PATCH /api/opportunities/:id ──────────────────────────────────────────
  fastify.patch(
    '/api/opportunities/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const { rows: [existing] } = await db.query<{ id: string }>(
        `SELECT id FROM opportunities WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Opportunity not found' })

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1
      if (body.status !== undefined) {
        updates.push(`status = $${idx++}`); values.push(body.status)
        updates.push(`resolved_at = ${body.status === 'open' ? 'NULL' : 'NOW()'}`)
      }
      if (body.linkedDealId !== undefined) { updates.push(`linked_deal_id = $${idx++}`); values.push(body.linkedDealId) }

      if (updates.length === 0) return reply.code(400).send({ error: 'No fields to update' })

      updates.push('updated_at = NOW()')
      values.push(id, userId)

      await db.query(
        `UPDATE opportunities SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        values,
      )

      const { rows: [opportunity] } = await db.query<OpportunityRow>(`${SELECT_OPPORTUNITY} WHERE o.id = $1`, [id])
      return reply.send({ opportunity: toApiShape(opportunity) })
    },
  )
}
