import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'

const createFeedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'ux', 'general']).optional().default('general'),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().min(5).max(3000),
  contactEmail: z.string().email().optional().or(z.literal('')),
  pageUrl: z.string().max(500).optional(),
})

export async function feedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/feedback', async (request, reply) => {
    const parse = createFeedbackSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid feedback payload', details: parse.error.format() })
    }

    const body = parse.data
    let userId: string | null = null
    let orgId: string | null = null

    // Check optional auth token
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
        `INSERT INTO platform_feedback 
          (organization_id, user_id, category, rating, message, contact_email, page_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
         RETURNING id, created_at`,
        [
          orgId,
          userId,
          body.category,
          body.rating || null,
          body.message,
          body.contactEmail || null,
          body.pageUrl || null,
        ]
      )

      return reply.status(201).send({
        success: true,
        message: 'Thank you for your feedback! Our engineering team has received it.',
        feedbackId: rows[0].id,
      })
    } catch (err: any) {
      fastify.log.error(err, 'Failed to insert feedback')
      return reply.status(500).send({ error: 'Failed to submit feedback' })
    }
  })
}
