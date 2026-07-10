import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

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

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/analytics/executive ────────────────────────────────────────

  fastify.get(
    '/api/analytics/executive',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [convStats] } = await db.query<{
        total: string
        today: string
        avg_per_day: string | null
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS today,
           (COUNT(*)::numeric / 30)::numeric(10,2) AS avg_per_day
         FROM conversations
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [convPrev] } = await db.query<{ prev_total: string }>(
        `SELECT COUNT(*) AS prev_total
         FROM conversations
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '60 days'
           AND created_at < NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const convTotal = parseInt(convStats.total, 10)
      const convPrevTotal = parseInt(convPrev.prev_total, 10)
      const convTrend = convPrevTotal > 0
        ? parseFloat(((convTotal - convPrevTotal) / convPrevTotal).toFixed(4))
        : 0

      const { rows: [msgStats] } = await db.query<{
        total: string
        inbound: string
        outbound: string
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE m.direction = 'inbound') AS inbound,
           COUNT(*) FILTER (WHERE m.direction = 'outbound') AS outbound
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [aiDraftedRow] } = await db.query<{ ai_drafted: string }>(
        `SELECT COUNT(*) AS ai_drafted
         FROM suggested_replies sr
         WHERE sr.user_id = $1
           AND sr.status IN ('approved', 'sent')
           AND sr.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [contactStats] } = await db.query<{
        total: string
        new_this_month: string
        active: string
        at_risk: string
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days') AS new_this_month,
           COUNT(*) FILTER (WHERE r.last_interaction_at >= NOW() - INTERVAL '7 days') AS active,
           COUNT(*) FILTER (WHERE r.health_score < 40) AS at_risk
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true`,
        [userId],
      )

      const { rows: [rtStats] } = await db.query<{
        avg_minutes: string | null
      }>(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (last_message_at - created_at)) / 60)::numeric(10,2) AS avg_minutes
         FROM conversations
         WHERE user_id = $1
           AND last_message_at IS NOT NULL
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const avgMinutes = rtStats.avg_minutes ? parseFloat(rtStats.avg_minutes) : 0
      const p50Minutes = avgMinutes * 0.7
      const p95Minutes = avgMinutes * 2.1

      const msgTotal = parseInt(msgStats.total, 10)
      const outbound = parseInt(msgStats.outbound, 10)
      const aiDrafted = parseInt(aiDraftedRow.ai_drafted, 10)
      const aiAutomationRate = outbound > 0
        ? parseFloat((aiDrafted / outbound).toFixed(4))
        : 0

      const { rows: [proactiveRow] } = await db.query<{ approved: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'approved') AS approved,
           COUNT(*) AS total
         FROM proactive_items
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const contactTotal = parseInt(contactStats.total, 10)
      const activeContacts = parseInt(contactStats.active, 10)
      const atRiskContacts = parseInt(contactStats.at_risk, 10)

      const convHealth = Math.min(100, (convTotal / 30) * 10)
      const rtHealth = avgMinutes < 60 ? 100 : avgMinutes < 240 ? 70 : avgMinutes < 720 ? 40 : 20
      const contactHealth = contactTotal > 0 ? Math.max(0, 100 - (atRiskContacts / contactTotal) * 100) : 50
      const aiRateScore = aiAutomationRate * 100
      const proactiveTotal = parseInt(proactiveRow.total, 10)
      const proactiveApproved = parseInt(proactiveRow.approved, 10)
      const proactiveHealth = proactiveTotal > 0
        ? (proactiveApproved / proactiveTotal) * 100
        : 50

      const healthScore = Math.round(
        convHealth * 0.2 +
        rtHealth * 0.25 +
        contactHealth * 0.2 +
        aiRateScore * 0.2 +
        proactiveHealth * 0.15,
      )

      const { rows: opportunityRows } = await db.query<{
        id: string
        name: string
        lead_score: string | null
        pipeline_stage: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           c.lead_score,
           c.pipeline_stage
         FROM contacts c
         WHERE c.user_id = $1
           AND c.is_active = true
           AND COALESCE(c.lead_score, 0) > 60
         ORDER BY c.lead_score DESC
         LIMIT 5`,
        [userId],
      )

      const topOpportunities = opportunityRows.map((r) => ({
        contactId: r.id,
        contactName: r.name,
        reason: `Lead score ${r.lead_score} — stage: ${r.pipeline_stage ?? 'unset'}`,
        estimatedValue: parseInt(r.lead_score ?? '0', 10) * 1000,
      }))

      const alerts: Array<{ type: string; message: string; severity: string }> = []
      if (atRiskContacts > 0) {
        alerts.push({ type: 'health', message: `${atRiskContacts} contacts have low health scores`, severity: 'warning' })
      }
      if (aiAutomationRate < 0.1) {
        alerts.push({ type: 'ai_adoption', message: 'AI automation rate is below 10%', severity: 'info' })
      }

      return reply.send({
        period: '30d',
        conversations: {
          total: convTotal,
          today: parseInt(convStats.today, 10),
          avgPerDay: convStats.avg_per_day ? parseFloat(convStats.avg_per_day) : 0,
          trend: convTrend,
        },
        messages: {
          total: msgTotal,
          inbound: parseInt(msgStats.inbound, 10),
          outbound,
          aiDrafted,
        },
        contacts: {
          total: contactTotal,
          newThisMonth: parseInt(contactStats.new_this_month, 10),
          active: activeContacts,
          atRisk: atRiskContacts,
        },
        responseTime: {
          avgMinutes: parseFloat(avgMinutes.toFixed(1)),
          p50Minutes: parseFloat(p50Minutes.toFixed(1)),
          p95Minutes: parseFloat(p95Minutes.toFixed(1)),
        },
        aiAutomationRate,
        healthScore,
        topOpportunities,
        alerts,
      })
    },
  )

  // ── GET /api/analytics/sales ─────────────────────────────────────────────

  fastify.get(
    '/api/analytics/sales',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: pipelineRows } = await db.query<{
        pipeline_stage: string | null
        count: string
        avg_score: string | null
      }>(
        `SELECT
           pipeline_stage,
           COUNT(*) AS count,
           AVG(COALESCE(lead_score, 0))::numeric(10,2) AS avg_score
         FROM contacts
         WHERE user_id = $1
           AND is_active = true
         GROUP BY pipeline_stage`,
        [userId],
      )

      const stageMap = new Map(pipelineRows.map((r) => [r.pipeline_stage ?? 'none', r]))
      const hot = parseInt(stageMap.get('hot')?.count ?? '0', 10)
      const warm = parseInt(stageMap.get('warm')?.count ?? '0', 10)
      const cold = parseInt(stageMap.get('cold')?.count ?? '0', 10)
      const totalLeads = pipelineRows.reduce((s, r) => s + parseInt(r.count, 10), 0)

      const { rows: [avgScoreRow] } = await db.query<{ avg_score: string | null }>(
        `SELECT AVG(COALESCE(lead_score, 0))::numeric(10,2) AS avg_score
         FROM contacts
         WHERE user_id = $1
           AND is_active = true`,
        [userId],
      )

      const leadToWarm = cold > 0 ? parseFloat((warm / cold).toFixed(4)) : 0
      const warmToHot = warm > 0 ? parseFloat((hot / warm).toFixed(4)) : 0

      const { rows: topLeadRows } = await db.query<{
        id: string
        name: string
        lead_score: string | null
        pipeline_stage: string | null
        company: string | null
        last_interaction_at: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           c.lead_score,
           c.pipeline_stage,
           c.company,
           r.last_interaction_at
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
         ORDER BY COALESCE(c.lead_score, 0) DESC
         LIMIT 10`,
        [userId],
      )

      const { rows: [velocityRow] } = await db.query<{ avg_days: string | null }>(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400)::numeric(10,2) AS avg_days
         FROM contacts c
         WHERE c.user_id = $1
           AND c.is_active = true
           AND c.pipeline_stage IS NOT NULL`,
        [userId],
      )

      const byStage = pipelineRows.map((r) => ({
        stage: r.pipeline_stage ?? 'none',
        count: parseInt(r.count, 10),
        avgScore: r.avg_score ? parseFloat(r.avg_score) : 0,
      }))

      return reply.send({
        period: '30d',
        pipeline: {
          hot,
          warm,
          cold,
          totalLeads,
          avgLeadScore: avgScoreRow.avg_score ? parseFloat(avgScoreRow.avg_score) : 0,
        },
        conversion: {
          leadToWarm,
          warmToHot,
        },
        topLeads: topLeadRows.map((r) => ({
          id: r.id,
          name: r.name,
          score: parseInt(r.lead_score ?? '0', 10),
          stage: r.pipeline_stage ?? 'none',
          company: r.company ?? null,
          lastContact: r.last_interaction_at ?? null,
        })),
        velocity: {
          avgDaysInPipeline: velocityRow.avg_days ? parseFloat(velocityRow.avg_days) : 0,
        },
        byStage,
      })
    },
  )

  // ── GET /api/analytics/customers ─────────────────────────────────────────

  fastify.get(
    '/api/analytics/customers',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [segmentRow] } = await db.query<{
        vip: string
        active: string
        at_risk: string
        dormant: string
        new_count: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE r.importance_tier = 'high') AS vip,
           COUNT(*) FILTER (WHERE r.last_interaction_at >= NOW() - INTERVAL '7 days') AS active,
           COUNT(*) FILTER (WHERE r.health_score < 40) AS at_risk,
           COUNT(*) FILTER (WHERE r.last_interaction_at < NOW() - INTERVAL '30 days' OR r.last_interaction_at IS NULL) AS dormant,
           COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days') AS new_count
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true`,
        [userId],
      )

      const { rows: [healthDist] } = await db.query<{
        excellent: string
        good: string
        fair: string
        poor: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE r.health_score >= 80) AS excellent,
           COUNT(*) FILTER (WHERE r.health_score >= 60 AND r.health_score < 80) AS good,
           COUNT(*) FILTER (WHERE r.health_score >= 40 AND r.health_score < 60) AS fair,
           COUNT(*) FILTER (WHERE r.health_score < 40) AS poor
         FROM relationships r
         WHERE r.user_id = $1`,
        [userId],
      )

      const { rows: topCustomerRows } = await db.query<{
        id: string
        name: string
        health_score: string | null
        importance_tier: string | null
        last_interaction_at: string | null
        interaction_count: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           r.health_score,
           r.importance_tier,
           r.last_interaction_at,
           r.interaction_count
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
         ORDER BY COALESCE(r.health_score, 0) DESC
         LIMIT 10`,
        [userId],
      )

      const { rows: [growthRow] } = await db.query<{
        this_month: string
        last_month: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') AS last_month
         FROM contacts
         WHERE user_id = $1
           AND is_active = true`,
        [userId],
      )

      const { rows: [avgStats] } = await db.query<{
        avg_health: string | null
        avg_interactions: string | null
      }>(
        `SELECT
           AVG(health_score)::numeric(10,2) AS avg_health,
           AVG(interaction_count)::numeric(10,2) AS avg_interactions
         FROM relationships
         WHERE user_id = $1`,
        [userId],
      )

      const thisMonth = parseInt(growthRow.this_month, 10)
      const lastMonth = parseInt(growthRow.last_month, 10)
      const growthRate = lastMonth > 0
        ? parseFloat(((thisMonth - lastMonth) / lastMonth).toFixed(4))
        : 0

      return reply.send({
        period: '30d',
        segments: {
          vip: parseInt(segmentRow.vip, 10),
          active: parseInt(segmentRow.active, 10),
          atRisk: parseInt(segmentRow.at_risk, 10),
          dormant: parseInt(segmentRow.dormant, 10),
          new: parseInt(segmentRow.new_count, 10),
        },
        healthDistribution: {
          excellent: parseInt(healthDist.excellent, 10),
          good: parseInt(healthDist.good, 10),
          fair: parseInt(healthDist.fair, 10),
          poor: parseInt(healthDist.poor, 10),
        },
        topCustomers: topCustomerRows.map((r) => ({
          id: r.id,
          name: r.name,
          healthScore: r.health_score ? parseFloat(r.health_score) : 0,
          tier: r.importance_tier ?? 'medium',
          lastContact: r.last_interaction_at ?? null,
          interactions: parseInt(r.interaction_count ?? '0', 10),
        })),
        growthRate,
        avgHealthScore: avgStats.avg_health ? parseFloat(avgStats.avg_health) : 0,
        avgInteractions: avgStats.avg_interactions ? parseFloat(avgStats.avg_interactions) : 0,
      })
    },
  )

  // ── GET /api/analytics/conversations ─────────────────────────────────────

  fastify.get(
    '/api/analytics/conversations',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [volRow] } = await db.query<{
        total: string
        today: string
        this_week: string
        avg_per_day: string | null
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS today,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS this_week,
           (COUNT(*)::numeric / 30)::numeric(10,2) AS avg_per_day
         FROM conversations
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [sentimentRow] } = await db.query<{
        positive: string
        negative: string
        neutral: string
        mixed: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE ma.sentiment = 'positive') AS positive,
           COUNT(*) FILTER (WHERE ma.sentiment = 'negative') AS negative,
           COUNT(*) FILTER (WHERE ma.sentiment = 'neutral') AS neutral,
           COUNT(*) FILTER (WHERE ma.sentiment = 'mixed') AS mixed
         FROM message_analyses ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [urgencyRow] } = await db.query<{
        low: string
        medium: string
        high: string
        urgent: string
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE ma.response_urgency = 'low') AS low,
           COUNT(*) FILTER (WHERE ma.response_urgency = 'medium') AS medium,
           COUNT(*) FILTER (WHERE ma.response_urgency = 'high') AS high,
           COUNT(*) FILTER (WHERE ma.response_urgency = 'urgent') AS urgent
         FROM message_analyses ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [requiresRow] } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM message_analyses ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND ma.requires_response = true
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [srRow] } = await db.query<{ sr_count: string }>(
        `SELECT COUNT(DISTINCT conversation_id) AS sr_count
         FROM suggested_replies
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [avgImportRow] } = await db.query<{ avg_importance: string | null }>(
        `SELECT AVG(ma.importance_score)::numeric(10,2) AS avg_importance
         FROM message_analyses ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: topicRows } = await db.query<{ topic: string; count: string }>(
        `SELECT
           t.topic,
           COUNT(*) AS count
         FROM message_analyses ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
         CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ma.topics, '[]'::jsonb)) AS t(topic)
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY t.topic
         ORDER BY count DESC
         LIMIT 10`,
        [userId],
      )

      const { rows: dailyRows } = await db.query<{
        date: string
        count: string
        sentiment: string | null
      }>(
        `SELECT
           DATE(c.created_at AT TIME ZONE 'UTC') AS date,
           COUNT(DISTINCT c.id) AS count,
           MODE() WITHIN GROUP (ORDER BY ma.sentiment) AS sentiment
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         LEFT JOIN message_analyses ma ON ma.message_id = m.id
         WHERE c.user_id = $1
           AND c.created_at >= NOW() - INTERVAL '14 days'
         GROUP BY DATE(c.created_at AT TIME ZONE 'UTC')
         ORDER BY date ASC`,
        [userId],
      )

      const convTotal = parseInt(volRow.total, 10)
      const srCount = parseInt(srRow.sr_count, 10)
      const aiAssistanceRate = convTotal > 0 ? parseFloat((srCount / convTotal).toFixed(4)) : 0

      return reply.send({
        period: '30d',
        volume: {
          total: convTotal,
          today: parseInt(volRow.today, 10),
          thisWeek: parseInt(volRow.this_week, 10),
          avgPerDay: volRow.avg_per_day ? parseFloat(volRow.avg_per_day) : 0,
        },
        sentiment: {
          positive: parseInt(sentimentRow.positive, 10),
          negative: parseInt(sentimentRow.negative, 10),
          neutral: parseInt(sentimentRow.neutral, 10),
          mixed: parseInt(sentimentRow.mixed, 10),
        },
        urgency: {
          low: parseInt(urgencyRow.low, 10),
          medium: parseInt(urgencyRow.medium, 10),
          high: parseInt(urgencyRow.high, 10),
          urgent: parseInt(urgencyRow.urgent, 10),
        },
        requiresResponse: parseInt(requiresRow.count, 10),
        aiAssistanceRate,
        avgImportanceScore: avgImportRow.avg_importance ? parseFloat(avgImportRow.avg_importance) : 0,
        topTopics: topicRows.map((r) => ({ topic: r.topic, count: parseInt(r.count, 10) })),
        daily: dailyRows.map((r) => ({
          date: r.date,
          count: parseInt(r.count, 10),
          sentiment: r.sentiment ?? 'neutral',
        })),
      })
    },
  )

  // ── GET /api/analytics/operations ────────────────────────────────────────

  fastify.get(
    '/api/analytics/operations',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [liveRow] } = await db.query<{
        active_conversations: string
        pending_replies: string
        escalations_open: string
        agents_active: string
      }>(
        `SELECT
           (SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND last_message_at >= NOW() - INTERVAL '1 hour') AS active_conversations,
           (SELECT COUNT(*) FROM suggested_replies WHERE user_id = $1 AND status = 'pending') AS pending_replies,
           (SELECT COUNT(*) FROM escalations WHERE user_id = $1 AND status = 'open') AS escalations_open,
           (SELECT COUNT(*) FROM agents WHERE user_id = $1 AND is_active = true) AS agents_active`,
        [userId],
      )

      const { rows: [queueRow] } = await db.query<{
        depth: string
        oldest: string | null
      }>(
        `SELECT
           COUNT(*) AS depth,
           MIN(created_at) AS oldest
         FROM suggested_replies
         WHERE user_id = $1
           AND status = 'pending'`,
        [userId],
      )

      const { rows: recentRows } = await db.query<{
        direction: string
        body: string | null
        created_at: string
        contact_name: string | null
      }>(
        `SELECT
           m.direction,
           m.body,
           m.created_at,
           COALESCE(c.custom_name, c.display_name) AS contact_name
         FROM messages m
         JOIN conversations conv ON conv.id = m.conversation_id
         LEFT JOIN contacts c ON c.id = conv.contact_id
         WHERE conv.user_id = $1
           AND m.direction = 'inbound'
         ORDER BY m.created_at DESC
         LIMIT 20`,
        [userId],
      )

      const recentActivity = recentRows.map((r) => ({
        type: 'inbound_message',
        description: `Message from ${r.contact_name ?? 'unknown'}: ${(r.body ?? '').slice(0, 60)}`,
        timestamp: r.created_at,
      }))

      return reply.send({
        live: {
          activeConversations: parseInt(liveRow.active_conversations, 10),
          pendingReplies: parseInt(liveRow.pending_replies, 10),
          escalationsOpen: parseInt(liveRow.escalations_open, 10),
          agentsActive: parseInt(liveRow.agents_active, 10),
        },
        queue: {
          depth: parseInt(queueRow.depth, 10),
          oldest: queueRow.oldest ?? null,
        },
        recentActivity,
      })
    },
  )

  // ── GET /api/analytics/opportunities ─────────────────────────────────────

  fastify.get(
    '/api/analytics/opportunities',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: oppRows } = await db.query<{
        id: string
        name: string
        lead_score: string | null
        pipeline_stage: string | null
        last_interaction_at: string | null
        insight_value: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           c.lead_score,
           c.pipeline_stage,
           r.last_interaction_at,
           (
             SELECT ci.value FROM contact_insights ci
             WHERE ci.contact_id = c.id AND ci.user_id = c.user_id AND ci.is_active = true
             ORDER BY ci.confidence DESC
             LIMIT 1
           ) AS insight_value
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
           AND COALESCE(c.lead_score, 0) > 40
         ORDER BY COALESCE(c.lead_score, 0) DESC
         LIMIT 20`,
        [userId],
      )

      const { rows: [totalValueRow] } = await db.query<{ total: string | null }>(
        `SELECT SUM(lead_score * 1000)::numeric(20,0) AS total
         FROM contacts
         WHERE user_id = $1
           AND is_active = true
           AND pipeline_stage IN ('hot', 'warm')
           AND lead_score IS NOT NULL`,
        [userId],
      )

      const opportunities = oppRows.map((r) => {
        const score = parseInt(r.lead_score ?? '0', 10)
        const urgency = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
        return {
          id: r.id,
          contactName: r.name,
          contactId: r.id,
          reason: `Lead score ${score}, stage: ${r.pipeline_stage ?? 'unset'}`,
          estimatedValue: score * 1000,
          urgency,
          lastContact: r.last_interaction_at ?? null,
          pipelineStage: r.pipeline_stage ?? null,
          leadScore: score,
          insight: r.insight_value ?? null,
        }
      })

      return reply.send({
        totalEstimatedValue: totalValueRow.total ? parseInt(totalValueRow.total, 10) : 0,
        opportunities,
      })
    },
  )

  // ── GET /api/analytics/predictions ───────────────────────────────────────

  fastify.get(
    '/api/analytics/predictions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: churnRows } = await db.query<{
        id: string
        name: string
        health_score: string | null
        days_since: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           r.health_score,
           EXTRACT(EPOCH FROM (NOW() - r.last_interaction_at)) / 86400 AS days_since
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
           AND (
             COALESCE(r.health_score, 50) < 40
             OR r.last_interaction_at < NOW() - INTERVAL '20 days'
             OR r.last_interaction_at IS NULL
           )
         ORDER BY COALESCE(r.health_score, 50) ASC
         LIMIT 20`,
        [userId],
      )

      const { rows: buyingRows } = await db.query<{
        id: string
        name: string
        lead_score: string | null
        pipeline_stage: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           c.lead_score,
           c.pipeline_stage
         FROM contacts c
         WHERE c.user_id = $1
           AND c.is_active = true
           AND COALESCE(c.lead_score, 0) > 60
         ORDER BY c.lead_score DESC
         LIMIT 10`,
        [userId],
      )

      const { rows: peakRows } = await db.query<{ hour: string; message_count: string }>(
        `SELECT
           EXTRACT(HOUR FROM m.created_at)::int AS hour,
           COUNT(*) AS message_count
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY EXTRACT(HOUR FROM m.created_at)
         ORDER BY hour ASC`,
        [userId],
      )

      const { rows: followUpRows } = await db.query<{
        id: string
        name: string
        days_since: string | null
        importance_tier: string | null
      }>(
        `SELECT
           c.id,
           COALESCE(c.custom_name, c.display_name) AS name,
           EXTRACT(EPOCH FROM (NOW() - r.last_interaction_at)) / 86400 AS days_since,
           r.importance_tier
         FROM contacts c
         LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
           AND (r.last_interaction_at < NOW() - INTERVAL '14 days' OR r.last_interaction_at IS NULL)
           AND COALESCE(r.importance_tier, 'medium') != 'low'
         ORDER BY r.last_interaction_at ASC NULLS FIRST
         LIMIT 15`,
        [userId],
      )

      const churnRisk = churnRows.map((r) => {
        const days = r.days_since ? parseFloat(r.days_since) : 999
        const health = r.health_score ? parseFloat(r.health_score) : 50
        const riskLevel = (health < 30 || days > 30) ? 'high' : (health < 50 || days > 20) ? 'medium' : 'low'
        return {
          contactId: r.id,
          name: r.name,
          healthScore: health,
          daysSinceContact: Math.round(days),
          riskLevel,
        }
      })

      const buyingSignals = buyingRows.map((r) => ({
        contactId: r.id,
        name: r.name,
        leadScore: parseInt(r.lead_score ?? '0', 10),
        stage: r.pipeline_stage ?? 'none',
        signals: ['High lead score', r.pipeline_stage ? `In ${r.pipeline_stage} stage` : 'Unassigned stage'],
      }))

      const peakHours = peakRows.map((r) => ({
        hour: parseInt(r.hour, 10),
        messageCount: parseInt(r.message_count, 10),
      }))

      const followUpNeeded = followUpRows.map((r) => {
        const days = r.days_since ? Math.round(parseFloat(r.days_since)) : 999
        return {
          contactId: r.id,
          name: r.name,
          daysSince: days,
          urgency: days > 30 ? 'high' : days > 21 ? 'medium' : 'low',
        }
      })

      const insights: string[] = []
      if (churnRisk.length > 0) {
        insights.push(`${churnRisk.length} contacts are at risk of going dormant — reach out proactively.`)
      }
      if (buyingSignals.length > 0) {
        insights.push(`${buyingSignals.length} contacts show strong buying signals — prioritise follow-up.`)
      }
      if (peakHours.length > 0) {
        const peak = peakHours.reduce((a, b) => b.messageCount > a.messageCount ? b : a, peakHours[0])
        insights.push(`Peak messaging activity is at ${peak.hour}:00 — schedule outreach around this time.`)
      }
      if (followUpNeeded.length > 0) {
        insights.push(`${followUpNeeded.length} important contacts have not been contacted in over 14 days.`)
      }
      insights.push('Consistent daily outreach to top contacts improves relationship health scores over time.')

      return reply.send({
        churnRisk,
        buyingSignals,
        peakHours,
        followUpNeeded,
        insights,
      })
    },
  )

  // ── GET /api/analytics/health ─────────────────────────────────────────────

  fastify.get(
    '/api/analytics/health',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [convRow] } = await db.query<{ count_30d: string; count_prev: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS count_30d,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') AS count_prev
         FROM conversations
         WHERE user_id = $1`,
        [userId],
      )

      const { rows: [rtRow] } = await db.query<{ avg_minutes: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (last_message_at - created_at)) / 60)::numeric(10,2) AS avg_minutes
         FROM conversations
         WHERE user_id = $1
           AND last_message_at IS NOT NULL
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [custRow] } = await db.query<{
        avg_health: string | null
        at_risk: string
        total: string
      }>(
        `SELECT
           AVG(health_score)::numeric(10,2) AS avg_health,
           COUNT(*) FILTER (WHERE health_score < 40) AS at_risk,
           COUNT(*) AS total
         FROM relationships
         WHERE user_id = $1`,
        [userId],
      )

      const { rows: [aiRow] } = await db.query<{
        approved: string
        outbound: string
      }>(
        `SELECT
           (SELECT COUNT(*) FROM suggested_replies WHERE user_id = $1 AND status IN ('approved','sent') AND created_at >= NOW() - INTERVAL '30 days') AS approved,
           (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.direction = 'outbound' AND m.created_at >= NOW() - INTERVAL '30 days') AS outbound`,
        [userId],
      )

      const { rows: [proactiveRow] } = await db.query<{ approved: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'approved') AS approved,
           COUNT(*) AS total
         FROM proactive_items
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const c30 = parseInt(convRow.count_30d, 10)
      const cPrev = parseInt(convRow.count_prev, 10)
      const avgMin = rtRow.avg_minutes ? parseFloat(rtRow.avg_minutes) : 0
      const avgHealth = custRow.avg_health ? parseFloat(custRow.avg_health) : 50
      const atRisk = parseInt(custRow.at_risk, 10)
      const custTotal = parseInt(custRow.total, 10)
      const aiApproved = parseInt(aiRow.approved, 10)
      const outbound = parseInt(aiRow.outbound, 10)
      const proApproved = parseInt(proactiveRow.approved, 10)
      const proTotal = parseInt(proactiveRow.total, 10)

      const convScore = Math.min(100, (c30 / 30) * 10 + 50)
      const rtScore = avgMin < 60 ? 100 : avgMin < 240 ? 75 : avgMin < 720 ? 50 : 20
      const custScore = avgHealth > 0 ? Math.min(100, avgHealth) : 50
      const aiScore = outbound > 0 ? Math.min(100, (aiApproved / outbound) * 100) : 30
      const proScore = proTotal > 0 ? Math.min(100, (proApproved / proTotal) * 100) : 50

      const overall = Math.round(
        convScore * 0.2 + rtScore * 0.25 + custScore * 0.2 + aiScore * 0.2 + proScore * 0.15,
      )

      const grade = overall >= 90 ? 'A' : overall >= 75 ? 'B' : overall >= 60 ? 'C' : overall >= 40 ? 'D' : 'F'
      const trend = c30 > cPrev ? 'improving' : c30 < cPrev ? 'declining' : 'stable'

      const statusLabel = (score: number): 'excellent' | 'good' | 'fair' | 'poor' =>
        score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'

      return reply.send({
        overall,
        grade,
        trend,
        components: [
          {
            name: 'Conversations',
            score: Math.round(convScore),
            weight: 0.2,
            status: statusLabel(convScore),
            detail: `${c30} conversations in last 30 days`,
          },
          {
            name: 'Response Speed',
            score: Math.round(rtScore),
            weight: 0.25,
            status: statusLabel(rtScore),
            detail: `Avg ${Math.round(avgMin)} min response time`,
          },
          {
            name: 'Customer Health',
            score: Math.round(custScore),
            weight: 0.2,
            status: statusLabel(custScore),
            detail: `Avg health ${Math.round(avgHealth)}, ${atRisk} at risk of ${custTotal}`,
          },
          {
            name: 'AI Adoption',
            score: Math.round(aiScore),
            weight: 0.2,
            status: statusLabel(aiScore),
            detail: `${aiApproved} AI replies of ${outbound} outbound messages`,
          },
          {
            name: 'Proactive Engagement',
            score: Math.round(proScore),
            weight: 0.15,
            status: statusLabel(proScore),
            detail: `${proApproved} proactive actions approved of ${proTotal} suggested`,
          },
        ],
      })
    },
  )

  // ── GET /api/analytics/roi ────────────────────────────────────────────────

  fastify.get(
    '/api/analytics/roi',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [aiRepliesRow] } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM suggested_replies
         WHERE user_id = $1
           AND status IN ('approved', 'sent')
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [leadsRow] } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM contacts
         WHERE user_id = $1
           AND COALESCE(lead_score, 0) > 0
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [proactiveRow] } = await db.query<{ approved: string }>(
        `SELECT COUNT(*) AS approved
         FROM proactive_items
         WHERE user_id = $1
           AND status = 'approved'
           AND updated_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const { rows: [srApprovedRow] } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM suggested_replies
         WHERE user_id = $1
           AND status IN ('approved', 'sent')
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

      const aiRepliesSent = parseInt(aiRepliesRow.count, 10)
      const hoursSaved = parseFloat(((aiRepliesSent * 3) / 60).toFixed(2))
      const leadsFound = parseInt(leadsRow.count, 10)
      const followUpsAutomated = parseInt(proactiveRow.approved, 10)
      const tasksCompleted = followUpsAutomated + parseInt(srApprovedRow.count, 10)
      const fteEquivalent = parseFloat((hoursSaved / 160).toFixed(4))
      const estimatedSalarySaved = parseFloat((fteEquivalent * 150000 / 12).toFixed(2))

      return reply.send({
        period: '30d',
        aiRepliesSent,
        hoursSaved,
        leadsFound,
        followUpsAutomated,
        tasksCompleted,
        fteEquivalent,
        estimatedSalarySaved,
      })
    },
  )

  // ── GET /api/analytics/timeline ───────────────────────────────────────────

  fastify.get(
    '/api/analytics/timeline',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: contactEvents } = await db.query<{
        id: string
        title: string
        description: string
        timestamp: string
        contact_id: string | null
        contact_name: string | null
      }>(
        `SELECT
           c.id,
           'New contact: ' || COALESCE(c.custom_name, c.display_name) AS title,
           'Contact added' AS description,
           c.created_at AS timestamp,
           c.id AS contact_id,
           COALESCE(c.custom_name, c.display_name) AS contact_name
         FROM contacts c
         WHERE c.user_id = $1
         ORDER BY c.created_at DESC
         LIMIT 20`,
        [userId],
      )

      const { rows: eventRows } = await db.query<{
        id: string
        event_type: string
        title: string
        timestamp: string
        contact_id: string | null
        contact_name: string | null
      }>(
        `SELECT
           e.id,
           e.event_type,
           e.title,
           e.event_date AS timestamp,
           e.contact_id,
           COALESCE(c.custom_name, c.display_name) AS contact_name
         FROM events e
         LEFT JOIN contacts c ON c.id = e.contact_id
         WHERE e.user_id = $1
         ORDER BY e.event_date DESC
         LIMIT 20`,
        [userId],
      )

      const { rows: keyConvRows } = await db.query<{
        id: string
        created_at: string
        contact_id: string | null
        contact_name: string | null
        body: string | null
      }>(
        `SELECT
           m.id,
           m.created_at,
           conv.contact_id,
           COALESCE(c.custom_name, c.display_name) AS contact_name,
           m.body
         FROM messages m
         JOIN conversations conv ON conv.id = m.conversation_id
         JOIN message_analyses ma ON ma.message_id = m.id
         LEFT JOIN contacts c ON c.id = conv.contact_id
         WHERE conv.user_id = $1
           AND COALESCE(ma.importance_score, 0) >= 0.7
         ORDER BY m.created_at DESC
         LIMIT 15`,
        [userId],
      )

      const allEvents = [
        ...contactEvents.map((r) => ({
          id: r.id,
          type: 'new_contact',
          title: r.title,
          description: r.description,
          timestamp: r.timestamp,
          contactId: r.contact_id ?? null,
          contactName: r.contact_name ?? null,
        })),
        ...eventRows.map((r) => ({
          id: r.id,
          type: r.event_type,
          title: r.title,
          description: `Event: ${r.title}`,
          timestamp: r.timestamp,
          contactId: r.contact_id ?? null,
          contactName: r.contact_name ?? null,
        })),
        ...keyConvRows.map((r) => ({
          id: r.id,
          type: 'key_conversation',
          title: `Key conversation with ${r.contact_name ?? 'unknown'}`,
          description: (r.body ?? '').slice(0, 80),
          timestamp: r.created_at,
          contactId: r.contact_id ?? null,
          contactName: r.contact_name ?? null,
        })),
      ]

      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      return reply.send({ events: allEvents.slice(0, 50) })
    },
  )

  // ── GET /api/analytics/team ───────────────────────────────────────────────

  fastify.get(
    '/api/analytics/team',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: agentRows } = await db.query<{
        id: string
        name: string
        is_active: boolean
        messages_handled: string | null
      }>(
        `SELECT
           id,
           name,
           is_active,
           COALESCE(messages_handled, 0) AS messages_handled
         FROM agents
         WHERE user_id = $1
         ORDER BY COALESCE(messages_handled, 0) DESC`,
        [userId],
      )

      const { rows: [escalationRow] } = await db.query<{
        total: string
        open: string
        resolved: string
        avg_resolution_hours: string | null
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'open') AS open,
           COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
           AVG(
             CASE WHEN status = 'resolved'
               THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600
             END
           )::numeric(10,2) AS avg_resolution_hours
         FROM escalations
         WHERE user_id = $1`,
        [userId],
      )

      const agents = agentRows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: r.is_active,
        messagesHandled: parseInt(r.messages_handled ?? '0', 10),
      }))

      const totalAgents = agents.length
      const activeAgents = agents.filter((a) => a.isActive).length
      const totalMessagesHandled = agents.reduce((s, a) => s + a.messagesHandled, 0)

      return reply.send({
        period: '30d',
        agents,
        escalations: {
          total: parseInt(escalationRow.total, 10),
          open: parseInt(escalationRow.open, 10),
          resolved: parseInt(escalationRow.resolved, 10),
          avgResolutionHours: escalationRow.avg_resolution_hours
            ? parseFloat(escalationRow.avg_resolution_hours)
            : null,
        },
        summary: {
          totalAgents,
          activeAgents,
          totalMessagesHandled,
        },
      })
    },
  )

  // ── GET /api/analytics/overview ──────────────────────────────────────────

  fastify.get(
    '/api/analytics/overview',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

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

      const { rows: [responseTime] } = await db.query<{ avg_seconds: string | null }>(
        `SELECT AVG(time_to_decision_seconds)::numeric(10,2) AS avg_seconds
         FROM suggestion_outcomes
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
           AND time_to_decision_seconds IS NOT NULL`,
        [userId],
      )

      const { rows: [proactive] } = await db.query<{ approved_count: string }>(
        `SELECT COUNT(*) AS approved_count
         FROM proactive_items
         WHERE user_id = $1
           AND status = 'approved'
           AND updated_at >= NOW() - INTERVAL '30 days'`,
        [userId],
      )

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

      const stageMap = new Map(rows.map((r) => [r.stage, r]))

      const funnel = stages.map((stage, i) => {
        const row = stageMap.get(stage)
        const count = row ? parseInt(row.count, 10) : 0
        const avgDays = row?.avg_days_in_stage ? parseFloat(row.avg_days_in_stage) : null

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

      const { rows: [conv] } = await db.query<{ id: string; contact_id: string | null }>(
        'SELECT id, contact_id FROM conversations WHERE id = $1 AND user_id = $2',
        [body.conversation_id, userId],
      )
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

      await db.query(
        `UPDATE conversation_funnel_stages
         SET exited_at = NOW()
         WHERE conversation_id = $1 AND user_id = $2 AND exited_at IS NULL`,
        [body.conversation_id, userId],
      )

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

      if (body.conversation_id) {
        const { rows: [conv] } = await db.query<{ id: string }>(
          'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
          [body.conversation_id, userId],
        )
        if (!conv) return reply.code(404).send({ error: 'Conversation not found' })
      }

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

  // ── GET /api/analytics/campaigns — Zuri Marketing funnel: post → lead → sale ──
  // Attribution is manual (contacts.source_social_post_id / source_product_id,
  // set via PATCH /api/contacts/:id) since there's no live click-tracking —
  // see docs/ZURI_MARKETING_EXPANSION.md §9/§12.5.
  fastify.get(
    '/api/analytics/campaigns',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: posts } = await db.query<{
        id: string
        platform: string
        account_name: string | null
        caption: string
        status: string
        sent_at: string | null
        product_name: string | null
        leads: string
        sales: string
      }>(
        `SELECT
           sp.id, sa.platform, sa.account_name, sp.caption, sp.status, sp.sent_at,
           pr.name AS product_name,
           COUNT(co.id) AS leads,
           COUNT(co.id) FILTER (WHERE co.customer_status = 'customer') AS sales
         FROM social_posts sp
         JOIN social_accounts sa ON sa.id = sp.social_account_id
         LEFT JOIN products pr ON pr.id = sp.product_id
         LEFT JOIN contacts co ON co.source_social_post_id = sp.id AND co.user_id = sp.user_id
         WHERE sp.user_id = $1 AND sp.status = 'sent'
         GROUP BY sp.id, sa.platform, sa.account_name, sp.caption, sp.status, sp.sent_at, pr.name
         ORDER BY sp.sent_at DESC`,
        [userId],
      )

      const { rows: products } = await db.query<{
        id: string
        name: string
        leads: string
        sales: string
      }>(
        `SELECT pr.id, pr.name,
                COUNT(co.id) AS leads,
                COUNT(co.id) FILTER (WHERE co.customer_status = 'customer') AS sales
         FROM products pr
         LEFT JOIN contacts co ON co.source_product_id = pr.id AND co.user_id = pr.user_id
         WHERE pr.user_id = $1
         GROUP BY pr.id, pr.name
         HAVING COUNT(co.id) > 0
         ORDER BY COUNT(co.id) DESC`,
        [userId],
      )

      const totalLeads = posts.reduce((sum, p) => sum + parseInt(p.leads, 10), 0)
      const totalSales = posts.reduce((sum, p) => sum + parseInt(p.sales, 10), 0)

      return reply.send({
        summary: {
          postsSent: posts.length,
          totalLeads,
          totalSales,
        },
        posts: posts.map((p) => ({
          id: p.id,
          platform: p.platform,
          accountName: p.account_name,
          caption: p.caption,
          productName: p.product_name,
          sentAt: p.sent_at,
          leads: parseInt(p.leads, 10),
          sales: parseInt(p.sales, 10),
        })),
        products: products.map((pr) => ({
          id: pr.id,
          name: pr.name,
          leads: parseInt(pr.leads, 10),
          sales: parseInt(pr.sales, 10),
        })),
      })
    },
  )
}
