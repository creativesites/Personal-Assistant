import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
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
}
