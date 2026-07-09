import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

type ProductRow = {
  id: string
  name: string
  description: string | null
  price: string | null
  currency: string
}

type GenerationRow = {
  id: string
  content_type: string
  output: string
  model: string
  created_at: string
}

function toApiShape(g: GenerationRow) {
  return {
    id: g.id,
    contentType: g.content_type,
    output: g.output,
    model: g.model,
    createdAt: g.created_at,
  }
}

// Same gate as products.ts — content generation is a Zuri Marketing feature.
async function requireMarketingAccess(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = request.user as { userId: string }
  const { rows: [user] } = await db.query<{ marketing_access: string }>(
    `SELECT COALESCE(marketing_access, 'none') AS marketing_access FROM users WHERE id = $1`,
    [userId],
  )
  if (!user || !['beta', 'enabled'].includes(user.marketing_access)) {
    return reply.code(403).send({ error: 'Zuri Marketing is not enabled for this account yet' })
  }
}

export async function contentGenerationsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/products/:id/generations — most recent generation per content type ──
  fastify.get(
    '/api/products/:id/generations',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query<GenerationRow>(
        `SELECT DISTINCT ON (content_type) id, content_type, output, model, created_at
         FROM content_generations
         WHERE product_id = $1 AND user_id = $2
         ORDER BY content_type, created_at DESC`,
        [id, userId],
      )

      return reply.send({ generations: rows.map(toApiShape) })
    },
  )

  // ── POST /api/products/:id/generate — generate description/caption/video script ──
  fastify.post(
    '/api/products/:id/generate',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [product] } = await db.query<ProductRow>(
        `SELECT id, name, description, price, currency FROM products WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!product) return reply.code(404).send({ error: 'Product not found' })

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'
      let generated: { description: string; caption: string; videoScript: string; model: string }
      try {
        const res = await fetch(`${intelligenceUrl}/internal/content/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: product.name,
            description: product.description,
            price: product.price !== null ? Number(product.price) : null,
            currency: product.currency,
          }),
        })
        if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' })
        generated = (await res.json()) as { description: string; caption: string; videoScript: string; model: string }
      } catch {
        return reply.code(502).send({ error: 'Intelligence service unavailable' })
      }

      const inputSnapshot = JSON.stringify({
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
      })

      const rows = await Promise.all(
        ([
          ['description', generated.description],
          ['caption', generated.caption],
          ['video_script', generated.videoScript],
        ] as const).map(([contentType, output]) =>
          db.query<GenerationRow>(
            `INSERT INTO content_generations (user_id, product_id, content_type, input_snapshot, output, model)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, content_type, output, model, created_at`,
            [userId, id, contentType, inputSnapshot, output, generated.model],
          ),
        ),
      )

      return reply.code(201).send({
        generations: rows.map((r) => toApiShape(r.rows[0])),
      })
    },
  )
}
