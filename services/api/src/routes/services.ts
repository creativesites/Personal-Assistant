import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { requireFeature } from '../lib/entitlements'

// Services Management System (see docs/SERVICES_PROJECTS_PLAN.md). A
// service is a `products` row with item_type='service' (or a sibling type)
// — this file only owns the pieces that genuinely need their own table:
// pricing tiers (packages/milestones), capacity, and workflow templates.
// Everything else (name, images, pricing_model, service_details JSONB) is
// already covered by products.ts.

const pricingTierBody = z.object({
  kind: z.enum(['package', 'milestone']).default('package'),
  name: z.string().min(1).max(255),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  duration: z.string().max(100).optional().nullable(),
  features: z.array(z.any()).optional(),
  extras: z.array(z.any()).optional(),
  sortOrder: z.number().int().optional(),
})

const capacityBody = z.object({
  capacityUnit: z.enum(['hours', 'slots', 'bays', 'seats', 'staff', 'days']).default('slots'),
  periodType: z.enum(['day', 'week', 'month', 'ongoing']).default('week'),
  totalCapacity: z.number().nonnegative(),
})

const capacityMovementBody = z.object({
  periodType: z.enum(['day', 'week', 'month', 'ongoing']).default('week'),
  movementType: z.enum(['book', 'release', 'adjust']),
  quantity: z.number().refine(n => n !== 0, 'quantity must not be zero'),
  reason: z.string().max(500).optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
})

const workflowStagesBody = z.object({
  stages: z.array(z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
  })).max(50),
})

const startProjectBody = z.object({
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  title: z.string().max(255).optional(),
})

async function ownedProduct(userId: string, productId: string) {
  const { rows: [product] } = await db.query(
    'SELECT id, name FROM products WHERE id = $1 AND user_id = $2',
    [productId, userId],
  )
  return product ?? null
}

export async function servicesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Pricing tiers (packages + milestones) ───────────────────────────────

  fastify.get(
    '/api/products/:id/pricing-tiers',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT id, kind, name, price, currency, duration, features, extras, sort_order, created_at
         FROM service_pricing_tiers WHERE product_id = $1 AND user_id = $2
         ORDER BY kind, sort_order, created_at`,
        [id, userId],
      )

      return reply.send({
        tiers: rows.map((r: any) => ({
          id: r.id, kind: r.kind, name: r.name,
          price: r.price !== null ? Number(r.price) : null,
          currency: r.currency, duration: r.duration,
          features: r.features ?? [], extras: r.extras ?? [],
          sortOrder: r.sort_order, createdAt: r.created_at,
        })),
      })
    },
  )

  fastify.post(
    '/api/products/:id/pricing-tiers',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = pricingTierBody.parse(request.body)

      if (!(await ownedProduct(userId, id))) return reply.code(404).send({ error: 'Product not found' })

      const { rows: [tier] } = await db.query(
        `INSERT INTO service_pricing_tiers (user_id, product_id, kind, name, price, currency, duration, features, extras, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ZMW'), $7, COALESCE($8::jsonb, '[]'::jsonb), COALESCE($9::jsonb, '[]'::jsonb), COALESCE($10, 0))
         RETURNING id, kind, name, price, currency, duration, features, extras, sort_order, created_at`,
        [userId, id, body.kind, body.name, body.price ?? null, body.currency ?? null, body.duration ?? null,
          body.features ? JSON.stringify(body.features) : null, body.extras ? JSON.stringify(body.extras) : null, body.sortOrder ?? null],
      )

      return reply.code(201).send({
        tier: {
          id: tier.id, kind: tier.kind, name: tier.name,
          price: tier.price !== null ? Number(tier.price) : null,
          currency: tier.currency, duration: tier.duration,
          features: tier.features ?? [], extras: tier.extras ?? [],
          sortOrder: tier.sort_order, createdAt: tier.created_at,
        },
      })
    },
  )

  fastify.patch(
    '/api/products/:id/pricing-tiers/:tierId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { tierId } = request.params as { id: string; tierId: string }
      const body = pricingTierBody.partial().parse(request.body)

      const sets: string[] = []
      const values: unknown[] = [tierId, userId]
      let idx = 3
      if (body.kind !== undefined) { sets.push(`kind = $${idx++}`); values.push(body.kind) }
      if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name) }
      if (body.price !== undefined) { sets.push(`price = $${idx++}`); values.push(body.price) }
      if (body.currency !== undefined) { sets.push(`currency = $${idx++}`); values.push(body.currency) }
      if (body.duration !== undefined) { sets.push(`duration = $${idx++}`); values.push(body.duration) }
      if (body.features !== undefined) { sets.push(`features = $${idx++}::jsonb`); values.push(JSON.stringify(body.features)) }
      if (body.extras !== undefined) { sets.push(`extras = $${idx++}::jsonb`); values.push(JSON.stringify(body.extras)) }
      if (body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(body.sortOrder) }
      if (sets.length === 0) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE service_pricing_tiers SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Pricing tier not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/products/:id/pricing-tiers/:tierId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { tierId } = request.params as { id: string; tierId: string }

      const { rowCount } = await db.query(
        'DELETE FROM service_pricing_tiers WHERE id = $1 AND user_id = $2',
        [tierId, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Pricing tier not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Capacity — ledger pattern mirroring stock-movements ─────────────────

  fastify.get(
    '/api/products/:id/capacity',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT id, capacity_unit, period_type, total_capacity, booked, available, updated_at
         FROM service_capacity WHERE product_id = $1 AND user_id = $2 ORDER BY period_type`,
        [id, userId],
      )

      return reply.send({
        capacity: rows.map((r: any) => ({
          id: r.id, capacityUnit: r.capacity_unit, periodType: r.period_type,
          totalCapacity: Number(r.total_capacity), booked: Number(r.booked), available: Number(r.available),
          updatedAt: r.updated_at,
        })),
      })
    },
  )

  fastify.put(
    '/api/products/:id/capacity',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = capacityBody.parse(request.body)

      if (!(await ownedProduct(userId, id))) return reply.code(404).send({ error: 'Product not found' })

      const { rows: [row] } = await db.query(
        `INSERT INTO service_capacity (user_id, product_id, capacity_unit, period_type, total_capacity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, period_type) DO UPDATE SET
           capacity_unit = EXCLUDED.capacity_unit, total_capacity = EXCLUDED.total_capacity, updated_at = NOW()
         RETURNING id, capacity_unit, period_type, total_capacity, booked, available`,
        [userId, id, body.capacityUnit, body.periodType, body.totalCapacity],
      )

      return reply.send({
        capacity: {
          id: row.id, capacityUnit: row.capacity_unit, periodType: row.period_type,
          totalCapacity: Number(row.total_capacity), booked: Number(row.booked), available: Number(row.available),
        },
      })
    },
  )

  fastify.post(
    '/api/products/:id/capacity-movements',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = capacityMovementBody.parse(request.body)

      const { rows: [cap] } = await db.query(
        'SELECT id, booked FROM service_capacity WHERE product_id = $1 AND user_id = $2 AND period_type = $3',
        [id, userId, body.periodType],
      )
      if (!cap) return reply.code(404).send({ error: 'Capacity not set up for this service/period' })

      const delta = body.movementType === 'release' ? -Math.abs(body.quantity) : Math.abs(body.quantity)
      const newBooked = body.movementType === 'adjust' ? body.quantity : Math.max(0, Number(cap.booked) + delta)

      const { rows: [movement] } = await db.query(
        `INSERT INTO service_capacity_movements
           (user_id, capacity_id, movement_type, quantity_delta, previous_booked, new_booked, reason, contact_id, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, movement_type, quantity_delta, previous_booked, new_booked, reason, created_at`,
        [userId, cap.id, body.movementType, delta, cap.booked, newBooked, body.reason ?? null, body.contactId ?? null, body.projectId ?? null],
      )

      await db.query('UPDATE service_capacity SET booked = $1, updated_at = NOW() WHERE id = $2', [newBooked, cap.id])

      return reply.code(201).send({
        movement: {
          id: movement.id, movementType: movement.movement_type, quantityDelta: movement.quantity_delta,
          previousBooked: Number(movement.previous_booked), newBooked: Number(movement.new_booked),
          reason: movement.reason, createdAt: movement.created_at,
        },
        booked: newBooked,
      })
    },
  )

  fastify.get(
    '/api/products/:id/capacity-movements',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT m.id, m.movement_type, m.quantity_delta, m.previous_booked, m.new_booked, m.reason, m.created_at
         FROM service_capacity_movements m
         JOIN service_capacity c ON c.id = m.capacity_id
         WHERE c.product_id = $1 AND m.user_id = $2
         ORDER BY m.created_at DESC LIMIT 50`,
        [id, userId],
      )

      return reply.send({
        movements: rows.map((m: any) => ({
          id: m.id, movementType: m.movement_type, quantityDelta: Number(m.quantity_delta),
          previousBooked: Number(m.previous_booked), newBooked: Number(m.new_booked),
          reason: m.reason, createdAt: m.created_at,
        })),
      })
    },
  )

  // ── Workflow stages — replaced as a whole ordered list, not per-row CRUD,
  // matching how a workflow is actually edited (reorder the whole template
  // in one form). ──────────────────────────────────────────────────────────

  fastify.get(
    '/api/products/:id/workflow-stages',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT id, name, description, sort_order FROM service_workflow_stages
         WHERE product_id = $1 AND user_id = $2 ORDER BY sort_order`,
        [id, userId],
      )

      return reply.send({
        stages: rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order })),
      })
    },
  )

  fastify.put(
    '/api/products/:id/workflow-stages',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = workflowStagesBody.parse(request.body)

      if (!(await ownedProduct(userId, id))) return reply.code(404).send({ error: 'Product not found' })

      await db.query('DELETE FROM service_workflow_stages WHERE product_id = $1 AND user_id = $2', [id, userId])

      const created: any[] = []
      for (let i = 0; i < body.stages.length; i++) {
        const stage = body.stages[i]
        const { rows: [row] } = await db.query(
          `INSERT INTO service_workflow_stages (user_id, product_id, name, description, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, sort_order`,
          [userId, id, stage.name, stage.description ?? null, i],
        )
        created.push(row)
      }

      return reply.send({
        stages: created.map(r => ({ id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order })),
      })
    },
  )

  // ── Selling a service → generating a project (see
  // docs/SERVICES_PROJECTS_PLAN.md §8). Copies the workflow-stage template
  // into the existing projects/project_tasks tables verbatim — this does
  // not redesign project management. ──────────────────────────────────────

  fastify.post(
    '/api/products/:id/start-project',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = startProjectBody.parse(request.body)

      const service = await ownedProduct(userId, id)
      if (!service) return reply.code(404).send({ error: 'Service not found' })

      const { rows: stages } = await db.query(
        'SELECT name FROM service_workflow_stages WHERE product_id = $1 AND user_id = $2 ORDER BY sort_order',
        [id, userId],
      )

      const { rows: [project] } = await db.query(
        `INSERT INTO projects (user_id, contact_id, deal_id, title, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id, title`,
        [userId, body.contactId ?? null, body.dealId ?? null, body.title ?? service.name],
      )

      for (const stage of stages) {
        await db.query(
          'INSERT INTO project_tasks (project_id, title) VALUES ($1, $2)',
          [project.id, stage.name],
        )
      }

      return reply.code(201).send({ projectId: project.id, title: project.title, taskCount: stages.length })
    },
  )
}
