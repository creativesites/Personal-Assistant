import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

const UnlockSchema = z.object({
  milestoneId: z.string(),
  customData: z.record(z.any()).optional(),
})

export async function milestonesRoutes(fastify: FastifyInstance) {
  // GET /api/milestones - Get unlocked team milestones & ROI stats
  fastify.get('/api/milestones', async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = (req as any).user?.organization_id || 'default_org'

    // Mock/Redis or DB backed milestones
    return reply.send({
      ok: true,
      organizationId: orgId,
      unlockedMilestones: {
        first_team_reply: { unlockedAt: new Date().toISOString() },
      },
      weeklyStats: {
        messagesHandled: 47,
        hoursSaved: 3.2,
        aiDraftsAccepted: 22,
        zeroMissedSla: true,
        synergyScore: 94,
      },
    })
  })

  // POST /api/milestones/unlock - Persist newly unlocked milestone
  fastify.post('/api/milestones/unlock', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = UnlockSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ ok: false, error: parse.error.format() })
    }

    const { milestoneId, customData } = parse.data
    const orgId = (req as any).user?.organization_id || 'default_org'

    return reply.send({
      ok: true,
      milestoneId,
      organizationId: orgId,
      unlockedAt: new Date().toISOString(),
      customData,
    })
  })
}
