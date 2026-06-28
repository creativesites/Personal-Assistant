import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// ─── Validation schemas ────────────────────────────────────────────────────

const funnelStageBody = z.object({
  conversation_id: z.string().uuid(),
  stage: z.enum(['lead', 'qualified', 'opportunity', 'proposal', 'closed_won', 'closed_lost', 'churned']),
  notes: z.string().optional(),
})

const revenueEventBody = z.object({
  conversation_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  event_type: z.enum(['deal_closed', 'upsell', 'renewal', 'churn']),
  amount_cents: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  attributed_to_ai: z.boolean().optional(),
})

// ─── Route plugin ─────────────────────────────────────────────────────────

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/analytics/overview ──────────────────────────────────────────

  fastify.get(
    '/api/analytics/overview',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      // Suggestion acceptance rate over last 30 days
      const { rows: [suggStats] } = await db.query<{
        total: string
        approved: string
        edited: string
        rejected: string
        ignored: string
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE outcome = 'approved') AS approved,
           COUNT(*) FILTER (WHERE outcome = 'edited') AS edited,
           COUNT(*) FILTER (WHERE outcome = 'rejected') AS rejected,
           COUNT(*) FILTER (WHERE outcome = 'ignored') AS ignored
         FROM suggestion_outcomes
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const total = parseInt(suggStats.total, 10)
      const approved = parseInt(suggStats.approved, 10)
      const edited = parseInt(suggStats.edited, 10)
      const acceptanceRate = total > 0
        ? parseFloat(((approved + edited) / total).toFixed(4))
        : 0

      // Average response time (time_to_decision_seconds)
      const { rows: [responseTime] } = await db.query<{ avg_seconds: string | null }>(
        `SELECT AVG(time_to_decision_seconds)::numeric(10,2) AS avg_seconds
         FROM suggestion_outcomes
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
           AND time_to_decision_seconds IS NOT NULL`,
        [userId],
      )

      // Proactive items approved in last 30 days
      const { rows: [proactive] } = await db.query<{ approved_count: string }>(
        `SELECT COUNT(*) AS approved_count
         FROM proactive_items
         WHERE user_id = $1
           AND status = 'approved'
           AND updated_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      // AI drafted vs manual messages sent in last 30 days
      const { rows: [draftStats] } = await db.query<{
        ai_drafted: string
        manual: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE suggested_reply_id IS NOT NULL) AS ai_drafted,
           COUNT(*) FILTER (WHERE suggested_reply_id IS NULL) AS manual
         FROM messages
         WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)
           AND direction = 'outbound'
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      return reply.send({
        suggestion_acceptance_rate: acceptanceRate,
        avg_response_time_seconds: responseTime.avg_seconds
          ? parseFloat(responseTime.avg_seconds)
          : null,
        proactive_items_approved: parseInt(proactive.approved_count, 10),
        ai_drafted_vs_manual: {
          ai_drafted: parseInt(draftStats.ai_drafted, 10),
          manual: parseInt(draftStats.manual, 10),
        },
        period: '30d',
      })
    },
  )

  // ── GET /api/analytics/funnel ────────────────────────────────────────────

  fastify.get(
    '/api/analytics/funnel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const stages = [
        'lead',
        'qualified',
        'opportunity',
        'proposal',
        'closed_won',
        'closed_lost',
        'churned',
      ]

      const { rows } = await db.query<{
        stage: string
        count: string
        avg_days_in_stage: string | null
      }>(
        `SELECT
           stage,
           COUNT(*) AS count,
           AVG(
             EXTRACT(EPOCH FROM (COALESCE(exited_at, NOW()) - entered_at)) / 86400
           )::numeric(10,2) AS avg_days_in_stage
         FROM conversation_funnel_stages
         WHERE user_id = $1
         GROUP BY stage`,
        [userId],
      )

      // Map to ordered stage list with conversion rates
      const stageMap = new Map(rows.map((r) => [r.stage, r]))

      const funnel = stages.map((stage, i) => {
        const row = stageMap.get(stage)
        const count = row ? parseInt(row.count, 10) : 0
        const avgDays = row?.avg_days_in_stage ? parseFloat(row.avg_days_in_stage) : null

        // Conversion rate to next stage
        let conversionRateToNext: number | null = null
        if (i < stages.length - 1) {
          const nextStage = stages[i + 1]
          const nextRow = stageMap.get(nextStage)
          const nextCount = nextRow ? parseInt(nextRow.count, 10) : 0
          conversionRateToNext = count > 0 ? parseFloat((nextCount / count).toFixed(4)) : null
        }

        return {
          stage,
          count,
          avg_days_in_stage: avgDays,
          conversion_rate_to_next: conversionRateToNext,
        }
      })

      return reply.send(funnel)
    },
  )

  // ── GET /api/analytics/suggestions ──────────────────────────────────────

  fastify.get(
    '/api/analytics/suggestions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<{
        date: string
        total: string
        approved: string
        edited: string
        rejected: string
      }>(
        `SELECT
           DATE(created_at AT TIME ZONE 'UTC') AS date,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE outcome = 'approved') AS approved,
           COUNT(*) FILTER (WHERE outcome = 'edited') AS edited,
           COUNT(*) FILTER (WHERE outcome = 'rejected') AS rejected
         FROM suggestion_outcomes
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at AT TIME ZONE 'UTC')
         ORDER BY date ASC`,
        [userId],
      )

      return reply.send({
        daily: rows.map((r) => ({
          date: r.date,
          total: parseInt(r.total, 10),
          approved: parseInt(r.approved, 10),
          edited: parseInt(r.edited, 10),
          rejected: parseInt(r.rejected, 10),
        })),
        period: '30d',
      })
    },
  )

  // ── GET /api/analytics/revenue ───────────────────────────────────────────

  fastify.get(
    '/api/analytics/revenue',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [summary] } = await db.query<{
        total_attributed_cents: string
        deal_count: string
        avg_deal_cents: string | null
      }>(
        `SELECT
           COALESCE(SUM(amount_cents), 0) AS total_attributed_cents,
           COUNT(*) AS deal_count,
           AVG(amount_cents)::numeric(20,0) AS avg_deal_cents
         FROM revenue_events
         WHERE user_id = $1`,
        [userId],
      )

      const { rows: byMonth } = await db.query<{
        month: string
        amount_cents: string
        count: string
      }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
           SUM(amount_cents) AS amount_cents,
           COUNT(*) AS count
         FROM revenue_events
         WHERE user_id = $1
         GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'UTC')
         ORDER BY month DESC
         LIMIT 24`,
        [userId],
      )

      return reply.send({
        total_attributed_cents: parseInt(summary.total_attributed_cents, 10),
        deal_count: parseInt(summary.deal_count, 10),
        avg_deal_cents: summary.avg_deal_cents ? parseInt(summary.avg_deal_cents, 10) : null,
        by_month: byMonth.map((r) => ({
          month: r.month,
          amount_cents: parseInt(r.amount_cents, 10),
          count: parseInt(r.count, 10),
        })),
      })
    },
  )

  // ── POST /api/analytics/funnel/stage ────────────────────────────────────

  fastify.post(
    '/api/analytics/funnel/stage',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof funnelStageBody>
      try {
        body = funnelStageBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      // Verify conversation belongs to user
      const { rows: [conv] } = await db.query<{ id: string; contact_id: string | null }>(
        'SELECT id, contact_id FROM conversations WHERE id = $1 AND user_id = $2',
        [body.conversation_id, userId],
      )
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

      // Close the current open stage (no exited_at yet) for this conversation
      await db.query(
        `UPDATE conversation_funnel_stages
         SET exited_at = NOW()
         WHERE conversation_id = $1 AND user_id = $2 AND exited_at IS NULL`,
        [body.conversation_id, userId],
      )

      // Insert new stage
      const { rows: [newStage] } = await db.query<{ id: string; entered_at: string }>(
        `INSERT INTO conversation_funnel_stages
           (user_id, conversation_id, contact_id, stage, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, entered_at`,
        [
          userId,
          body.conversation_id,
          conv.contact_id,
          body.stage,
          body.notes ?? null,
        ],
      )

      return reply.code(201).send({
        id: newStage.id,
        stage: body.stage,
        enteredAt: newStage.entered_at,
      })
    },
  )

  // ── POST /api/analytics/revenue ─────────────────────────────────────────

  fastify.post(
    '/api/analytics/revenue',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof revenueEventBody>
      try {
        body = revenueEventBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      // Validate conversation ownership if provided
      if (body.conversation_id) {
        const { rows: [conv] } = await db.query<{ id: string }>(
          'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
          [body.conversation_id, userId],
        )
        if (!conv) return reply.code(404).send({ error: 'Conversation not found' })
      }

      // Validate contact ownership if provided
      if (body.contact_id) {
        const { rows: [contact] } = await db.query<{ id: string }>(
          'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
          [body.contact_id, userId],
        )
        if (!contact) return reply.code(404).send({ error: 'Contact not found' })
      }

      const { rows: [event] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO revenue_events
           (user_id, conversation_id, contact_id, event_type, amount_cents, currency,
            description, attributed_to_ai)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          userId,
          body.conversation_id ?? null,
          body.contact_id ?? null,
          body.event_type,
          body.amount_cents,
          body.currency ?? 'USD',
          body.description ?? null,
          body.attributed_to_ai ?? false,
        ],
      )

      return reply.code(201).send({ id: event.id, createdAt: event.created_at })
    },
  )
}
