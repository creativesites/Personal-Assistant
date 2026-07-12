import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// The Relationship Feed (docs/RELATIONSHIP_OS_PLAN.md §5.4/§6.3) — a
// dedicated, richer list endpoint rather than bolting all of this onto
// GET /api/contacts, which many lighter-weight pages also consume.
// LATERAL joins keep it to one row per contact (no GROUP BY/array blowup)
// and every join is either indexed or capped with LIMIT 1.
const SELECT_RELATIONSHIPS = `
  SELECT
    co.id, COALESCE(co.custom_name, co.display_name, co.phone_number) AS name, co.avatar_url,
    co.customer_status,
    r.relationship_type, r.importance_tier, r.health_score, r.health_trend,
    r.last_interaction_at, r.created_at AS relationship_created_at,
    COALESCE(r.network_value, '{}') AS network_value,
    rhl.change_reason,
    COALESCE(rev.total_cents, 0) AS revenue_cents,
    pq.id AS suggestion_id, pq.title AS suggestion_title,
    d.title AS deal_title, d.stage AS deal_stage, d.probability AS deal_probability, d.value_cents AS deal_value_cents,
    prod.product_names, prod.next_replacement_date,
    rm.conversation_themes, rm.important_dates, rm.shared_history_since
  FROM contacts co
  JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
  LEFT JOIN relationship_memory rm ON rm.contact_id = co.id AND rm.user_id = $1
  LEFT JOIN LATERAL (
    SELECT change_reason FROM relationship_health_logs
    WHERE relationship_id = r.id ORDER BY logged_at DESC LIMIT 1
  ) rhl ON true
  LEFT JOIN LATERAL (
    SELECT SUM(amount_cents) AS total_cents FROM revenue_events
    WHERE contact_id = co.id AND user_id = $1
  ) rev ON true
  LEFT JOIN LATERAL (
    SELECT id, title FROM proactive_queue
    WHERE contact_id = co.id AND user_id = $1 AND status = 'pending'
    ORDER BY priority ASC, created_at DESC LIMIT 1
  ) pq ON true
  LEFT JOIN LATERAL (
    SELECT title, stage, probability, value_cents FROM deals
    WHERE contact_id = co.id AND user_id = $1 AND stage NOT IN ('closed_won', 'closed_lost')
    ORDER BY updated_at DESC LIMIT 1
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(p.name) AS product_names, MIN(cp.replacement_predicted_at) AS next_replacement_date
    FROM contact_products cp JOIN products p ON p.id = cp.product_id
    WHERE cp.contact_id = co.id AND cp.user_id = $1
  ) prod ON true
  WHERE co.user_id = $1
`

export async function relationshipsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/relationships', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const { rows } = await db.query(
      `${SELECT_RELATIONSHIPS} ORDER BY r.importance_tier ASC NULLS LAST, r.health_score ASC LIMIT 300`,
      [userId],
    )

    return reply.send({
      relationships: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatar_url,
        customerStatus: r.customer_status,
        relationshipType: r.relationship_type,
        importanceTier: r.importance_tier,
        healthScore: r.health_score,
        healthTrend: r.health_trend,
        changeReason: r.change_reason,
        lastInteractionAt: r.last_interaction_at,
        relationshipCreatedAt: r.relationship_created_at,
        networkValue: r.network_value,
        revenueCents: parseInt(r.revenue_cents, 10),
        nextSuggestion: r.suggestion_id ? { id: r.suggestion_id, title: r.suggestion_title } : null,
        currentDeal: r.deal_title ? {
          title: r.deal_title,
          stage: r.deal_stage,
          probability: r.deal_probability,
          valueCents: parseInt(r.deal_value_cents, 10),
        } : null,
        products: r.product_names ?? [],
        nextReplacementDate: r.next_replacement_date,
        sharedInterests: (r.conversation_themes ?? []).slice(0, 5),
        importantDates: r.important_dates ?? [],
        sharedHistorySince: r.shared_history_since,
      })),
    })
  })
}
