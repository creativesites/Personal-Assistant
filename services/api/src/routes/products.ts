import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

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

const linkContactBody = z.object({
  contactId: z.string().uuid(),
  relationType: z.enum(['purchased', 'interested', 'quoted', 'recommended', 'mentioned']).default('interested'),
  quantity: z.number().int().positive().optional(),
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
  whatsapp_catalog_product_id: string | null
  whatsapp_catalog_synced_at: string | null
  whatsapp_catalog_status: string
  whatsapp_catalog_error: string | null
  created_at: string
  updated_at: string
  linked_contacts?: string
  attributed_leads?: string
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
    whatsappCatalogProductId: p.whatsapp_catalog_product_id,
    whatsappCatalogSyncedAt: p.whatsapp_catalog_synced_at,
    whatsappCatalogStatus: p.whatsapp_catalog_status,
    whatsappCatalogError: p.whatsapp_catalog_error,
    linkedContacts: p.linked_contacts !== undefined ? Number(p.linked_contacts) : undefined,
    attributedLeads: p.attributed_leads !== undefined ? Number(p.attributed_leads) : undefined,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/products',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<ProductRow>(
        `SELECT p.id, p.name, p.description, p.price, p.currency, p.serial_number, p.quantity,
                p.images, p.status, p.whatsapp_catalog_product_id, p.whatsapp_catalog_synced_at,
                p.whatsapp_catalog_status, p.whatsapp_catalog_error, p.created_at, p.updated_at,
                COUNT(DISTINCT cp.contact_id) AS linked_contacts,
                COUNT(DISTINCT co.id) FILTER (WHERE co.source_product_id = p.id) AS attributed_leads
         FROM products p
         LEFT JOIN contact_products cp ON cp.product_id = p.id AND cp.user_id = p.user_id
         LEFT JOIN contacts co ON co.source_product_id = p.id AND co.user_id = p.user_id
         WHERE p.user_id = $1 AND p.status != 'archived'
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
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
         VALUES ($1, $2, $3, $4, COALESCE($5, 'ZMW'), $6, COALESCE($7, 1), COALESCE($8::jsonb, '[]'::jsonb))
         RETURNING id, name, description, price, currency, serial_number, quantity, images, status,
                   whatsapp_catalog_product_id, whatsapp_catalog_synced_at, whatsapp_catalog_status,
                   whatsapp_catalog_error, created_at, updated_at`,
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
      if (body.images !== undefined) { sets.push(`images = $${idx++}::jsonb`); values.push(JSON.stringify(body.images)) }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status) }

      const { rowCount } = await db.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Product not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.get(
    '/api/products/:id/contacts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT cp.id, cp.contact_id, cp.relation_type, cp.quantity, cp.created_at,
                COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
                co.avatar_url, co.phone_number, co.customer_status, co.pipeline_stage, co.lead_score
         FROM contact_products cp
         JOIN contacts co ON co.id = cp.contact_id AND co.user_id = cp.user_id
         WHERE cp.user_id = $1 AND cp.product_id = $2
         ORDER BY cp.updated_at DESC`,
        [userId, id],
      )

      return reply.send({
        contacts: rows.map((r: any) => ({
          id: r.id,
          contactId: r.contact_id,
          contactName: r.contact_name,
          avatarUrl: r.avatar_url,
          phone: r.phone_number,
          customerStatus: r.customer_status,
          pipelineStage: r.pipeline_stage,
          leadScore: r.lead_score,
          relationType: r.relation_type,
          quantity: r.quantity,
          createdAt: r.created_at,
        })),
      })
    },
  )

  fastify.post(
    '/api/products/:id/contacts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = linkContactBody.parse(request.body)

      const { rows: [product] } = await db.query<{ id: string }>(
        'SELECT id FROM products WHERE id = $1 AND user_id = $2 AND status != $3',
        [id, userId, 'archived'],
      )
      if (!product) return reply.code(404).send({ error: 'Product not found' })

      const { rows: [contact] } = await db.query<{ id: string }>(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [body.contactId, userId],
      )
      if (!contact) return reply.code(404).send({ error: 'Contact not found' })

      await db.query(
        `INSERT INTO contact_products (user_id, contact_id, product_id, relation_type, quantity)
         VALUES ($1, $2, $3, $4, COALESCE($5, 1))
         ON CONFLICT (user_id, contact_id, product_id) DO UPDATE SET
           relation_type = EXCLUDED.relation_type,
           quantity = EXCLUDED.quantity,
           updated_at = NOW()`,
        [userId, body.contactId, id, body.relationType, body.quantity ?? null],
      )

      if (['interested', 'quoted', 'purchased'].includes(body.relationType)) {
        await db.query(
          `UPDATE contacts
           SET source_product_id = COALESCE(source_product_id, $1), updated_at = NOW()
           WHERE id = $2 AND user_id = $3`,
          [id, body.contactId, userId],
        )
      }

      return reply.code(201).send({ ok: true })
    },
  )
}
