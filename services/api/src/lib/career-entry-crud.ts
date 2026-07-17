import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from './db'
import { authenticate } from '../plugins/authenticate'

// CV Studio Phase 1 (docs/CV_STUDIO_PLAN.md §3, §18) — the Master Career
// Profile's nine per-entry tables (employment history, education,
// certifications, skill groups, awards, volunteer work, memberships,
// publications, references) are all the exact same shape: a user-scoped
// list of ordered rows with a handful of typed columns, full CRUD, no
// cross-resource behavior. Nine hand-written copies of that shape would be
// pure duplication — this shared factory builds the four routes once per
// resource from a small column config, while each resource still keeps its
// own explicit Zod schema for validation.

export type CareerEntryFieldType = 'array' | 'plain'

export interface CareerEntryField {
  column: string
  apiKey: string
  type: CareerEntryFieldType
}

export interface CareerEntryResourceConfig {
  path: string
  table: string
  fields: CareerEntryField[]
  createSchema: z.ZodTypeAny
  patchSchema: z.ZodTypeAny
}

function toApiShape(fields: CareerEntryField[]) {
  return (row: any) => {
    const out: Record<string, unknown> = {
      id: row.id, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at,
    }
    for (const f of fields) out[f.apiKey] = row[f.column] ?? (f.type === 'array' ? [] : null)
    return out
  }
}

export function registerCareerEntryRoutes(fastify: FastifyInstance, cfg: CareerEntryResourceConfig): void {
  const shape = toApiShape(cfg.fields)

  fastify.get(`/api/career/${cfg.path}`, { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows } = await db.query(
      `SELECT * FROM ${cfg.table} WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC`, [userId],
    )
    return reply.send({ items: rows.map(shape) })
  })

  fastify.post(`/api/career/${cfg.path}`, { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body: Record<string, unknown> = cfg.createSchema.parse(request.body)

    const columns = ['user_id']
    const placeholders = ['$1']
    const values: unknown[] = [userId]
    let idx = 2
    for (const f of cfg.fields) {
      columns.push(f.column)
      placeholders.push(f.type === 'array' ? `$${idx++}::text[]` : `$${idx++}`)
      values.push(body[f.apiKey] ?? (f.type === 'array' ? [] : null))
    }
    if (body.sortOrder !== undefined) {
      columns.push('sort_order')
      placeholders.push(`$${idx++}`)
      values.push(body.sortOrder)
    }

    const { rows: [row] } = await db.query(
      `INSERT INTO ${cfg.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values,
    )
    return reply.code(201).send({ item: shape(row) })
  })

  fastify.patch(`/api/career/${cfg.path}/:id`, { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body: Record<string, unknown> = cfg.patchSchema.parse(request.body)

    const { rows: [existing] } = await db.query(
      `SELECT id FROM ${cfg.table} WHERE id = $1 AND user_id = $2`, [id, userId],
    )
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [id, userId]
    let idx = 3
    for (const f of cfg.fields) {
      const v = body[f.apiKey]
      if (v === undefined) continue
      sets.push(f.type === 'array' ? `${f.column} = $${idx++}::text[]` : `${f.column} = $${idx++}`)
      values.push(v)
    }
    if (body.sortOrder !== undefined) {
      sets.push(`sort_order = $${idx++}`)
      values.push(body.sortOrder)
    }

    const { rows: [row] } = await db.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    )
    return reply.send({ item: shape(row) })
  })

  fastify.delete(`/api/career/${cfg.path}/:id`, { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rowCount } = await db.query(`DELETE FROM ${cfg.table} WHERE id = $1 AND user_id = $2`, [id, userId])
    if (!rowCount) return reply.code(404).send({ error: 'Not found' })
    return reply.send({ ok: true })
  })
}
