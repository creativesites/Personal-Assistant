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

    // Ensure every contact has a relationships row so INNER JOIN below never drops anyone
    await db.query(`
      INSERT INTO relationships (user_id, contact_id, relationship_type, importance_tier, health_score, health_trend, is_auto_managed)
      SELECT $1, co.id, 'acquaintance', 3, 70, 'stable', true
      FROM contacts co
      WHERE co.user_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM relationships r WHERE r.contact_id = co.id AND r.user_id = $1
        )
      ON CONFLICT DO NOTHING
    `, [userId])

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

  // ── Single relationship ──────────────────────────────────────────────────
  fastify.get('/api/relationships/:contactId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }

    // Ensure relationship row exists — join through contacts so we only insert
    // if the contact actually belongs to this user (avoids FK violation on
    // bad/foreign contactIds, ON CONFLICT handles race conditions)
    await db.query(`
      INSERT INTO relationships (user_id, contact_id, relationship_type, importance_tier, health_score, health_trend, is_auto_managed)
      SELECT $1, co.id, 'acquaintance', 3, 70, 'stable', true
      FROM contacts co
      WHERE co.id = $2 AND co.user_id = $1
        AND NOT EXISTS (SELECT 1 FROM relationships WHERE contact_id = $2 AND user_id = $1)
      ON CONFLICT DO NOTHING
    `, [userId, contactId])

    const { rows } = await db.query(`
      ${SELECT_RELATIONSHIPS}
      AND co.id = $2
      LIMIT 1
    `, [userId, contactId])

    if (rows.length === 0) return reply.code(404).send({ error: 'Not found' })

    const r = rows[0]
    return reply.send({
      relationship: {
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
        revenueCents: parseInt(r.revenue_cents ?? '0', 10),
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
      },
    })
  })

  // ── Relationship health history ──────────────────────────────────────────
  fastify.get('/api/relationships/:contactId/health-history', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }

    const { rows } = await db.query(`
      SELECT rhl.health_score, rhl.previous_score, rhl.change_reason, rhl.contributing_factors, rhl.logged_at
      FROM relationship_health_logs rhl
      JOIN relationships r ON r.id = rhl.relationship_id
      WHERE r.contact_id = $2 AND r.user_id = $1
      ORDER BY rhl.logged_at DESC
      LIMIT 30
    `, [userId, contactId])

    return reply.send({
      history: rows.map((row: Record<string, unknown>) => ({
        healthScore: row.health_score,
        previousScore: row.previous_score,
        changeReason: row.change_reason,
        contributingFactors: row.contributing_factors ?? {},
        loggedAt: row.logged_at,
      })),
    })
  })

  // ── Relationship clocks — list ───────────────────────────────────────────
  fastify.get('/api/relationships/:contactId/clocks', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }

    const { rows } = await db.query(`
      SELECT rc.id, rc.clock_type, rc.is_enabled, rc.avg_days_between_messages, rc.std_dev_days,
             rc.peak_hours, rc.typical_day_of_week, rc.last_triggered_at, rc.next_trigger_at,
             rc.dormancy_days_threshold
      FROM relationship_clocks rc
      JOIN relationships r ON r.id = rc.relationship_id
      WHERE r.contact_id = $2 AND r.user_id = $1
      ORDER BY rc.clock_type
    `, [userId, contactId])

    return reply.send({ clocks: rows })
  })

  // ── Relationship clocks — patch ──────────────────────────────────────────
  fastify.patch('/api/relationships/:contactId/clocks/:clockId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId, clockId } = request.params as { contactId: string; clockId: string }
    const body = request.body as { isEnabled?: boolean; dormancyDaysThreshold?: number }

    // Verify ownership
    const { rows } = await db.query(`
      SELECT rc.id FROM relationship_clocks rc
      JOIN relationships r ON r.id = rc.relationship_id
      WHERE rc.id = $1 AND r.contact_id = $2 AND r.user_id = $3
    `, [clockId, contactId, userId])
    if (rows.length === 0) return reply.code(404).send({ error: 'Clock not found' })

    const updates: string[] = []
    const values: (boolean | number | string)[] = []
    let idx = 1
    if (body.isEnabled !== undefined) { updates.push(`is_enabled = $${idx++}`); values.push(body.isEnabled) }
    if (body.dormancyDaysThreshold !== undefined) { updates.push(`dormancy_days_threshold = $${idx++}`); values.push(body.dormancyDaysThreshold) }
    if (updates.length === 0) return reply.code(400).send({ error: 'Nothing to update' })

    values.push(clockId)
    await db.query(`UPDATE relationship_clocks SET ${updates.join(', ')} WHERE id = $${idx}`, values)
    return reply.send({ ok: true })
  })

  // ── Relationship goals ───────────────────────────────────────────────────
  fastify.get('/api/relationships/:contactId/goals', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { contactId } = request.params as { contactId: string }

    const { rows } = await db.query(`
      SELECT id, goal_type, title, description, target_date, status, ai_next_step, created_at, achieved_at
      FROM relationship_goals
      WHERE contact_id = $2 AND user_id = $1
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'achieved' THEN 1 ELSE 2 END, created_at DESC
    `, [userId, contactId])

    return reply.send({
      goals: rows.map((g: Record<string, unknown>) => ({
        id: g.id,
        goalType: g.goal_type,
        title: g.title,
        description: g.description,
        targetDate: g.target_date,
        status: g.status,
        aiNextStep: g.ai_next_step,
        createdAt: g.created_at,
        achievedAt: g.achieved_at,
      })),
    })
  })

  // ── "Analyze All Relationships" — manual, on-demand bulk recalculation ───
  // Pure SQL on both ends (health.py/network_value.py make no LLM call), so
  // this works purely from message history already on file — no dependency
  // on WhatsApp being currently connected.
  fastify.post('/api/relationships/analyze-all', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'
    try {
      const res = await fetch(`${intelligenceUrl}/internal/relationship-health/recalculate-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' })
      return reply.send(await res.json())
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' })
    }
  })
}
