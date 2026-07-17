import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticateAdmin } from '../plugins/authenticateAdmin'

// Membership Platform Phase 8 — Revenue Intelligence. Deterministic SQL only,
// no LLM call, same discipline as every other Zuri Insights-style endpoint
// in this codebase. MRR/DRR/WRR normalize each active/grace_period
// subscription's plan price to a daily rate via subscription_plans.
// duration_days, then scale to the requested cadence — a subscriber on a
// weekly plan still contributes correctly to MRR, and vice versa.

const matchBody = z.object({ text: z.string().min(3).max(2000) })
const adjustBody = z.object({
  extendDays: z.number().int().min(1).max(365).optional(),
  newPlanId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
})

export async function adminRevenueRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/admin/revenue ────────────────────────────────────────────
  fastify.get('/api/admin/revenue', { preHandler: authenticateAdmin }, async (_request, reply) => {
    const { rows: [rev] } = await db.query<{ daily_revenue_ngwee: string | null }>(
      `SELECT SUM(
         (CASE WHEN s.uses_own_api_key AND sp.price_ngwee_byok IS NOT NULL
               THEN sp.price_ngwee_byok ELSE sp.price_ngwee END)::numeric
         / NULLIF(sp.duration_days, 0)
       ) AS daily_revenue_ngwee
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.status IN ('active', 'grace_period') AND sp.plan_family != 'free' AND NOT sp.is_custom_pricing`,
    )
    const drr = Math.round(Number(rev.daily_revenue_ngwee ?? 0))
    const wrr = drr * 7
    const mrr = drr * 30

    const { rows: [trial] } = await db.query<{ trial_started: string; converted: string }>(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'trial_started') AS trial_started,
         COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'trial_started'
           AND user_id IN (SELECT user_id FROM subscription_events WHERE event_type = 'payment_approved')) AS converted
       FROM subscription_events
       WHERE event_type IN ('trial_started', 'payment_approved')`,
    )
    const trialStarted = Number(trial.trial_started)
    const trialConverted = Number(trial.converted)
    const trialConversionRate = trialStarted > 0 ? trialConverted / trialStarted : 0

    // Churn (last 30 days): subscriptions that entered grace_period (i.e. a
    // paid period lapsed without renewal) over everyone currently paying or
    // at risk of having just churned — the honest at-risk denominator.
    const { rows: [churn] } = await db.query<{ entered_grace: string; at_risk: string }>(
      `SELECT
         (SELECT COUNT(*) FROM subscription_events
           WHERE event_type = 'entered_grace_period' AND created_at > NOW() - INTERVAL '30 days') AS entered_grace,
         (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active', 'grace_period', 'read_only')) AS at_risk`,
    )
    const atRisk = Number(churn.at_risk)
    const churnRate = atRisk > 0 ? Number(churn.entered_grace) / atRisk : 0

    const { rows: [renewals] } = await db.query<{ due_today: string; failed_recent: string }>(
      `SELECT
         (SELECT COUNT(*) FROM subscriptions
           WHERE status = 'active' AND current_period_end::date = CURRENT_DATE) AS due_today,
         (SELECT COUNT(*) FROM payment_requests
           WHERE status = 'rejected' AND created_at > NOW() - INTERVAL '7 days') AS failed_recent`,
    )

    const { rows: byFamily } = await db.query<{ plan_family: string; count: string }>(
      `SELECT sp.plan_family, COUNT(*) AS count
       FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.status IN ('active', 'grace_period', 'trialing')
       GROUP BY sp.plan_family ORDER BY count DESC`,
    )

    return reply.send({
      mrrNgwee: mrr,
      wrrNgwee: wrr,
      drrNgwee: drr,
      trialConversionRate,
      trialStarted,
      trialConverted,
      churnRate,
      renewalsDueToday: Number(renewals.due_today),
      failedRenewalsLast7Days: Number(renewals.failed_recent),
      subscribersByFamily: byFamily.map((r) => ({ planFamily: r.plan_family, count: Number(r.count) })),
    })
  })

  // ─── POST /api/admin/payments/match — Intelligent Payment Detection ────
  // Honestly scoped: not a live SMS-reading integration (no such
  // infrastructure exists — see the Kotlin companion app's
  // NotificationListenerService for the natural future extension point).
  // The admin pastes the raw mobile-money confirmation text they received;
  // a plain-code parser extracts amount/phone-fragment/sender-name and
  // fuzzy-matches against pending payment_requests.
  fastify.post('/api/admin/payments/match', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { text } = matchBody.parse(request.body)

    const amountMatch = text.match(/(?:K|ZMW|kwacha)\s*([\d,]+(?:\.\d{1,2})?)/i)
    const parsedAmountNgwee = amountMatch ? Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100) : null

    const phoneMatch = text.match(/(?:0|\+260)?(\d{9,10})/)
    const phoneFragment = phoneMatch ? phoneMatch[1].slice(-8) : null

    const referenceMatch = text.match(/ZURI-[A-Z0-9]{4,}/i)
    const referenceCode = referenceMatch ? referenceMatch[0].toUpperCase() : null

    const { rows: pending } = await db.query<{
      id: string; reference_code: string; amount_ngwee: string; payer_phone_number: string | null
      user_email: string; user_name: string | null; plan_name: string; created_at: string
    }>(
      `SELECT pr.id, pr.reference_code, pr.amount_ngwee, pr.payer_phone_number,
              u.email AS user_email, u.full_name AS user_name, sp.name AS plan_name, pr.created_at
       FROM payment_requests pr
       JOIN users u ON u.id = pr.user_id
       JOIN subscription_plans sp ON sp.id = pr.plan_id
       WHERE pr.status = 'pending'
       ORDER BY pr.created_at DESC LIMIT 100`,
    )

    const candidates = pending.map((p) => {
      let score = 0
      const reasons: string[] = []
      if (referenceCode && p.reference_code.toUpperCase() === referenceCode) {
        score += 60
        reasons.push('Reference code matches exactly')
      }
      if (parsedAmountNgwee !== null && Number(p.amount_ngwee) === parsedAmountNgwee) {
        score += 30
        reasons.push('Amount matches exactly')
      }
      if (phoneFragment && p.payer_phone_number && p.payer_phone_number.slice(-8) === phoneFragment) {
        score += 10
        reasons.push('Phone number fragment matches')
      }
      return {
        paymentRequestId: p.id,
        referenceCode: p.reference_code,
        amountNgwee: Number(p.amount_ngwee),
        userEmail: p.user_email,
        userName: p.user_name,
        planName: p.plan_name,
        createdAt: p.created_at,
        confidence: Math.min(score, 100),
        reasons,
      }
    }).filter((c) => c.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)

    return reply.send({
      parsed: { amountNgwee: parsedAmountNgwee, phoneFragment, referenceCode },
      candidates: candidates.slice(0, 10),
    })
  })

  // ─── GET /api/admin/plans — for the manual-adjust plan picker ──────────
  fastify.get('/api/admin/plans', { preHandler: authenticateAdmin }, async (_request, reply) => {
    const { rows } = await db.query(
      `SELECT id, key, name, plan_family, billing_period, price_ngwee
       FROM subscription_plans WHERE is_active ORDER BY sort_order`,
    )
    return reply.send({
      plans: rows.map((r: any) => ({
        id: r.id, key: r.key, name: r.name, planFamily: r.plan_family,
        billingPeriod: r.billing_period, priceNgwee: Number(r.price_ngwee),
      })),
    })
  })

  // ─── POST /api/admin/users/:userId/adjust-subscription — manual adjustment
  // (extend days / change plan) on a user's subscription, reusing
  // admin_audit_log per the existing admin route conventions.
  fastify.post('/api/admin/users/:userId/adjust-subscription', { preHandler: authenticateAdmin }, async (request, reply) => {
    const adminUser = request.user as { userId: string }
    const { userId } = request.params as { userId: string }
    const body = adjustBody.parse(request.body)
    if (!body.extendDays && !body.newPlanId) {
      return reply.code(400).send({ error: 'Provide extendDays and/or newPlanId' })
    }

    const { rows: [sub] } = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    if (!sub) return reply.code(404).send({ error: 'Subscription not found' })
    const id = sub.id

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      if (body.extendDays) {
        await client.query(
          `UPDATE subscriptions SET
             current_period_end = COALESCE(current_period_end, NOW()) + ($1 || ' days')::interval,
             status = CASE WHEN status IN ('grace_period', 'read_only') THEN 'active' ELSE status END,
             updated_at = NOW()
           WHERE id = $2`,
          [body.extendDays, id],
        )
      }
      if (body.newPlanId) {
        await client.query(
          `UPDATE subscriptions s SET
             plan_id = p.id, billing_period = p.billing_period,
             messages_remaining_today = p.messages_per_day, ai_replies_remaining_today = p.ai_replies_per_day,
             nudges_remaining_today = p.proactive_nudges_per_day, documents_remaining_today = p.documents_per_day,
             updated_at = NOW()
           FROM subscription_plans p WHERE p.id = $1 AND s.id = $2`,
          [body.newPlanId, id],
        )
      }
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, metadata)
         VALUES ($1, 'plan_changed', $2::jsonb)`,
        [sub.user_id, JSON.stringify({ extendDays: body.extendDays ?? null, newPlanId: body.newPlanId ?? null, note: body.note ?? null, adjustedBy: adminUser.userId })],
      )
      await client.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'subscription.manual_adjust', 'subscription', $2, $3)`,
        [adminUser.userId, id, JSON.stringify(body)],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return reply.send({ ok: true })
  })
}
