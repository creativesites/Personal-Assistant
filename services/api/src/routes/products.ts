import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const createBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  serialNumber: z.string().max(255).optional(),
  quantity: z.number().int().nonnegative().optional(),
  images: z.array(z.string()).optional(),
})

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  serialNumber: z.string().max(255).optional(),
  quantity: z.number().int().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['active', 'sold', 'archived']).optional(),
})

type ProductRow = {
  id: string
  name: string
  description: string | null
  price: string | null
  currency: string
  serial_number: string | null
  quantity: number
  images: string[]
  status: string
  created_at: string
  updated_at: string
}

function toApiShape(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price !== null ? Number(p.price) : null,
    currency: p.currency,
    serialNumber: p.serial_number,
    quantity: p.quantity,
    images: p.images,
    status: p.status,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

// Gates every route in this plugin on marketing_access, since the Studio
// product catalog is a Zuri Marketing feature, not part of Zuri WhatsApp.
// See docs/ZURI_MARKETING_EXPANSION.md §12.3.
async function requireMarketingAccess(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = request.user as { userId: string }
  const { rows: [user] } = await db.query<{ marketing_access: string }>(
    `SELECT COALESCE(marketing_access, 'none') AS marketing_access FROM users WHERE id = $1`,
    [userId],
  )
  if (!user || !['beta', 'enabled'].includes(user.marketing_access)) {
    return reply.code(403).send({ error: 'Zuri Marketing is not enabled for this account yet' })
  }
}

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/products',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<ProductRow>(
        `SELECT id, name, description, price, currency, serial_number, quantity, images, status, created_at, updated_at
         FROM products
         WHERE user_id = $1 AND status != 'archived'
         ORDER BY created_at DESC`,
        [userId],
      )

      return reply.send({ products: rows.map(toApiShape) })
    },
  )

  fastify.post(
    '/api/products',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [product] } = await db.query<ProductRow>(
        `INSERT INTO products (user_id, name, description, price, currency, serial_number, quantity, images)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'ZMW'), $6, COALESCE($7, 1), COALESCE($8, '[]'))
         RETURNING id, name, description, price, currency, serial_number, quantity, images, status, created_at, updated_at`,
        [
          userId,
          body.name,
          body.description ?? null,
          body.price ?? null,
          body.currency ?? null,
          body.serialNumber ?? null,
          body.quantity ?? null,
          body.images ? JSON.stringify(body.images) : null,
        ],
      )

      return reply.code(201).send({ product: toApiShape(product) })
    },
  )

  fastify.patch(
    '/api/products/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3
      if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name) }
      if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description) }
      if (body.price !== undefined) { sets.push(`price = $${idx++}`); values.push(body.price) }
      if (body.currency !== undefined) { sets.push(`currency = $${idx++}`); values.push(body.currency) }
      if (body.serialNumber !== undefined) { sets.push(`serial_number = $${idx++}`); values.push(body.serialNumber) }
      if (body.quantity !== undefined) { sets.push(`quantity = $${idx++}`); values.push(body.quantity) }
      if (body.images !== undefined) { sets.push(`images = $${idx++}`); values.push(JSON.stringify(body.images)) }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status) }

      const { rowCount } = await db.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Product not found' })

      return reply.send({ ok: true })
    },
  )
}
