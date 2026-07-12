import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const createBody = z.object({
  contactId: z.string().uuid(),
  goalType: z.string().min(1).max(40),
  customLabel: z.string().max(255).optional(),
  targetDate: z.string().optional(),
})

const patchBody = z.object({
  status: z.enum(['active', 'achieved', 'abandoned']).optional(),
  customLabel: z.string().max(255).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  regenerateNextStep: z.boolean().optional(),
})

type GoalRow = {
  id: string
  contact_id: string
  contact_name: string | null
  goal_type: string
  custom_label: string | null
  status: string
  target_date: string | null
  ai_next_step: string | null
  created_at: string
  updated_at: string
  achieved_at: string | null
}

function toApiShape(g: GoalRow) {
  return {
    id: g.id,
    contactId: g.contact_id,
    contactName: g.contact_name,
    goalType: g.goal_type,
    customLabel: g.custom_label,
    status: g.status,
    targetDate: g.target_date,
    aiNextStep: g.ai_next_step,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    achievedAt: g.achieved_at,
  }
}

const SELECT_GOAL = `
  SELECT g.id, g.contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
         g.goal_type, g.custom_label, g.status, g.target_date, g.ai_next_step,
         g.created_at, g.updated_at, g.achieved_at
  FROM relationship_goals g
  JOIN contacts c ON c.id = g.contact_id
`

// Best-effort — a goal is still useful without an AI next step, so a slow
// or unavailable intelligence service should never block create/regenerate.
async function requestNextStep(goalId: string, userId: string): Promise<void> {
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'
  try {
    await fetch(`${intelligenceUrl}/internal/goals/next-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, userId }),
    })
  } catch {
    // swallow — ai_next_step just stays null/stale
  }
}

export async function goalsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/goals — list, optionally filtered by contact or status ──────
  fastify.get(
    '/api/goals',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as { contactId?: string; status?: string }

      const filters: string[] = ['g.user_id = $1']
      const params: unknown[] = [userId]
      let idx = 2

      if (query.contactId) {
        filters.push(`g.contact_id = $${idx++}`)
        params.push(query.contactId)
      }
      if (query.status) {
        filters.push(`g.status = $${idx++}`)
        params.push(query.status)
      }

      const { rows } = await db.query<GoalRow>(
        `${SELECT_GOAL} WHERE ${filters.join(' AND ')} ORDER BY g.status ASC, g.created_at DESC`,
        params,
      )

      return reply.send({ goals: rows.map(toApiShape) })
    },
  )

  // ── POST /api/goals — create a goal, kick off AI next-step generation ────
  fastify.post(
    '/api/goals',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [contact] } = await db.query<{ id: string }>(
        `SELECT id FROM contacts WHERE id = $1 AND user_id = $2`,
        [body.contactId, userId],
      )
      if (!contact) return reply.code(404).send({ error: 'Contact not found' })

      const { rows: [created] } = await db.query<{ id: string }>(
        `INSERT INTO relationship_goals (user_id, contact_id, goal_type, custom_label, target_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, body.contactId, body.goalType, body.customLabel ?? null, body.targetDate ?? null],
      )

      await requestNextStep(created.id, userId)

      const { rows: [goal] } = await db.query<GoalRow>(`${SELECT_GOAL} WHERE g.id = $1`, [created.id])
      return reply.code(201).send({ goal: toApiShape(goal) })
    },
  )

  // ── PATCH /api/goals/:id ──────────────────────────────────────────────────
  fastify.patch(
    '/api/goals/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const { rows: [existing] } = await db.query<{ id: string }>(
        `SELECT id FROM relationship_goals WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Goal not found' })

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1
      if (body.status !== undefined) {
        updates.push(`status = $${idx++}`); values.push(body.status)
        updates.push(`achieved_at = ${body.status === 'achieved' ? 'NOW()' : 'NULL'}`)
      }
      if (body.customLabel !== undefined) { updates.push(`custom_label = $${idx++}`); values.push(body.customLabel) }
      if (body.targetDate !== undefined) { updates.push(`target_date = $${idx++}`); values.push(body.targetDate) }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()')
        values.push(id, userId)
        await db.query(
          `UPDATE relationship_goals SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
          values,
        )
      }

      if (body.regenerateNextStep) {
        await requestNextStep(id, userId)
      }

      const { rows: [goal] } = await db.query<GoalRow>(`${SELECT_GOAL} WHERE g.id = $1`, [id])
      return reply.send({ goal: toApiShape(goal) })
    },
  )
}
