import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Membership Platform Phase 5 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — Usage
// Engine's one compute-on-read endpoint (same "not a hot path" discipline as
// Studio's insights/customers endpoints) feeding the premium billing
// dashboard's usage cards and "this period Zuri helped you" narrative, plus
// the Billing Timeline reading subscription_events + payment_requests in
// one merged chronological feed (reflection.ts's timeline UNION ALL
// convention).

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/billing/usage-summary', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const { rows: [sub] } = await db.query<{ current_period_start: string | null }>(
      `SELECT current_period_start FROM subscriptions WHERE user_id = $1`,
      [userId],
    )
    // Free-tier/no-period subscriptions fall back to a trailing-30-day
    // window so the dashboard still shows something meaningful.
    const periodStart = sub?.current_period_start ?? new Date(Date.now() - 30 * 86_400_000).toISOString()

    const [documents, conversations, projects, customers, opportunities, interviews, invoices] = await Promise.all([
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM documents WHERE user_id = $1 AND created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM advisor_messages am
         JOIN advisor_sessions s ON s.id = am.session_id
         WHERE s.user_id = $1 AND am.role = 'user' AND am.created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM projects WHERE user_id = $1 AND created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND customer_status = 'customer' AND created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM career_opportunities WHERE user_id = $1 AND created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM career_interviews WHERE user_id = $1 AND created_at >= $2`,
        [userId, periodStart],
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM documents WHERE user_id = $1 AND document_type = 'invoice' AND created_at >= $2`,
        [userId, periodStart],
      ),
    ])

    const counts = {
      documentsGenerated: Number(documents.rows[0].count),
      aiConversations: Number(conversations.rows[0].count),
      projects: Number(projects.rows[0].count),
      customers: Number(customers.rows[0].count),
      jobsFound: Number(opportunities.rows[0].count),
      interviewsPrepared: Number(interviews.rows[0].count),
      invoicesSent: Number(invoices.rows[0].count),
    }

    // A documented estimate, not a measured figure — rough minutes-saved
    // weights per action, matching this codebase's existing "explicitly
    // labeled as an estimate" discipline (Business OS Phase G's cash-flow
    // notes, Career Radar's Skills sub-score).
    const hoursSaved = (
      counts.documentsGenerated * 30 +
      counts.aiConversations * 3 +
      counts.interviewsPrepared * 60 +
      counts.jobsFound * 15 +
      counts.projects * 6 +
      counts.customers * 10
    ) / 60

    return reply.send({
      periodStart,
      counts,
      hoursSavedEstimate: Math.round(hoursSaved * 10) / 10,
    })
  })

  fastify.get('/api/billing/timeline', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const { rows } = await db.query(
      `
      SELECT 'event' AS source, e.id, e.created_at, e.event_type AS label, e.metadata AS detail
      FROM subscription_events e
      WHERE e.user_id = $1

      UNION ALL

      SELECT 'payment' AS source, pr.id, pr.created_at, pr.status AS label,
             jsonb_build_object('referenceCode', pr.reference_code, 'amountNgwee', pr.amount_ngwee) AS detail
      FROM payment_requests pr
      WHERE pr.user_id = $1

      ORDER BY created_at DESC
      LIMIT 100
      `,
      [userId],
    )

    return reply.send({
      timeline: rows.map((r: any) => ({
        source: r.source,
        id: r.id,
        createdAt: r.created_at,
        label: r.label,
        detail: r.detail,
      })),
    })
  })
}
