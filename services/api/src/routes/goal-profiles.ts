import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Zuri Neural Layer Phase 2 — cross-module Goal Engine (see
// docs/NEURAL_LAYER_PLAN.md §4.4/§10). Deliberately a separate route file
// and separate tables from the existing relationship-scoped `goals.ts`
// (`relationship_goals`) — a goal here can span the whole business/life
// and link to any entity, not just one contact.

const GOAL_TYPES = ['business', 'personal'] as const
const STATUSES = ['active', 'achieved', 'abandoned', 'paused'] as const
const ENTITY_TYPES = ['deal', 'project', 'product', 'contact', 'document', 'career_opportunity'] as const

const createGoalBody = z.object({
  title: z.string().min(1).max(255),
  goalType: z.enum(GOAL_TYPES),
  targetValue: z.object({
    metric: z.string().max(100).optional(),
    target: z.number().optional(),
    byDate: z.string().optional(),
  }).partial().optional(),
})

const patchGoalBody = z.object({
  title: z.string().min(1).max(255).optional(),
  targetValue: z.object({
    metric: z.string().max(100).optional(),
    target: z.number().optional(),
    byDate: z.string().optional(),
  }).partial().nullable().optional(),
  status: z.enum(STATUSES).optional(),
})

const linkEntityBody = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().uuid(),
})

const progressBody = z.object({
  metricValue: z.record(z.string(), z.unknown()),
  note: z.string().max(1000).optional(),
})

const checkPriceConflictBody = z.object({
  productId: z.string().uuid(),
  newSellingPrice: z.number(),
})

function goalApiShape(r: any) {
  return {
    id: r.id,
    title: r.title,
    goalType: r.goal_type,
    targetValue: r.target_value ?? null,
    status: r.status,
    linkedCount: r.linked_count !== undefined ? Number(r.linked_count) : undefined,
    latestProgress: r.latest_progress ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const ENTITY_NAME_CASE = `
  CASE gle.entity_type
    WHEN 'deal' THEN (SELECT title FROM deals WHERE id = gle.entity_id)
    WHEN 'project' THEN (SELECT title FROM projects WHERE id = gle.entity_id)
    WHEN 'product' THEN (SELECT name FROM products WHERE id = gle.entity_id)
    WHEN 'contact' THEN (SELECT COALESCE(custom_name, display_name, phone_number) FROM contacts WHERE id = gle.entity_id)
    WHEN 'document' THEN (SELECT title FROM documents WHERE id = gle.entity_id)
    WHEN 'career_opportunity' THEN (SELECT title FROM career_opportunities WHERE id = gle.entity_id)
  END
`

export async function goalProfilesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/goal-profiles ────────────────────────────────────────────────
  fastify.get(
    '/api/goal-profiles',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { status, goalType } = request.query as { status?: string; goalType?: string }

      const filters = ['gp.user_id = $1']
      const params: unknown[] = [userId]
      let idx = 2
      if (status) { filters.push(`gp.status = $${idx++}`); params.push(status) }
      if (goalType) { filters.push(`gp.goal_type = $${idx++}`); params.push(goalType) }

      const { rows } = await db.query(
        `SELECT gp.*,
                (SELECT COUNT(*) FROM goal_linked_entities WHERE goal_id = gp.id) AS linked_count,
                (SELECT metric_value FROM goal_progress WHERE goal_id = gp.id ORDER BY recorded_at DESC LIMIT 1) AS latest_progress
         FROM goal_profiles gp
         WHERE ${filters.join(' AND ')}
         ORDER BY gp.status ASC, gp.created_at DESC`,
        params,
      )

      return reply.send({ goals: rows.map(goalApiShape) })
    },
  )

  // ── GET /api/goal-profiles/:id ────────────────────────────────────────────
  fastify.get(
    '/api/goal-profiles/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [goal] } = await db.query(
        `SELECT gp.*,
                (SELECT COUNT(*) FROM goal_linked_entities WHERE goal_id = gp.id) AS linked_count,
                (SELECT metric_value FROM goal_progress WHERE goal_id = gp.id ORDER BY recorded_at DESC LIMIT 1) AS latest_progress
         FROM goal_profiles gp WHERE gp.id = $1 AND gp.user_id = $2`,
        [id, userId],
      )
      if (!goal) return reply.code(404).send({ error: 'Goal not found' })

      const { rows: linked } = await db.query(
        `SELECT gle.id AS link_id, gle.entity_type, gle.entity_id, ${ENTITY_NAME_CASE} AS entity_name
         FROM goal_linked_entities gle WHERE gle.goal_id = $1 ORDER BY gle.created_at ASC`,
        [id],
      )
      const { rows: progress } = await db.query(
        `SELECT id, metric_value, note, recorded_at FROM goal_progress WHERE goal_id = $1 ORDER BY recorded_at DESC LIMIT 50`,
        [id],
      )
      const { rows: events } = await db.query(
        `SELECT id, event_type, description, created_at FROM goal_events WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id],
      )
      const { rows: memories } = await db.query(
        `SELECT id, source_type, source_id, summary, created_at FROM goal_memories WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id],
      )

      return reply.send({
        goal: goalApiShape(goal),
        linkedEntities: linked.map((r: any) => ({
          linkId: r.link_id, entityType: r.entity_type, entityId: r.entity_id, entityName: r.entity_name,
        })),
        progress: progress.map((r: any) => ({ id: r.id, metricValue: r.metric_value, note: r.note, recordedAt: r.recorded_at })),
        events: events.map((r: any) => ({ id: r.id, eventType: r.event_type, description: r.description, createdAt: r.created_at })),
        memories: memories.map((r: any) => ({ id: r.id, sourceType: r.source_type, sourceId: r.source_id, summary: r.summary, createdAt: r.created_at })),
      })
    },
  )

  // ── POST /api/goal-profiles ───────────────────────────────────────────────
  fastify.post(
    '/api/goal-profiles',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createGoalBody.parse(request.body)

      const { rows: [goal] } = await db.query(
        `INSERT INTO goal_profiles (user_id, title, goal_type, target_value)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, body.title, body.goalType, body.targetValue ? JSON.stringify(body.targetValue) : null],
      )

      return reply.code(201).send({ goal: goalApiShape(goal) })
    },
  )

  // ── PATCH /api/goal-profiles/:id ──────────────────────────────────────────
  fastify.patch(
    '/api/goal-profiles/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchGoalBody.parse(request.body)

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3
      if (body.title !== undefined) { sets.push(`title = $${idx++}`); values.push(body.title) }
      if (body.targetValue !== undefined) { sets.push(`target_value = $${idx++}`); values.push(body.targetValue ? JSON.stringify(body.targetValue) : null) }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status) }

      const { rowCount } = await db.query(
        `UPDATE goal_profiles SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Goal not found' })

      if (body.status) {
        await db.query(
          `INSERT INTO goal_events (goal_id, event_type, description) VALUES ($1, 'reprioritized', $2)`,
          [id, `Status changed to ${body.status}`],
        )
      }

      return reply.send({ ok: true })
    },
  )

  // ── DELETE /api/goal-profiles/:id ─────────────────────────────────────────
  fastify.delete(
    '/api/goal-profiles/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        'DELETE FROM goal_profiles WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Goal not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Link / unlink entities ─────────────────────────────────────────────────

  fastify.post(
    '/api/goal-profiles/:id/link',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = linkEntityBody.parse(request.body)

      const { rows: [goal] } = await db.query(
        'SELECT id, title FROM goal_profiles WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!goal) return reply.code(404).send({ error: 'Goal not found' })

      const { rows: [link] } = await db.query(
        `INSERT INTO goal_linked_entities (goal_id, entity_type, entity_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (goal_id, entity_type, entity_id) DO NOTHING
         RETURNING id`,
        [id, body.entityType, body.entityId],
      )

      if (link) {
        await db.query(
          `INSERT INTO goal_events (goal_id, event_type, description) VALUES ($1, 'linked_entity_added', $2)`,
          [id, `Linked a ${body.entityType}`],
        )
      }

      return reply.code(201).send({ ok: true })
    },
  )

  fastify.delete(
    '/api/goal-profiles/:id/link/:linkId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, linkId } = request.params as { id: string; linkId: string }

      const { rowCount } = await db.query(
        `DELETE FROM goal_linked_entities
         WHERE id = $1 AND goal_id = $2
           AND goal_id IN (SELECT id FROM goal_profiles WHERE user_id = $3)`,
        [linkId, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Link not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Progress ────────────────────────────────────────────────────────────

  fastify.post(
    '/api/goal-profiles/:id/progress',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = progressBody.parse(request.body)

      const { rows: [goal] } = await db.query(
        'SELECT id FROM goal_profiles WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!goal) return reply.code(404).send({ error: 'Goal not found' })

      const { rows: [row] } = await db.query(
        `INSERT INTO goal_progress (goal_id, metric_value, note) VALUES ($1, $2, $3) RETURNING id`,
        [id, JSON.stringify(body.metricValue), body.note ?? null],
      )

      return reply.code(201).send({ id: row.id })
    },
  )

  // ── Reasoning Engine pilot: goal-conflict check ───────────────────────────
  // The Neural Layer's Reasoning Engine (docs/NEURAL_LAYER_PLAN.md §4.6) is
  // its own future phase; this is a small, deterministic pilot consumer —
  // not an LLM call, a plain-SQL heuristic — proving the "does this action
  // conflict with an active goal?" pattern on one real surface (Studio's
  // pricing flow) before building the full formal engine.
  fastify.post(
    '/api/goal-profiles/check-price-conflict',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = checkPriceConflictBody.parse(request.body)

      const { rows: [product] } = await db.query(
        `SELECT selling_price, purchase_cost FROM products WHERE id = $1 AND user_id = $2`,
        [body.productId, userId],
      )
      if (!product) return reply.code(404).send({ error: 'Product not found' })

      const currentPrice = product.selling_price != null ? parseFloat(product.selling_price) : null
      const cost = parseFloat(product.purchase_cost ?? '0')

      if (currentPrice === null || currentPrice <= 0 || body.newSellingPrice >= currentPrice) {
        return reply.send({ conflict: false })
      }

      const dropPct = (currentPrice - body.newSellingPrice) / currentPrice
      const newMarginPct = body.newSellingPrice > 0 ? ((body.newSellingPrice - cost) / body.newSellingPrice) * 100 : 0

      // Only worth flagging for a meaningful price cut or a margin that
      // falls thin — same 15% threshold Studio's existing thinMargin
      // insight already uses (studio.ts), for consistency.
      const worthFlagging = dropPct >= 0.10 || newMarginPct < 15
      if (!worthFlagging) return reply.send({ conflict: false })

      const { rows: goals } = await db.query(
        `SELECT id, title FROM goal_profiles
         WHERE user_id = $1 AND goal_type = 'business' AND status = 'active'
         ORDER BY (target_value->>'metric' ILIKE '%revenue%' OR target_value->>'metric' ILIKE '%sales%') DESC,
                  created_at DESC
         LIMIT 1`,
        [userId],
      )
      const goal = goals[0]
      if (!goal) return reply.send({ conflict: false })

      const evidence: string[] = [
        `Selling price dropping from ${currentPrice.toFixed(2)} to ${body.newSellingPrice.toFixed(2)} (${Math.round(dropPct * 100)}% decrease)`,
      ]
      if (newMarginPct < 15) evidence.push(`Margin would fall to ${newMarginPct.toFixed(1)}%`)

      const confidence = Math.min(0.9, 0.5 + dropPct)

      return reply.send({
        conflict: true,
        goal: { id: goal.id, title: goal.title },
        message: `This may work against your goal "${goal.title}".`,
        confidence: Math.round(confidence * 100) / 100,
        evidence,
      })
    },
  )
}
