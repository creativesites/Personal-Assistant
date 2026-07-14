import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

// Business OS Phase A — configurable product families & attributes. See
// docs/BUSINESS_OS_PLAN.md §5. product_families is the user-definable
// hierarchy (Electronics > Phones > Android > Samsung); path is a
// denormalized "Electronics/Phones/Android/Samsung" cache recomputed here
// whenever a family is renamed or reparented — same "denormalized cache kept
// in sync by the API layer, not a trigger" convention deals.pipeline_stage
// already established.

const createFamilyBody = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const patchFamilyBody = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const createAttributeBody = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'key must be lowercase snake_case'),
  label: z.string().min(1).max(255),
  dataType: z.enum(['text', 'number', 'select', 'multiselect', 'boolean', 'date']).default('text'),
  options: z.array(z.string()).optional(),
  isVariantAxis: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const patchAttributeBody = z.object({
  label: z.string().min(1).max(255).optional(),
  dataType: z.enum(['text', 'number', 'select', 'multiselect', 'boolean', 'date']).optional(),
  options: z.array(z.string()).optional(),
  isVariantAxis: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

type FamilyRow = {
  id: string
  parent_id: string | null
  name: string
  path: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function familyApiShape(f: FamilyRow) {
  return {
    id: f.id,
    parentId: f.parent_id,
    name: f.name,
    path: f.path,
    sortOrder: f.sort_order,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }
}

type AttributeRow = {
  id: string
  family_id: string
  key: string
  label: string
  data_type: string
  options: string[]
  is_variant_axis: boolean
  is_required: boolean
  sort_order: number
}

function attributeApiShape(a: AttributeRow) {
  return {
    id: a.id,
    familyId: a.family_id,
    key: a.key,
    label: a.label,
    dataType: a.data_type,
    options: a.options ?? [],
    isVariantAxis: a.is_variant_axis,
    isRequired: a.is_required,
    sortOrder: a.sort_order,
  }
}

// Recompute `path` for a family and every descendant, following a rename or
// reparent. Small trees in practice (a business's own catalog hierarchy), so
// a recursive walk in application code is simpler than a recursive CTE here.
async function recomputePaths(userId: string, rootId: string): Promise<void> {
  const { rows: all } = await db.query<FamilyRow>(
    'SELECT id, parent_id, name, path, sort_order, created_at, updated_at FROM product_families WHERE user_id = $1',
    [userId],
  )
  const byId = new Map(all.map(f => [f.id, f]))
  const childrenOf = new Map<string, FamilyRow[]>()
  for (const f of all) {
    const key = f.parent_id ?? '__root__'
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(f)
  }

  async function walk(id: string, parentPath: string | null): Promise<void> {
    const f = byId.get(id)
    if (!f) return
    const path = parentPath ? `${parentPath}/${f.name}` : f.name
    await db.query('UPDATE product_families SET path = $1 WHERE id = $2', [path, id])
    for (const child of childrenOf.get(id) ?? []) {
      await walk(child.id, path)
    }
  }

  const root = byId.get(rootId)
  const parent = root?.parent_id ? byId.get(root.parent_id) : undefined
  await walk(rootId, parent?.path ?? null)
}

export async function productFamiliesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/product-families — flat list, frontend builds the tree ──
  fastify.get(
    '/api/product-families',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<FamilyRow>(
        `SELECT id, parent_id, name, path, sort_order, created_at, updated_at
         FROM product_families WHERE user_id = $1
         ORDER BY sort_order ASC, name ASC`,
        [userId],
      )

      return reply.send({ families: rows.map(familyApiShape) })
    },
  )

  // ── POST /api/product-families — create a family node ──
  fastify.post(
    '/api/product-families',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createFamilyBody.parse(request.body)

      if (body.parentId) {
        const { rows: [parent] } = await db.query(
          'SELECT id FROM product_families WHERE id = $1 AND user_id = $2',
          [body.parentId, userId],
        )
        if (!parent) return reply.code(404).send({ error: 'Parent family not found' })
      }

      const { rows: [family] } = await db.query<FamilyRow>(
        `INSERT INTO product_families (user_id, parent_id, name, sort_order)
         VALUES ($1, $2, $3, COALESCE($4, 0))
         RETURNING id, parent_id, name, path, sort_order, created_at, updated_at`,
        [userId, body.parentId ?? null, body.name, body.sortOrder ?? null],
      )

      await recomputePaths(userId, family.id)
      const { rows: [fresh] } = await db.query<FamilyRow>(
        'SELECT id, parent_id, name, path, sort_order, created_at, updated_at FROM product_families WHERE id = $1',
        [family.id],
      )

      return reply.code(201).send({ family: familyApiShape(fresh) })
    },
  )

  // ── PATCH /api/product-families/:id — rename / reparent / reorder ──
  fastify.patch(
    '/api/product-families/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchFamilyBody.parse(request.body)

      if (body.parentId === id) {
        return reply.code(400).send({ error: 'A family cannot be its own parent' })
      }
      if (body.parentId) {
        const { rows: [parent] } = await db.query(
          'SELECT id FROM product_families WHERE id = $1 AND user_id = $2',
          [body.parentId, userId],
        )
        if (!parent) return reply.code(404).send({ error: 'Parent family not found' })
      }

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3

      if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name) }
      if (body.parentId !== undefined) { sets.push(`parent_id = $${idx++}`); values.push(body.parentId) }
      if (body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(body.sortOrder) }

      const { rowCount } = await db.query(
        `UPDATE product_families SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Family not found' })

      if (body.name !== undefined || body.parentId !== undefined) {
        await recomputePaths(userId, id)
      }

      return reply.send({ ok: true })
    },
  )

  // ── DELETE /api/product-families/:id — cascades to sub-families (FK) ──
  fastify.delete(
    '/api/product-families/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        'DELETE FROM product_families WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Family not found' })

      return reply.send({ ok: true })
    },
  )

  // ── GET /api/product-families/:id/attributes — this family's own definitions ──
  fastify.get(
    '/api/product-families/:id/attributes',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query<AttributeRow>(
        `SELECT id, family_id, key, label, data_type, options, is_variant_axis, is_required, sort_order
         FROM product_attribute_definitions WHERE user_id = $1 AND family_id = $2
         ORDER BY sort_order ASC, label ASC`,
        [userId, id],
      )

      return reply.send({ attributes: rows.map(attributeApiShape) })
    },
  )

  // ── GET /api/product-families/:id/effective-attributes — this family's
  // definitions plus every ancestor's, root-first, so a Studio product form
  // can render one combined field list ("inherited by every product/variant
  // under it" per the plan). ──
  fastify.get(
    '/api/product-families/:id/effective-attributes',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: families } = await db.query<FamilyRow>(
        'SELECT id, parent_id, name, path, sort_order, created_at, updated_at FROM product_families WHERE user_id = $1',
        [userId],
      )
      const byId = new Map(families.map(f => [f.id, f]))

      const chain: string[] = []
      let cursor: string | undefined = id
      const seen = new Set<string>()
      while (cursor && byId.has(cursor) && !seen.has(cursor)) {
        seen.add(cursor)
        chain.unshift(cursor)
        cursor = byId.get(cursor)!.parent_id ?? undefined
      }
      if (chain.length === 0) return reply.send({ attributes: [] })

      const { rows } = await db.query<AttributeRow>(
        `SELECT id, family_id, key, label, data_type, options, is_variant_axis, is_required, sort_order
         FROM product_attribute_definitions
         WHERE user_id = $1 AND family_id = ANY($2::uuid[])
         ORDER BY sort_order ASC, label ASC`,
        [userId, chain],
      )
      // Order root-ancestor attributes first, matching `chain`'s root-first order.
      const orderIndex = new Map(chain.map((fid, i) => [fid, i]))
      rows.sort((a, b) => (orderIndex.get(a.family_id)! - orderIndex.get(b.family_id)!) || (a.sort_order - b.sort_order))

      return reply.send({ attributes: rows.map(attributeApiShape) })
    },
  )

  // ── POST /api/product-families/:id/attributes — add an attribute definition ──
  fastify.post(
    '/api/product-families/:id/attributes',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createAttributeBody.parse(request.body)

      const { rows: [family] } = await db.query(
        'SELECT id FROM product_families WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!family) return reply.code(404).send({ error: 'Family not found' })

      if (['select', 'multiselect'].includes(body.dataType) && !(body.options?.length)) {
        return reply.code(400).send({ error: 'options is required for select/multiselect attributes' })
      }

      try {
        const { rows: [attr] } = await db.query<AttributeRow>(
          `INSERT INTO product_attribute_definitions
             (user_id, family_id, key, label, data_type, options, is_variant_axis, is_required, sort_order)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '[]'::jsonb), COALESCE($7, false), COALESCE($8, false), COALESCE($9, 0))
           RETURNING id, family_id, key, label, data_type, options, is_variant_axis, is_required, sort_order`,
          [
            userId, id, body.key, body.label, body.dataType,
            body.options ? JSON.stringify(body.options) : null,
            body.isVariantAxis ?? null, body.isRequired ?? null, body.sortOrder ?? null,
          ],
        )
        return reply.code(201).send({ attribute: attributeApiShape(attr) })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.code(409).send({ error: `An attribute with key "${body.key}" already exists on this family` })
        }
        throw err
      }
    },
  )

  // ── PATCH /api/product-attribute-definitions/:id ──
  fastify.patch(
    '/api/product-attribute-definitions/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchAttributeBody.parse(request.body)

      const sets: string[] = []
      const values: unknown[] = [id, userId]
      let idx = 3

      if (body.label !== undefined) { sets.push(`label = $${idx++}`); values.push(body.label) }
      if (body.dataType !== undefined) { sets.push(`data_type = $${idx++}`); values.push(body.dataType) }
      if (body.options !== undefined) { sets.push(`options = $${idx++}::jsonb`); values.push(JSON.stringify(body.options)) }
      if (body.isVariantAxis !== undefined) { sets.push(`is_variant_axis = $${idx++}`); values.push(body.isVariantAxis) }
      if (body.isRequired !== undefined) { sets.push(`is_required = $${idx++}`); values.push(body.isRequired) }
      if (body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(body.sortOrder) }

      if (sets.length === 0) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE product_attribute_definitions SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Attribute not found' })

      return reply.send({ ok: true })
    },
  )

  // ── DELETE /api/product-attribute-definitions/:id ──
  fastify.delete(
    '/api/product-attribute-definitions/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        'DELETE FROM product_attribute_definitions WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Attribute not found' })

      return reply.send({ ok: true })
    },
  )
}
