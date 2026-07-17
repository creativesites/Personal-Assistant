import crypto from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { config } from '../config'
import { authenticate } from '../plugins/authenticate'

// See docs/PRICING_PAYMENTS_PLAN.md §5 for the original single-shot flow and
// docs/MEMBERSHIP_PLATFORM_PLAN.md §Phase 3 for the guided 4-step manual
// mobile-money flow this file now implements (plan+cadence -> network ->
// pay-to details -> self-reported confirmation).

const checkoutBody = z.object({
  planId: z.string().uuid(),
  useOwnApiKey: z.boolean().optional(),
  // Accepted now, not yet validated/applied — the promo_codes/
  // referral_codes tables land in Phase 7. A caller can start sending these
  // today without a second frontend change once that phase ships.
  promoCode: z.string().max(50).optional(),
  referralCode: z.string().max(20).optional(),
})

const confirmBody = z.object({
  phoneNumber: z.string().min(6).max(20),
  paidAt: z.string().datetime().optional(),
})

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

type PlanRow = {
  id: string
  key: string
  name: string
  price_ngwee: string
  price_ngwee_byok: string | null
  plan_family: string | null
  billing_period: string | null
  is_custom_pricing: boolean
  duration_days: number
  messages_per_day: number
  ai_replies_per_day: number
  proactive_nudges_per_day: number
  documents_per_day: number
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
    priceNgweeByok: p.price_ngwee_byok !== null ? Number(p.price_ngwee_byok) : null,
    priceByokFormatted: p.price_ngwee_byok !== null ? formatNgwee(p.price_ngwee_byok) : null,
    planFamily: p.plan_family,
    billingPeriod: p.billing_period,
    isCustomPricing: p.is_custom_pricing,
    durationDays: p.duration_days,
    messagesPerDay: p.messages_per_day,
    aiRepliesPerDay: p.ai_replies_per_day,
    proactiveNudgesPerDay: p.proactive_nudges_per_day,
    documentsPerDay: p.documents_per_day,
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
      `SELECT id, key, name, price_ngwee, price_ngwee_byok, plan_family, billing_period, is_custom_pricing,
              duration_days, messages_per_day, ai_replies_per_day, proactive_nudges_per_day, documents_per_day, sort_order
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

      // BYOK discount — only applied if the caller actually has a saved key
      // (services/api/src/routes/enterprise.ts's byok_keys) and this plan
      // row has a discounted price at all (Enterprise's custom-pricing row
      // doesn't). Silently falls back to the standard price otherwise
      // rather than erroring on a stale/optimistic client flag.
      let usesOwnApiKey = false
      let amountNgwee = plan.price_ngwee
      if (body.useOwnApiKey && plan.price_ngwee_byok !== null) {
        const { rows: [byok] } = await db.query('SELECT 1 FROM byok_keys WHERE user_id = $1 LIMIT 1', [userId])
        if (byok) {
          usesOwnApiKey = true
          amountNgwee = plan.price_ngwee_byok
        }
      }

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
            `INSERT INTO payment_requests (user_id, subscription_id, plan_id, reference_code, amount_ngwee, uses_own_api_key)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, reference_code`,
            [userId, subscription.id, plan.id, referenceCode, amountNgwee, usesOwnApiKey],
          )
          paymentRequest = created
        } catch (err: any) {
          if (err.code !== '23505') throw err
        }
      }
      if (!paymentRequest) return reply.code(500).send({ error: 'Could not generate a unique reference code' })

      return reply.send({
        paymentRequestId: paymentRequest.id,
        referenceCode: paymentRequest.reference_code,
        amountNgwee: Number(amountNgwee),
        amountFormatted: formatNgwee(amountNgwee),
        usesOwnApiKey,
        planName: plan.name,
        billingPeriod: plan.billing_period,
        mobileMoneyNumbers: {
          airtel: config.MOBILE_MONEY_AIRTEL_NUMBER,
          mtn: config.MOBILE_MONEY_MTN_NUMBER,
        },
      })
    },
  )

  // ─── Step 4: self-reported confirmation ─────────────────────────────────
  // "I Have Paid" — the phone number the payment was sent from, an optional
  // time, and an optional screenshot. Never auto-approves anything; this
  // just gives the admin's payment-matching queue (Phase 8) something to
  // match against and tells the user "waiting for confirmation."
  fastify.post(
    '/api/subscriptions/checkout/:paymentRequestId/confirm',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { paymentRequestId } = request.params as { paymentRequestId: string }

      const { rows: [pr] } = await db.query<{ id: string; status: string }>(
        `SELECT id, status FROM payment_requests WHERE id = $1 AND user_id = $2`,
        [paymentRequestId, userId],
      )
      if (!pr) return reply.code(404).send({ error: 'Payment request not found' })
      if (pr.status !== 'pending') return reply.code(409).send({ error: 'This payment has already been reviewed' })

      let fields: { phoneNumber?: string; paidAt?: string } = {}
      let screenshotPath: string | null = null

      const contentType = request.headers['content-type'] ?? ''
      if (contentType.startsWith('multipart/form-data')) {
        let data: any
        try {
          data = await (request as any).file()
        } catch {
          return reply.code(400).send({ error: 'Multipart not supported' })
        }
        if (data) {
          const buf: Buffer = await data.toBuffer()
          if (buf.length > MAX_SCREENSHOT_BYTES) return reply.code(400).send({ error: 'Screenshot exceeds 5MB limit' })
          const mimetype: string = data.mimetype ?? ''
          if (!mimetype.startsWith('image/')) return reply.code(400).send({ error: 'Only image screenshots are accepted' })

          const dir = path.join(config.DOC_STORAGE_DIR, 'payment-screenshots', userId)
          await fs.mkdir(dir, { recursive: true })
          const ext = path.extname(data.filename ?? '') || '.jpg'
          screenshotPath = path.join(dir, `${paymentRequestId}${ext}`)
          await fs.writeFile(screenshotPath, buf)
        }
        fields = {
          phoneNumber: typeof data?.fields?.phoneNumber?.value === 'string' ? data.fields.phoneNumber.value : undefined,
          paidAt: typeof data?.fields?.paidAt?.value === 'string' ? data.fields.paidAt.value : undefined,
        }
      } else {
        fields = request.body as { phoneNumber?: string; paidAt?: string }
      }

      const body = confirmBody.parse(fields)

      await db.query(
        `UPDATE payment_requests
         SET payer_phone_number = $1, payer_paid_at = $2, payment_screenshot_path = $3
         WHERE id = $4`,
        [body.phoneNumber, body.paidAt ?? null, screenshotPath, paymentRequestId],
      )

      return reply.send({ ok: true, status: 'awaiting_confirmation', estimatedMinutes: '5-30' })
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
