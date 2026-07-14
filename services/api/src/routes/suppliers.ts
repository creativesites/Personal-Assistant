import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const createBody = z.object({
  company: z.string().min(1).max(255),
  contact: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  averageDeliveryTime: z.number().int().nonnegative().optional(),
  reliabilityScore: z.number().min(0).max(100).optional(),
  minimumOrder: z.number().nonnegative().optional(),
  paymentTerms: z.string().optional().nullable(),
  outstandingBalance: z.number().optional(),
  notes: z.string().optional().nullable(),
})

const patchBody = z.object({
  company: z.string().min(1).max(255).optional(),
  contact: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  averageDeliveryTime: z.number().int().nonnegative().optional(),
  reliabilityScore: z.number().min(0).max(100).optional(),
  minimumOrder: z.number().nonnegative().optional(),
  paymentTerms: z.string().optional().nullable(),
  outstandingBalance: z.number().optional(),
  notes: z.string().optional().nullable(),
})

type SupplierRow = {
  id: string
  company: string
  contact: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  average_delivery_time: number
  reliability_score: string
  minimum_order: string
  payment_terms: string | null
  outstanding_balance: string
  notes: string | null
  created_at: string
  updated_at: string
}

function toApiShape(s: SupplierRow) {
  return {
    id: s.id,
    company: s.company,
    contact: s.contact,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    averageDeliveryTime: s.average_delivery_time,
    reliabilityScore: Number(s.reliability_score),
    minimumOrder: Number(s.minimum_order),
    paymentTerms: s.payment_terms,
    outstandingBalance: Number(s.outstanding_balance),
    notes: s.notes,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }
}

export async function suppliersRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/suppliers — list all suppliers for user ──
  fastify.get(
    '/api/suppliers',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<SupplierRow>(
        `SELECT id, company, contact, phone, whatsapp, email,
                average_delivery_time, reliability_score, minimum_order,
                payment_terms, outstanding_balance, notes, created_at, updated_at
         FROM suppliers
         WHERE user_id = $1
         ORDER BY company ASC`,
        [userId],
      )

      return reply.send({ suppliers: rows.map(toApiShape) })
    },
  )

  // ── POST /api/suppliers — create supplier ──
  fastify.post(
    '/api/suppliers',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [supplier] } = await db.query<SupplierRow>(
        `INSERT INTO suppliers (
           user_id, company, contact, phone, whatsapp, email,
           average_delivery_time, reliability_score, minimum_order,
           payment_terms, outstanding_balance, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 5), COALESCE($8, 100.00), COALESCE($9, 0.00), $10, COALESCE($11, 0.00), $12)
         RETURNING id, company, contact, phone, whatsapp, email,
                   average_delivery_time, reliability_score, minimum_order,
                   payment_terms, outstanding_balance, notes, created_at, updated_at`,
        [
          userId,
          body.company,
          body.contact ?? null,
          body.phone ?? null,
          body.whatsapp ?? null,
          body.email ?? null,
          body.averageDeliveryTime ?? null,
          body.reliabilityScore ?? null,
          body.minimumOrder ?? null,
          body.paymentTerms ?? null,
          body.outstandingBalance ?? null,
          body.notes ?? null,
        ],
      )

      return reply.code(201).send({ supplier: toApiShape(supplier) })
    },
  )

  // ── PATCH /api/suppliers/:id — update supplier ──
  fastify.patch(
    '/api/suppliers/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3

      if (body.company !== undefined) { sets.push(`company = $${idx++}`); values.push(body.company) }
      if (body.contact !== undefined) { sets.push(`contact = $${idx++}`); values.push(body.contact) }
      if (body.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(body.phone) }
      if (body.whatsapp !== undefined) { sets.push(`whatsapp = $${idx++}`); values.push(body.whatsapp) }
      if (body.email !== undefined) { sets.push(`email = $${idx++}`); values.push(body.email) }
      if (body.averageDeliveryTime !== undefined) { sets.push(`average_delivery_time = $${idx++}`); values.push(body.averageDeliveryTime) }
      if (body.reliabilityScore !== undefined) { sets.push(`reliability_score = $${idx++}`); values.push(body.reliabilityScore) }
      if (body.minimumOrder !== undefined) { sets.push(`minimum_order = $${idx++}`); values.push(body.minimumOrder) }
      if (body.paymentTerms !== undefined) { sets.push(`payment_terms = $${idx++}`); values.push(body.paymentTerms) }
      if (body.outstandingBalance !== undefined) { sets.push(`outstanding_balance = $${idx++}`); values.push(body.outstandingBalance) }
      if (body.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(body.notes) }

      const { rowCount } = await db.query(
        `UPDATE suppliers SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Supplier not found' })

      return reply.send({ ok: true })
    },
  )

  // ── DELETE /api/suppliers/:id — delete supplier ──
  fastify.delete(
    '/api/suppliers/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        'DELETE FROM suppliers WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Supplier not found' })

      return reply.send({ ok: true })
    },
  )
}
