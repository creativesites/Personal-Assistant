import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

const createBody = z.object({
  productId: z.string().uuid().optional(),
  socialAccountId: z.string().uuid(),
  caption: z.string().min(1),
  imageUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
})

const updateBody = z.object({
  caption: z.string().min(1).optional(),
  imageUrl: z.string().url().nullable().optional(),
  socialAccountId: z.string().uuid().optional(),
})

const scheduleBody = z.object({
  scheduledAt: z.string().datetime().optional(), // omit = publish as soon as the worker next polls
})

type PostRow = {
  id: string
  product_id: string | null
  product_name: string | null
  social_account_id: string
  platform: string
  account_name: string | null
  caption: string
  image_url: string | null
  status: string
  scheduled_at: string | null
  sent_at: string | null
  platform_post_id: string | null
  error_message: string | null
  created_at: string
}

function toApiShape(p: PostRow) {
  return {
    id: p.id,
    productId: p.product_id,
    productName: p.product_name,
    socialAccountId: p.social_account_id,
    platform: p.platform,
    accountName: p.account_name,
    caption: p.caption,
    imageUrl: p.image_url,
    status: p.status,
    scheduledAt: p.scheduled_at,
    sentAt: p.sent_at,
    platformPostId: p.platform_post_id,
    errorMessage: p.error_message,
    createdAt: p.created_at,
  }
}

const SELECT_POST = `
  SELECT sp.id, sp.product_id, pr.name AS product_name, sp.social_account_id,
         sa.platform, sa.account_name, sp.caption, sp.image_url, sp.status,
         sp.scheduled_at, sp.sent_at, sp.platform_post_id, sp.error_message, sp.created_at
  FROM social_posts sp
  JOIN social_accounts sa ON sa.id = sp.social_account_id
  LEFT JOIN products pr ON pr.id = sp.product_id
`

export async function socialPostsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/social-posts — list all of the user's posts, newest first
  fastify.get(
    '/api/social-posts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<PostRow>(
        `${SELECT_POST} WHERE sp.user_id = $1 ORDER BY sp.created_at DESC`,
        [userId],
      )

      return reply.send({ posts: rows.map(toApiShape) })
    },
  )

  // POST /api/social-posts — create a draft or scheduled post
  fastify.post(
    '/api/social-posts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [account] } = await db.query<{ id: string }>(
        `SELECT id FROM social_accounts WHERE id = $1 AND user_id = $2 AND status = 'connected'`,
        [body.socialAccountId, userId],
      )
      if (!account) return reply.code(404).send({ error: 'Connected account not found' })

      if (body.productId) {
        const { rows: [product] } = await db.query<{ id: string }>(
          `SELECT id FROM products WHERE id = $1 AND user_id = $2`,
          [body.productId, userId],
        )
        if (!product) return reply.code(404).send({ error: 'Product not found' })
      }

      const status = body.scheduledAt ? 'scheduled' : 'draft'
      const { rows: [created] } = await db.query<{ id: string }>(
        `INSERT INTO social_posts (user_id, product_id, social_account_id, caption, image_url, status, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [userId, body.productId ?? null, body.socialAccountId, body.caption, body.imageUrl ?? null, status, body.scheduledAt ?? null],
      )

      const { rows: [post] } = await db.query<PostRow>(`${SELECT_POST} WHERE sp.id = $1`, [created.id])
      return reply.code(201).send({ post: toApiShape(post) })
    },
  )

  // PATCH /api/social-posts/:id — edit a draft post
  fastify.patch(
    '/api/social-posts/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = updateBody.parse(request.body)

      const { rows: [existing] } = await db.query<{ status: string }>(
        `SELECT status FROM social_posts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Post not found' })
      if (existing.status !== 'draft') {
        return reply.code(409).send({ error: 'Only draft posts can be edited' })
      }

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1
      if (body.caption !== undefined) { updates.push(`caption = $${idx++}`); values.push(body.caption) }
      if (body.imageUrl !== undefined) { updates.push(`image_url = $${idx++}`); values.push(body.imageUrl) }
      if (body.socialAccountId !== undefined) { updates.push(`social_account_id = $${idx++}`); values.push(body.socialAccountId) }

      if (updates.length === 0) return reply.code(400).send({ error: 'No fields to update' })

      updates.push('updated_at = NOW()')
      values.push(id, userId)

      await db.query(
        `UPDATE social_posts SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        values,
      )

      const { rows: [post] } = await db.query<PostRow>(`${SELECT_POST} WHERE sp.id = $1`, [id])
      return reply.send({ post: toApiShape(post) })
    },
  )

  // DELETE /api/social-posts/:id — delete a draft post only
  fastify.delete(
    '/api/social-posts/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ status: string }>(
        `SELECT status FROM social_posts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Post not found' })
      if (existing.status !== 'draft') {
        return reply.code(409).send({ error: 'Only draft posts can be deleted' })
      }

      await db.query(`DELETE FROM social_posts WHERE id = $1`, [id])
      return reply.send({ ok: true })
    },
  )

  // POST /api/social-posts/:id/schedule — move a draft to scheduled (or reschedule).
  // Omitting scheduledAt schedules it for "now" — the publish worker polls
  // every minute, so this is effectively a "publish now" action.
  fastify.post(
    '/api/social-posts/:id/schedule',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = scheduleBody.parse(request.body)

      const { rows: [existing] } = await db.query<{ status: string }>(
        `SELECT status FROM social_posts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Post not found' })
      if (!['draft', 'scheduled'].includes(existing.status)) {
        return reply.code(409).send({ error: 'Only draft or scheduled posts can be scheduled' })
      }

      await db.query(
        `UPDATE social_posts SET status = 'scheduled', scheduled_at = COALESCE($1, NOW()), updated_at = NOW() WHERE id = $2`,
        [body.scheduledAt ?? null, id],
      )

      const { rows: [post] } = await db.query<PostRow>(`${SELECT_POST} WHERE sp.id = $1`, [id])
      return reply.send({ post: toApiShape(post) })
    },
  )

  // POST /api/social-posts/:id/cancel
  fastify.post(
    '/api/social-posts/:id/cancel',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ status: string }>(
        `SELECT status FROM social_posts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Post not found' })
      if (!['draft', 'scheduled'].includes(existing.status)) {
        return reply.code(409).send({ error: 'Only draft or scheduled posts can be cancelled' })
      }

      await db.query(`UPDATE social_posts SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [id])
      return reply.send({ ok: true })
    },
  )
}
