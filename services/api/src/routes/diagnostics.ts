import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { queues } from '../lib/queue'
import { authenticate } from '../plugins/authenticate'
import { authenticateAdmin } from '../plugins/authenticateAdmin'

const PERIOD_INTERVALS: Record<string, string | null> = {
  daily: '1 day',
  weekly: '7 days',
  monthly: '30 days',
  all: null,
}

const costRatesBody = z.object({
  rates: z.record(z.object({
    input_per_1k: z.number().nonnegative(),
    output_per_1k: z.number().nonnegative(),
  })),
})

// Distinguishes "the AI pipeline isn't running/succeeding" from "this page
// has a bug" — every /analytics ("Intelligence") page depends on
// message_analyses/contact_profiles/opportunities actually being populated
// by the intelligence service's per-message LLM pass. If totalMessages is
// high but analyzedMessages is 0, that's an LLM/worker outage, not a query bug.
export async function diagnosticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/diagnostics/ai-pipeline', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const [messageStats, contactStats, opportunityCount] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total_messages,
           COUNT(ma.id) AS analyzed_messages,
           MAX(ma.analyzed_at) AS last_analyzed_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN message_analyses ma ON ma.message_id = m.id
         WHERE c.user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT
           COUNT(DISTINCT co.id) AS total_contacts,
           COUNT(DISTINCT cp.contact_id) AS contacts_with_profile
         FROM contacts co
         LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $1
         WHERE co.user_id = $1 AND co.is_group = false AND co.archived_at IS NULL`,
        [userId],
      ),
      db.query(`SELECT COUNT(*) AS count FROM opportunities WHERE user_id = $1`, [userId]),
    ])

    const m = messageStats.rows[0]
    const c = contactStats.rows[0]
    const totalMessages = parseInt(m.total_messages, 10)
    const analyzedMessages = parseInt(m.analyzed_messages, 10)
    const totalContacts = parseInt(c.total_contacts, 10)
    const contactsWithProfile = parseInt(c.contacts_with_profile, 10)

    return reply.send({
      totalMessages,
      analyzedMessages,
      coveragePct: totalMessages > 0 ? Math.round((analyzedMessages / totalMessages) * 100) : null,
      lastAnalyzedAt: m.last_analyzed_at,
      totalContacts,
      contactsWithProfile,
      profileCoveragePct: totalContacts > 0 ? Math.round((contactsWithProfile / totalContacts) * 100) : null,
      opportunityCount: parseInt(opportunityCount.rows[0].count, 10),
    })
  })

  // Intelligence Health Score (Zuri Reality Engine, see
  // docs/REALITY_ENGINE_PLAN.md §9) — a measurable freshness/accuracy
  // metric for the platform's AI-derived state, computed live (a handful
  // of aggregate queries per page load, same "not a hot path" judgment as
  // Studio's Customer tiers/Financial Overview) rather than cached.
  fastify.get('/api/diagnostics/intelligence-health', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const [forecastFreshness, relationshipFreshness, nudgeAccuracy, contradictionsOpen] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE f.computed_at >= NOW() - INTERVAL '2 days') AS fresh
         FROM inventory_forecasts f
         JOIN products p ON p.id = f.product_id
         WHERE p.user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') AS fresh
         FROM relationships WHERE user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'auto_resolved') AS auto_resolved,
           COUNT(*) FILTER (WHERE status IN ('sent', 'approved')) AS acted_on
         FROM proactive_queue
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
           AND status IN ('auto_resolved', 'sent', 'approved')`,
        [userId],
      ),
      db.query(
        `SELECT COUNT(*) AS count FROM business_events
         WHERE user_id = $1 AND event_type LIKE 'contradiction_%' AND status = 'pending'
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      ),
    ])

    const forecast = forecastFreshness.rows[0]
    const relationship = relationshipFreshness.rows[0]
    const nudge = nudgeAccuracy.rows[0]

    const forecastTotal = parseInt(forecast.total, 10)
    const predictionFreshnessPct = forecastTotal > 0
      ? Math.round((parseInt(forecast.fresh, 10) / forecastTotal) * 100) : null

    const relationshipTotal = parseInt(relationship.total, 10)
    const relationshipFreshnessPct = relationshipTotal > 0
      ? Math.round((parseInt(relationship.fresh, 10) / relationshipTotal) * 100) : null

    const autoResolved = parseInt(nudge.auto_resolved, 10)
    const actedOn = parseInt(nudge.acted_on, 10)
    const nudgeTotal = autoResolved + actedOn
    // "Accuracy" here means the fraction of nudges a user actually acted on
    // rather than ones Reality Engine had to quietly clean up — the inverse
    // of the "unnecessary nudge" rate described in docs/REALITY_ENGINE_PLAN.md §9.
    const nudgeAccuracyPct = nudgeTotal > 0 ? Math.round((actedOn / nudgeTotal) * 100) : null

    const contradictionsOpenCount = parseInt(contradictionsOpen.rows[0].count, 10)

    const scores = [predictionFreshnessPct, relationshipFreshnessPct, nudgeAccuracyPct].filter(
      (v): v is number => v !== null,
    )
    const overall = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

    return reply.send({
      predictionFreshnessPct,
      relationshipFreshnessPct,
      nudgeAccuracyPct,
      contradictionsOpen: contradictionsOpenCount,
      overall,
    })
  })

  // Token Usage & AI Costs (see CLAUDE.md "Token Usage Tracking"). Read-only
  // for normal users — they always get their own stats regardless of any
  // ?userId= they pass. Admins can pass ?userId= to inspect a specific
  // user's usage for billing, or omit it to see the platform-wide total.
  fastify.get('/api/diagnostics/token-usage', { preHandler: authenticate }, async (request, reply) => {
    const { userId, isAdmin } = request.user as { userId: string; isAdmin?: boolean }
    const query = request.query as { period?: string; userId?: string }

    const period = query.period && query.period in PERIOD_INTERVALS ? query.period : 'monthly'
    const interval = PERIOD_INTERVALS[period]

    const requestedUserId = query.userId && query.userId.trim() ? query.userId.trim() : undefined
    // Security: a non-admin is always force-filtered to their own userId,
    // no matter what ?userId= they supply.
    const effectiveUserId = isAdmin ? requestedUserId : userId

    const whereClauses: string[] = []
    const params: unknown[] = []
    if (interval) {
      params.push(interval)
      whereClauses.push(`created_at >= NOW() - $${params.length}::interval`)
    }
    if (effectiveUserId) {
      params.push(effectiveUserId)
      whereClauses.push(`user_id = $${params.length}`)
    }
    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const [totals, byFeature, byModel, dailyBreakdown] = await Promise.all([
      db.query<{ total_tokens: string | null; total_cost: string | null }>(
        `SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(estimated_cost_usd), 0) AS total_cost
         FROM token_usage_logs ${where}`,
        params,
      ),
      db.query<{ feature: string; tokens: string; cost: string }>(
        `SELECT feature, SUM(total_tokens) AS tokens, SUM(estimated_cost_usd) AS cost
         FROM token_usage_logs ${where}
         GROUP BY feature ORDER BY tokens DESC`,
        params,
      ),
      db.query<{ model: string; tokens: string; cost: string }>(
        `SELECT model, SUM(total_tokens) AS tokens, SUM(estimated_cost_usd) AS cost
         FROM token_usage_logs ${where}
         GROUP BY model ORDER BY tokens DESC`,
        params,
      ),
      db.query<{ date: string; tokens: string; cost: string }>(
        `SELECT DATE(created_at) AS date, SUM(total_tokens) AS tokens, SUM(estimated_cost_usd) AS cost
         FROM token_usage_logs ${where}
         GROUP BY DATE(created_at) ORDER BY date ASC`,
        params,
      ),
    ])

    const response: Record<string, unknown> = {
      totalTokens: parseInt(totals.rows[0]?.total_tokens ?? '0', 10),
      totalCostEstimate: parseFloat(totals.rows[0]?.total_cost ?? '0'),
      byFeature: byFeature.rows.map((r) => ({
        feature: r.feature, tokens: parseInt(r.tokens, 10), cost: parseFloat(r.cost),
      })),
      byModel: byModel.rows.map((r) => ({
        model: r.model, tokens: parseInt(r.tokens, 10), cost: parseFloat(r.cost),
      })),
      dailyBreakdown: dailyBreakdown.rows.map((r) => ({
        date: r.date, tokens: parseInt(r.tokens, 10), cost: parseFloat(r.cost),
      })),
    }

    if (requestedUserId && isAdmin) {
      response.userSpecific = {
        userId: effectiveUserId,
        totalTokens: response.totalTokens,
        totalCostEstimate: response.totalCostEstimate,
      }
    }

    return reply.send(response)
  })

  fastify.post(
    '/api/diagnostics/token-usage/cost-rates',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const adminUser = request.user as { userId: string }

      let body: z.infer<typeof costRatesBody>
      try {
        body = costRatesBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [existing] } = await db.query<{ value: Record<string, unknown> }>(
        "SELECT value FROM system_config WHERE key = 'cost_per_1k_tokens'",
      )
      const merged = { ...(existing?.value ?? {}), ...body.rates }

      await db.query(
        `INSERT INTO system_config (key, value, updated_by, updated_at)
         VALUES ('cost_per_1k_tokens', $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
        [JSON.stringify(merged), adminUser.userId],
      )

      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, details)
         VALUES ($1, 'token_usage.cost_rates.update', 'system', $2)`,
        [adminUser.userId, JSON.stringify(body.rates)],
      )

      return reply.send({ ok: true, rates: merged })
    },
  )

  fastify.get('/api/system/queue-health', { preHandler: authenticate }, async (_request, reply) => {
    try {
      const incoming = queues.messagesIncoming
      const [waiting, active, failed] = await Promise.all([
        incoming.getWaitingCount(),
        incoming.getActiveCount(),
        incoming.getFailedCount(),
      ])
      const totalDepth = waiting + active
      const aiDelayed = totalDepth > 10

      return reply.send({
        ok: true,
        queueDepth: totalDepth,
        waiting,
        active,
        failed,
        aiDelayed,
      })
    } catch {
      return reply.send({
        ok: false,
        queueDepth: 0,
        waiting: 0,
        active: 0,
        failed: 0,
        aiDelayed: false,
      })
    }
  })
}
