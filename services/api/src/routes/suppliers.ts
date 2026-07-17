import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('business_os')]

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
    { preHandler: gate },
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
    { preHandler: gate },
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
    { preHandler: gate },
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
    { preHandler: gate },
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

  // ── Supplier products — per-supplier pricing/lead-time for a catalog item
  // (Business OS Phase B, see docs/BUSINESS_OS_PLAN.md §8.2). A product can
  // be sourced from more than one supplier at different costs, which a
  // single products.supplier_id FK can't express. ──

  const supplierProductBody = z.object({
    cost: z.number().nonnegative().optional().nullable(),
    leadTimeDays: z.number().int().nonnegative().optional().nullable(),
    minimumQty: z.number().int().positive().optional().nullable(),
  })

  function supplierProductApiShape(r: any) {
    return {
      supplierId: r.supplier_id,
      productId: r.product_id,
      productName: r.product_name ?? undefined,
      supplierName: r.supplier_name ?? undefined,
      cost: r.cost != null ? Number(r.cost) : null,
      leadTimeDays: r.lead_time_days ?? null,
      minimumQty: r.minimum_qty ?? null,
      updatedAt: r.updated_at,
    }
  }

  // GET /api/suppliers/:id/products — everything this supplier can source
  fastify.get(
    '/api/suppliers/:id/products',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT sp.*, p.name AS product_name
         FROM supplier_products sp
         JOIN products p ON p.id = sp.product_id AND p.user_id = $1
         WHERE sp.supplier_id = $2
         ORDER BY p.name ASC`,
        [userId, id],
      )

      return reply.send({ supplierProducts: rows.map(supplierProductApiShape) })
    },
  )

  // GET /api/products/:id/suppliers — every supplier that can source this
  // product, cheapest first (used to auto-pick a supplier for a suggested PO)
  fastify.get(
    '/api/products/:id/suppliers',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT sp.*, s.company AS supplier_name
         FROM supplier_products sp
         JOIN suppliers s ON s.id = sp.supplier_id AND s.user_id = $1
         WHERE sp.product_id = $2
         ORDER BY sp.cost ASC NULLS LAST`,
        [userId, id],
      )

      return reply.send({ supplierProducts: rows.map(supplierProductApiShape) })
    },
  )

  // PUT /api/suppliers/:id/products/:productId — upsert
  fastify.put(
    '/api/suppliers/:id/products/:productId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, productId } = request.params as { id: string; productId: string }
      const body = supplierProductBody.parse(request.body)

      const { rows: [supplier] } = await db.query('SELECT id FROM suppliers WHERE id = $1 AND user_id = $2', [id, userId])
      if (!supplier) return reply.code(404).send({ error: 'Supplier not found' })
      const { rows: [product] } = await db.query('SELECT id FROM products WHERE id = $1 AND user_id = $2', [productId, userId])
      if (!product) return reply.code(404).send({ error: 'Product not found' })

      const { rows: [row] } = await db.query(
        `INSERT INTO supplier_products (supplier_id, product_id, cost, lead_time_days, minimum_qty)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (supplier_id, product_id) DO UPDATE SET
           cost = EXCLUDED.cost, lead_time_days = EXCLUDED.lead_time_days,
           minimum_qty = EXCLUDED.minimum_qty, updated_at = NOW()
         RETURNING *`,
        [id, productId, body.cost ?? null, body.leadTimeDays ?? null, body.minimumQty ?? null],
      )

      return reply.code(201).send({ supplierProduct: supplierProductApiShape(row) })
    },
  )

  // DELETE /api/suppliers/:id/products/:productId
  fastify.delete(
    '/api/suppliers/:id/products/:productId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, productId } = request.params as { id: string; productId: string }

      const { rowCount } = await db.query(
        `DELETE FROM supplier_products
         WHERE supplier_id = $1 AND product_id = $2
           AND supplier_id IN (SELECT id FROM suppliers WHERE user_id = $3)`,
        [id, productId, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Not found' })

      return reply.send({ ok: true })
    },
  )
}
