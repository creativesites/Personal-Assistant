import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Zuri Neural Layer Phase 3 — Reflection Engine + Life Timeline (see
// docs/NEURAL_LAYER_PLAN.md §4.7/§10). Read-only: the weekly
// reflection_summaries rows are written by the intelligence service's
// scheduled job (services/intelligence/app/neural/reflection.py), this
// route just serves them plus a merged chronological timeline.

function reflectionApiShape(r: any) {
  return {
    id: r.id,
    periodType: r.period_type,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    highlights: r.highlights,
    generatedAt: r.generated_at,
  }
}

export async function reflectionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/reflection/latest',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { periodType } = request.query as { periodType?: string }

      const { rows: [summary] } = await db.query(
        `SELECT * FROM reflection_summaries
         WHERE user_id = $1 AND period_type = $2
         ORDER BY period_start DESC LIMIT 1`,
        [userId, periodType ?? 'weekly'],
      )

      return reply.send({ reflection: summary ? reflectionApiShape(summary) : null })
    },
  )

  fastify.get(
    '/api/reflection/timeline',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query(
        `
        SELECT 'reflection' AS source, rs.id, rs.period_end AS event_date,
               rs.period_type AS label, rs.highlights AS detail
        FROM reflection_summaries rs
        WHERE rs.user_id = $1

        UNION ALL

        SELECT 'goal_event' AS source, ge.id, ge.created_at::date AS event_date,
               ge.event_type AS label,
               jsonb_build_object('title', gp.title, 'description', ge.description) AS detail
        FROM goal_events ge
        JOIN goal_profiles gp ON gp.id = ge.goal_id
        WHERE gp.user_id = $1

        UNION ALL

        SELECT 'life_event' AS source, cle.id, COALESCE(cle.event_date, cle.created_at::date) AS event_date,
               cle.event_type AS label,
               jsonb_build_object('title', cle.title, 'contactName',
                 COALESCE(c.custom_name, c.display_name, c.phone_number)) AS detail
        FROM contact_life_events cle
        JOIN contacts c ON c.id = cle.contact_id
        WHERE cle.user_id = $1

        UNION ALL

        SELECT 'deal_closed' AS source, dsh.id, dsh.changed_at::date AS event_date,
               dsh.to_stage AS label,
               jsonb_build_object('title', d.title, 'valueCents', d.value_cents, 'currency', d.currency) AS detail
        FROM deal_stage_history dsh
        JOIN deals d ON d.id = dsh.deal_id
        WHERE d.user_id = $1 AND dsh.to_stage IN ('closed_won', 'closed_lost')

        ORDER BY event_date DESC
        LIMIT 200
        `,
        [userId],
      )

      return reply.send({
        timeline: rows.map((r: any) => ({
          source: r.source,
          id: r.id,
          eventDate: r.event_date,
          label: r.label,
          detail: r.detail,
        })),
      })
    },
  )
}
