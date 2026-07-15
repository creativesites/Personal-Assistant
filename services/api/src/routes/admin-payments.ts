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
        id: string; subscription_id: string; plan_id: string; status: string
      }>(
        `SELECT id, subscription_id, plan_id, status FROM payment_requests WHERE id = $1`,
        [id],
      )
      if (!pr) return reply.code(404).send({ error: 'Payment request not found' })
      if (pr.status !== 'pending') return reply.code(409).send({ error: 'Payment request already reviewed' })

      const { rows: [plan] } = await db.query<{
        duration_days: number; messages_per_day: number; ai_replies_per_day: number; proactive_nudges_per_day: number
      }>(
        `SELECT duration_days, messages_per_day, ai_replies_per_day, proactive_nudges_per_day
         FROM subscription_plans WHERE id = $1`,
        [pr.plan_id],
      )
      if (!plan) return reply.code(404).send({ error: 'Plan not found' })

      await db.query(
        `UPDATE payment_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
        [adminUser.userId, pr.id],
      )
      await db.query(
        `UPDATE subscriptions SET
           plan_id = $1, status = 'active',
           current_period_start = NOW(), current_period_end = NOW() + ($2 || ' days')::interval,
           messages_remaining_today = $3, ai_replies_remaining_today = $4, nudges_remaining_today = $5,
           credits_reset_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
         WHERE id = $6`,
        [pr.plan_id, plan.duration_days, plan.messages_per_day, plan.ai_replies_per_day,
          plan.proactive_nudges_per_day, pr.subscription_id],
      )
      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'payment.approve', 'payment_request', $2, '{}')`,
        [adminUser.userId, pr.id],
      )

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

      const { rows: [pr] } = await db.query<{ id: string; subscription_id: string; status: string }>(
        `SELECT id, subscription_id, status FROM payment_requests WHERE id = $1`,
        [id],
      )
      if (!pr) return reply.code(404).send({ error: 'Payment request not found' })
      if (pr.status !== 'pending') return reply.code(409).send({ error: 'Payment request already reviewed' })

      await db.query(
        `UPDATE payment_requests SET status = 'rejected', rejected_reason = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3`,
        [body.reason, adminUser.userId, pr.id],
      )
      // Never touches plan_id/credits — a rejected upgrade attempt doesn't
      // downgrade whatever plan the subscription already had, if any.
      await db.query(
        `UPDATE subscriptions SET status = 'payment_rejected', updated_at = NOW() WHERE id = $1`,
        [pr.subscription_id],
      )
      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'payment.reject', 'payment_request', $2, $3)`,
        [adminUser.userId, pr.id, JSON.stringify({ reason: body.reason })],
      )

      return reply.send({ ok: true })
    },
  )
}
