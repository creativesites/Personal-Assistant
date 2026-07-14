import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

// Business OS Phase C — multi-location inventory. See
// docs/BUSINESS_OS_PLAN.md §7.1. Every user gets a default "Main" location
// via migration 0058's backfill; single-location businesses (the common
// case) never need to touch this API or see a location picker in the UI.

const createBody = z.object({ name: z.string().min(1).max(255) })
const patchBody = z.object({ name: z.string().min(1).max(255).optional(), isDefault: z.boolean().optional() })

function locationApiShape(r: any) {
  return { id: r.id, name: r.name, isDefault: r.is_default, createdAt: r.created_at }
}

export async function inventoryLocationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/inventory-locations',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { rows } = await db.query(
        'SELECT * FROM inventory_locations WHERE user_id = $1 ORDER BY is_default DESC, name ASC',
        [userId],
      )
      return reply.send({ locations: rows.map(locationApiShape) })
    },
  )

  fastify.post(
    '/api/inventory-locations',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      try {
        const { rows: [loc] } = await db.query(
          `INSERT INTO inventory_locations (user_id, name, is_default)
           VALUES ($1, $2, false) RETURNING *`,
          [userId, body.name],
        )
        return reply.code(201).send({ location: locationApiShape(loc) })
      } catch (err: any) {
        if (err.code === '23505') return reply.code(409).send({ error: `A location named "${body.name}" already exists` })
        throw err
      }
    },
  )

  fastify.patch(
    '/api/inventory-locations/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      if (body.isDefault) {
        await db.query('UPDATE inventory_locations SET is_default = false WHERE user_id = $1', [userId])
      }

      const sets: string[] = []
      const values: unknown[] = [id, userId]
      let idx = 3
      if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name) }
      if (body.isDefault !== undefined) { sets.push(`is_default = $${idx++}`); values.push(body.isDefault) }
      if (sets.length === 0) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE inventory_locations SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Location not found' })
      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/inventory-locations/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [loc] } = await db.query(
        'SELECT is_default FROM inventory_locations WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!loc) return reply.code(404).send({ error: 'Location not found' })
      if (loc.is_default) return reply.code(400).send({ error: 'Cannot delete the default location' })

      const { rows: [stockRow] } = await db.query(
        'SELECT COALESCE(SUM(stock), 0) AS total FROM product_stock_by_location WHERE location_id = $1',
        [id],
      )
      if (Number(stockRow.total) > 0) {
        return reply.code(400).send({ error: 'Transfer out all stock before deleting this location' })
      }

      await db.query('DELETE FROM inventory_locations WHERE id = $1 AND user_id = $2', [id, userId])
      return reply.send({ ok: true })
    },
  )

  // GET /api/products/:id/stock-by-location — per-location breakdown for one product
  fastify.get(
    '/api/products/:id/stock-by-location',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT l.id AS location_id, l.name AS location_name, l.is_default,
                COALESCE(psbl.stock, 0) AS stock, COALESCE(psbl.reserved, 0) AS reserved
         FROM inventory_locations l
         LEFT JOIN product_stock_by_location psbl ON psbl.location_id = l.id AND psbl.product_id = $2
         WHERE l.user_id = $1
         ORDER BY l.is_default DESC, l.name ASC`,
        [userId, id],
      )

      return reply.send({
        stockByLocation: rows.map((r: any) => ({
          locationId: r.location_id, locationName: r.location_name, isDefault: r.is_default,
          stock: r.stock, reserved: r.reserved, available: Math.max(0, r.stock - r.reserved),
        })),
      })
    },
  )
}
