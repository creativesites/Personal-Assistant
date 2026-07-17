import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticateAdmin } from '../plugins/authenticateAdmin'

// Admin side of the mobile-money payment flow — see
// docs/PRICING_PAYMENTS_PLAN.md §6. Mirrors GET /api/admin/billing's
// shape/authenticateAdmin/admin_audit_log conventions exactly.

const rejectBody = z.object({
  reason: z.string().min(1).max(500),
})

type PendingPaymentRow = {
  id: string
  user_id: string
  user_email: string
  user_name: string | null
  plan_name: string
  reference_code: string
  amount_ngwee: string
  payment_method: string
  status: string
  created_at: string
}

function toPaymentShape(r: PendingPaymentRow) {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userName: r.user_name,
    planName: r.plan_name,
    referenceCode: r.reference_code,
    amountNgwee: Number(r.amount_ngwee),
    paymentMethod: r.payment_method,
    status: r.status,
    createdAt: r.created_at,
  }
}

export async function adminPaymentsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/admin/payments',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const { status } = request.query as { status?: string }
      const filterStatus = status && ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending'

      const { rows } = await db.query<PendingPaymentRow>(
        `SELECT pr.id, pr.user_id, u.email AS user_email, u.full_name AS user_name,
                sp.name AS plan_name, pr.reference_code, pr.amount_ngwee,
                pr.payment_method, pr.status, pr.created_at
         FROM payment_requests pr
         JOIN users u ON u.id = pr.user_id
         JOIN subscription_plans sp ON sp.id = pr.plan_id
         WHERE pr.status = $1
         ORDER BY pr.created_at DESC
         LIMIT 100`,
        [filterStatus],
      )
      return reply.send({ payments: rows.map(toPaymentShape) })
    },
  )

  fastify.post(
    '/api/admin/payments/:id/approve',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const adminUser = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [pr] } = await db.query<{
        id: string; user_id: string; subscription_id: string; plan_id: string; status: string
      }>(
        `SELECT id, user_id, subscription_id, plan_id, status FROM payment_requests WHERE id = $1`,
        [id],
      )
      if (!pr) return reply.code(404).send({ error: 'Payment request not found' })
      if (pr.status !== 'pending') return reply.code(409).send({ error: 'Payment request already reviewed' })

      const { rows: [plan] } = await db.query<{
        duration_days: number; billing_period: string | null
        messages_per_day: number; ai_replies_per_day: number; proactive_nudges_per_day: number; documents_per_day: number
      }>(
        `SELECT duration_days, billing_period, messages_per_day, ai_replies_per_day, proactive_nudges_per_day, documents_per_day
         FROM subscription_plans WHERE id = $1`,
        [pr.plan_id],
      )
      if (!plan) return reply.code(404).send({ error: 'Plan not found' })

      // Membership Platform Phase 7 — a gift's own checkout (promotions.ts's
      // POST /api/gifts) creates a normal payment_requests row under the
      // gifter's own subscription_id, purely so the existing pay-to/confirm
      // flow can be reused; approving it must NOT activate the gifter's own
      // subscription. Branch here instead.
      const { rows: [linkedGift] } = await db.query<{ id: string }>(
        `SELECT id FROM gift_memberships WHERE payment_request_id = $1`,
        [pr.id],
      )

      // Membership Platform Phase 7 — referral reward: +14 days to both
      // parties, applied once the *referred* user's first payment is
      // approved (never at signup, to prevent abuse). Only relevant for a
      // real subscription activation, not a gift purchase.
      let pendingReferral: { id: string; referral_code_id: string; referrer_user_id: string } | undefined
      if (!linkedGift) {
        const { rows: [referral] } = await db.query<{ id: string; referral_code_id: string; referrer_user_id: string }>(
          `SELECT rr.id, rr.referral_code_id, rc.user_id AS referrer_user_id
           FROM referral_redemptions rr
           JOIN referral_codes rc ON rc.id = rr.referral_code_id
           WHERE rr.referred_user_id = $1 AND rr.status = 'pending'`,
          [pr.user_id],
        )
        pendingReferral = referral
      }

      // Membership Platform Phase 1 — approve + activate must be atomic: a
      // crash between the two previously-separate UPDATE calls could leave
      // a payment marked approved with the subscription never activated.
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE payment_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
          [adminUser.userId, pr.id],
        )

        if (linkedGift) {
          await client.query(`UPDATE gift_memberships SET status = 'ready' WHERE id = $1`, [linkedGift.id])
        } else {
          await client.query(
            `UPDATE subscriptions SET
               plan_id = $1, billing_period = $2, status = 'active',
               current_period_start = NOW(), current_period_end = NOW() + ($3 || ' days')::interval,
               grace_period_ends_at = NULL, read_only_at = NULL,
               messages_remaining_today = $4, ai_replies_remaining_today = $5, nudges_remaining_today = $6,
               documents_remaining_today = $7,
               credits_reset_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
             WHERE id = $8`,
            [pr.plan_id, plan.billing_period, plan.duration_days, plan.messages_per_day, plan.ai_replies_per_day,
              plan.proactive_nudges_per_day, plan.documents_per_day, pr.subscription_id],
          )
        }

        if (pendingReferral) {
          await client.query(
            `UPDATE subscriptions SET current_period_end = COALESCE(current_period_end, NOW()) + INTERVAL '14 days'
             WHERE user_id IN ($1, $2)`,
            [pr.user_id, pendingReferral.referrer_user_id],
          )
          await client.query(
            `UPDATE referral_redemptions SET status = 'rewarded', rewarded_at = NOW() WHERE id = $1`,
            [pendingReferral.id],
          )
          await client.query(
            `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, 'referral_redeemed', $2::jsonb), ($3, 'referral_redeemed', $2::jsonb)`,
            [pr.user_id, JSON.stringify({ referralRedemptionId: pendingReferral.id }), pendingReferral.referrer_user_id],
          )
        }

        await client.query(
          `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
           VALUES ($1, 'payment.approve', 'payment_request', $2, '{}')`,
          [adminUser.userId, pr.id],
        )
        await client.query(
          `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, 'payment_approved', $2::jsonb)`,
          [pr.user_id, JSON.stringify({ paymentRequestId: pr.id, planId: pr.plan_id })],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      return reply.send({ ok: true })
    },
  )

  fastify.post(
    '/api/admin/payments/:id/reject',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const adminUser = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = rejectBody.parse(request.body)

      const { rows: [pr] } = await db.query<{ id: string; user_id: string; subscription_id: string; status: string }>(
        `SELECT id, user_id, subscription_id, status FROM payment_requests WHERE id = $1`,
        [id],
      )
      if (!pr) return reply.code(404).send({ error: 'Payment request not found' })
      if (pr.status !== 'pending') return reply.code(409).send({ error: 'Payment request already reviewed' })

      const { rows: [linkedGift] } = await db.query<{ id: string }>(
        `SELECT id FROM gift_memberships WHERE payment_request_id = $1`,
        [pr.id],
      )

      // Membership Platform Phase 1 — same atomicity fix as approve above.
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE payment_requests SET status = 'rejected', rejected_reason = $1, reviewed_by = $2, reviewed_at = NOW()
           WHERE id = $3`,
          [body.reason, adminUser.userId, pr.id],
        )
        if (linkedGift) {
          await client.query(`UPDATE gift_memberships SET status = 'rejected' WHERE id = $1`, [linkedGift.id])
        } else {
          // Never touches plan_id/credits — a rejected upgrade attempt doesn't
          // downgrade whatever plan the subscription already had, if any.
          await client.query(
            `UPDATE subscriptions SET status = 'payment_rejected', updated_at = NOW() WHERE id = $1`,
            [pr.subscription_id],
          )
        }
        await client.query(
          `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
           VALUES ($1, 'payment.reject', 'payment_request', $2, $3)`,
          [adminUser.userId, pr.id, JSON.stringify({ reason: body.reason })],
        )
        await client.query(
          `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, 'payment_rejected', $2::jsonb)`,
          [pr.user_id, JSON.stringify({ paymentRequestId: pr.id, reason: body.reason })],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      return reply.send({ ok: true })
    },
  )
}
