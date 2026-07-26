import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'

const createReviewSchema = z.object({
  authorName: z.string().min(2).max(100),
  authorRole: z.string().max(100).optional(),
  authorCompany: z.string().max(100).optional(),
  authorAvatarUrl: z.string().url().optional(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(10).max(2000),
  source: z.enum(['website', 'dashboard']).optional().default('website'),
})

export async function reviewsRoutes(fastify: FastifyInstance): Promise<void> {
  // Public GET: Approved reviews for landing page & testimonials
  fastify.get('/api/reviews', async (_request, reply) => {
    try {
      const { rows } = await db.query(
        `SELECT id, author_name, author_role, author_company, author_avatar_url, 
                rating, review_text, is_featured, source, created_at
         FROM user_reviews
         WHERE is_approved = true
         ORDER BY is_featured DESC, created_at DESC
         LIMIT 30`
      )
      return reply.send({
        success: true,
        reviews: rows.map(r => ({
          id: r.id,
          authorName: r.author_name,
          authorRole: r.author_role,
          authorCompany: r.author_company,
          authorAvatarUrl: r.author_avatar_url,
          rating: r.rating,
          reviewText: r.review_text,
          isFeatured: r.is_featured,
          source: r.source,
          createdAt: r.created_at,
        })),
      })
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch public reviews')
      return reply.status(500).send({ error: 'Failed to fetch reviews' })
    }
  })

  // POST /api/reviews: Submit a review (Public or Auth)
  fastify.post('/api/reviews', async (request, reply) => {
    const parse = createReviewSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid review payload', details: parse.error.format() })
    }

    const body = parse.data
    let userId: string | null = null
    let orgId: string | null = null

    // Check optional auth
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const decoded = fastify.jwt.verify<{ userId?: string; organizationId?: string }>(token)
        if (decoded?.userId) userId = decoded.userId
        if (decoded?.organizationId) orgId = decoded.organizationId
      } catch {
        /* proceed as anonymous guest */
      }
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO user_reviews 
          (organization_id, user_id, author_name, author_role, author_company, author_avatar_url, rating, review_text, source, is_approved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
         RETURNING id, created_at`,
        [
          orgId,
          userId,
          body.authorName,
          body.authorRole || null,
          body.authorCompany || null,
          body.authorAvatarUrl || null,
          body.rating,
          body.reviewText,
          body.source,
        ]
      )

      return reply.status(201).send({
        success: true,
        message: 'Thank you for your review! It will be published after quick moderation.',
        reviewId: rows[0].id,
      })
    } catch (err: any) {
      fastify.log.error(err, 'Failed to insert review')
      return reply.status(500).send({ error: 'Failed to submit review' })
    }
  })
}
