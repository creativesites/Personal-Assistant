import crypto from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { config } from '../config'
import { authenticate } from '../plugins/authenticate'

// See docs/PRICING_PAYMENTS_PLAN.md §5 for the full user-side payment flow.

const checkoutBody = z.object({
  planId: z.string().uuid(),
})

type PlanRow = {
  id: string
  key: string
  name: string
  price_ngwee: string
  duration_days: number
  messages_per_day: number
  ai_replies_per_day: number
  proactive_nudges_per_day: number
  sort_order: number
}

function formatNgwee(ngwee: string | number): string {
  const kwacha = Number(ngwee) / 100
  return `K${kwacha.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toPlanShape(p: PlanRow) {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    priceNgwee: Number(p.price_ngwee),
    priceFormatted: formatNgwee(p.price_ngwee),
    durationDays: p.duration_days,
    messagesPerDay: p.messages_per_day,
    aiRepliesPerDay: p.ai_replies_per_day,
    proactiveNudgesPerDay: p.proactive_nudges_per_day,
  }
}

async function generateReferenceCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(4)
  const suffix = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  return `ZURI-${suffix}`
}

export async function subscriptionPlansRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Public catalog ─────────────────────────────────────────────────────

  fastify.get('/api/subscription-plans', async (_request, reply) => {
    const { rows } = await db.query<PlanRow>(
      `SELECT id, key, name, price_ngwee, duration_days,
              messages_per_day, ai_replies_per_day, proactive_nudges_per_day, sort_order
       FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order ASC`,
    )
    return reply.send({ plans: rows.map(toPlanShape) })
  })

  // ─── Checkout ───────────────────────────────────────────────────────────

  fastify.post(
    '/api/subscriptions/checkout',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = checkoutBody.parse(request.body)

      const { rows: [plan] } = await db.query<PlanRow>(
        'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
        [body.planId],
      )
      if (!plan) return reply.code(404).send({ error: 'Plan not found' })

      const { rows: [subscription] } = await db.query<{ id: string }>(
        'SELECT id FROM subscriptions WHERE user_id = $1',
        [userId],
      )
      if (!subscription) return reply.code(404).send({ error: 'No subscription record found' })

      await db.query(
        `UPDATE subscriptions SET status = 'pending_payment', updated_at = NOW() WHERE id = $1`,
        [subscription.id],
      )

      // Retried on the unique-constraint collision case — astronomically
      // rare with a 4-char base32-ish suffix, but handled rather than
      // assumed away (docs/PRICING_PAYMENTS_PLAN.md §5 step 3).
      let paymentRequest: { id: string; reference_code: string } | undefined
      for (let attempt = 0; attempt < 5 && !paymentRequest; attempt++) {
        const referenceCode = await generateReferenceCode()
        try {
          const { rows: [created] } = await db.query<{ id: string; reference_code: string }>(
            `INSERT INTO payment_requests (user_id, subscription_id, plan_id, reference_code, amount_ngwee)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, reference_code`,
            [userId, subscription.id, plan.id, referenceCode, plan.price_ngwee],
          )
          paymentRequest = created
        } catch (err: any) {
          if (err.code !== '23505') throw err
        }
      }
      if (!paymentRequest) return reply.code(500).send({ error: 'Could not generate a unique reference code' })

      return reply.send({
        referenceCode: paymentRequest.reference_code,
        amountNgwee: Number(plan.price_ngwee),
        amountFormatted: formatNgwee(plan.price_ngwee),
        planName: plan.name,
        mobileMoneyNumbers: {
          airtel: config.MOBILE_MONEY_AIRTEL_NUMBER,
          mtn: config.MOBILE_MONEY_MTN_NUMBER,
        },
      })
    },
  )

  // ─── Customer-facing status ─────────────────────────────────────────────

  fastify.get(
    '/api/subscriptions/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [sub] } = await db.query<{
        id: string
        plan: string
        status: string
        current_period_end: string | null
        messages_remaining_today: number
        ai_replies_remaining_today: number
        nudges_remaining_today: number
        plan_key: string | null
        plan_name: string | null
        messages_per_day: number | null
        ai_replies_per_day: number | null
        proactive_nudges_per_day: number | null
      }>(
        `SELECT s.id, s.plan, s.status, s.current_period_end,
                s.messages_remaining_today, s.ai_replies_remaining_today, s.nudges_remaining_today,
                p.key AS plan_key, p.name AS plan_name,
                p.messages_per_day, p.ai_replies_per_day, p.proactive_nudges_per_day
         FROM subscriptions s
         LEFT JOIN subscription_plans p ON p.id = s.plan_id
         WHERE s.user_id = $1`,
        [userId],
      )
      if (!sub) return reply.code(404).send({ error: 'No subscription found' })

      let pendingPayment: { referenceCode: string; amountFormatted: string; planName: string } | null = null
      if (sub.status === 'pending_payment') {
        const { rows: [pr] } = await db.query<{ reference_code: string; amount_ngwee: string; plan_name: string }>(
          `SELECT pr.reference_code, pr.amount_ngwee, sp.name AS plan_name
           FROM payment_requests pr
           JOIN subscription_plans sp ON sp.id = pr.plan_id
           WHERE pr.subscription_id = $1 AND pr.status = 'pending'
           ORDER BY pr.created_at DESC LIMIT 1`,
          [sub.id],
        )
        if (pr) {
          pendingPayment = {
            referenceCode: pr.reference_code,
            amountFormatted: formatNgwee(pr.amount_ngwee),
            planName: pr.plan_name,
          }
        }
      }

      return reply.send({
        plan: sub.plan_key ?? sub.plan,
        planName: sub.plan_name,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        credits: {
          messagesRemaining: sub.messages_remaining_today,
          messagesPerDay: sub.messages_per_day,
          aiRepliesRemaining: sub.ai_replies_remaining_today,
          aiRepliesPerDay: sub.ai_replies_per_day,
          nudgesRemaining: sub.nudges_remaining_today,
          nudgesPerDay: sub.proactive_nudges_per_day,
        },
        pendingPayment,
        mobileMoneyNumbers: {
          airtel: config.MOBILE_MONEY_AIRTEL_NUMBER,
          mtn: config.MOBILE_MONEY_MTN_NUMBER,
        },
      })
    },
  )
}
