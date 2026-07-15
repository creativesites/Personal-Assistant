import type { FastifyInstance } from 'fastify'
import { authenticate } from '../plugins/authenticate'

// Zuri Neural Layer Phase 5 — Prediction Engine (docs/NEURAL_LAYER_PLAN.md
// §4.8/§10). Thin proxy — the actual predict() dispatch and the three
// existing-predictor adapters plus the new purchase_likelihood scoring
// live in services/intelligence/app/neural/prediction.py; this route just
// forwards the authenticated userId.

export async function predictionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/predictions/:predictionType/:subjectId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { predictionType, subjectId } = request.params as { predictionType: string; subjectId: string }

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'
      const res = await fetch(`${intelligenceUrl}/internal/predictions/${predictionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subjectId }),
      })

      if (res.status === 404) return reply.code(404).send({ error: 'No prediction available' })
      if (!res.ok) return reply.code(502).send({ error: 'Prediction service unavailable' })

      const prediction = await res.json()
      return reply.send({ prediction })
    },
  )
}
