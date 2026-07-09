import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const CATEGORIES = [
  'product', 'pricing', 'shipping', 'refund_policy', 'faq',
  'hours', 'inventory', 'promotion', 'supplier', 'tax',
  'bank_details', 'wa_template', 'brand_voice', 'objection', 'other',
] as const

const createBody = z.object({
  category: z.enum(CATEGORIES).default('other'),
  factKey: z.string().min(1).max(255),
  factValue: z.string().min(1),
})

const patchBody = z.object({
  category: z.enum(CATEGORIES).optional(),
  factValue: z.string().min(1).optional(),
})

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function businessFactsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/business-facts — list, optionally filtered ──────────────────
  fastify.get(
    '/api/business-facts',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as Record<string, string>

      const filters: string[] = ['user_id = $1']
      const params: unknown[] = [userId]
      let idx = 2

      if (query.category) {
        filters.push(`category = $${idx++}`)
        params.push(query.category)
      }
      if (query.pending === 'true') {
        filters.push('is_approved = FALSE AND is_active = TRUE')
      } else if (query.includeInactive !== 'true') {
        filters.push('is_active = TRUE')
      }

      const { rows } = await db.query<{
        id: string
        category: string
        fact_key: string
        fact_value: string
        confidence: string
        evidence_count: number
        source: string
        is_approved: boolean
        approved_at: string | null
        is_active: boolean
        created_at: string
        updated_at: string
      }>(
        `SELECT id, category, fact_key, fact_value, confidence, evidence_count,
                source, is_approved, approved_at, is_active, created_at, updated_at
         FROM business_facts
         WHERE ${filters.join(' AND ')}
         ORDER BY is_approved ASC, confidence DESC, updated_at DESC`,
        params,
      )

      return reply.send({
        facts: rows.map((f) => ({
          id: f.id,
          category: f.category,
          factKey: f.fact_key,
          factValue: f.fact_value,
          confidence: Number(f.confidence),
          evidenceCount: f.evidence_count,
          source: f.source,
          isApproved: f.is_approved,
          approvedAt: f.approved_at,
          isActive: f.is_active,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        })),
      })
    },
  )

  // ── POST /api/business-facts — manual entry, auto-approved (a human typed it) ──
  fastify.post(
    '/api/business-facts',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [fact] } = await db.query(
        `INSERT INTO business_facts (user_id, category, fact_key, fact_value, confidence, source, is_approved, approved_at)
         VALUES ($1, $2, $3, $4, 1.0, 'manual', TRUE, NOW())
         ON CONFLICT (user_id, fact_key, fact_value) DO UPDATE SET
           category = EXCLUDED.category, is_active = TRUE, is_approved = TRUE,
           approved_at = NOW(), source = 'manual', updated_at = NOW()
         RETURNING id`,
        [userId, body.category, body.factKey, body.factValue],
      )

      return reply.code(201).send({ id: fact.id })
    },
  )

  // ── PATCH /api/business-facts/:id — human edit implicitly approves ───────
  fastify.patch(
    '/api/business-facts/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      if (!body.category && !body.factValue) {
        return reply.code(400).send({ error: 'Nothing to update' })
      }

      const sets: string[] = ["source = 'manual'", 'is_approved = TRUE', 'approved_at = NOW()', 'updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3
      if (body.category) { sets.push(`category = $${idx++}`); values.push(body.category) }
      if (body.factValue) { sets.push(`fact_value = $${idx++}`); values.push(body.factValue) }

      const { rowCount } = await db.query(
        `UPDATE business_facts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Fact not found' })

      return reply.send({ ok: true })
    },
  )

  // ── POST /api/business-facts/:id/approve — approve a pending AI candidate ──
  fastify.post(
    '/api/business-facts/:id/approve',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE business_facts SET is_approved = TRUE, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Fact not found' })

      return reply.send({ ok: true })
    },
  )

  // ── POST /api/business-facts/:id/reject — soft-delete; future corroborating
  //     mentions of this exact key+value will no longer reinforce it ───────
  fastify.post(
    '/api/business-facts/:id/reject',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE business_facts SET is_active = FALSE, is_approved = FALSE, updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Fact not found' })

      return reply.send({ ok: true })
    },
  )
}
