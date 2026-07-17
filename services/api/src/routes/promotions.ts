import crypto from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { config } from '../config'
import { authenticate } from '../plugins/authenticate'

// Membership Platform Phase 7 — Promotion Engine (docs/MEMBERSHIP_PLATFORM_PLAN.md
// §Phase 7): referrals, gift memberships, and student verification. Promo
// code redemption itself is applied inside subscription-plans.ts's checkout
// handler (the one place a code and a price come together); admin CRUD for
// promo codes lives in admin-promotions.ts alongside gift/student review.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function randomCode(prefix: string, len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(len)
  const suffix = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  return `${prefix}-${suffix}`
}

const giftBody = z.object({
  recipientName: z.string().min(1).max(255),
  recipientContact: z.string().min(1).max(255),
  planId: z.string().uuid(),
})

const studentVerificationBody = z.object({
  institutionName: z.string().min(1).max(255),
  studentIdNumber: z.string().min(1).max(100),
})

export async function promotionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Referrals ───────────────────────────────────────────────────────────

  fastify.get('/api/referrals/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    let { rows: [row] } = await db.query<{ code: string }>(
      `SELECT code FROM referral_codes WHERE user_id = $1`,
      [userId],
    )
    if (!row) {
      // Lazy-create on first visit — retried on the astronomically-rare
      // unique-constraint collision, same discipline as payment reference
      // codes (subscription-plans.ts's generateReferenceCode).
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const code = randomCode('ZURI', 5)
        try {
          const { rows: [created] } = await db.query<{ code: string }>(
            `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) RETURNING code`,
            [userId, code],
          )
          row = created
        } catch (err: any) {
          if (err.code !== '23505') throw err
        }
      }
      if (!row) return reply.code(500).send({ error: 'Could not generate a referral code' })
    }

    const { rows: [stats] } = await db.query<{ total: string; rewarded: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE rr.status = 'rewarded') AS rewarded
       FROM referral_redemptions rr
       JOIN referral_codes rc ON rc.id = rr.referral_code_id
       WHERE rc.user_id = $1`,
      [userId],
    )

    return reply.send({
      code: row.code,
      totalReferred: Number(stats?.total ?? 0),
      totalRewarded: Number(stats?.rewarded ?? 0),
      rewardDays: 14,
    })
  })

  // ─── Gift memberships ────────────────────────────────────────────────────

  fastify.post('/api/gifts', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = giftBody.parse(request.body)

    const { rows: [plan] } = await db.query<{ id: string; name: string; price_ngwee: string; duration_days: number }>(
      `SELECT id, name, price_ngwee, duration_days FROM subscription_plans WHERE id = $1 AND is_active = TRUE`,
      [body.planId],
    )
    if (!plan) return reply.code(404).send({ error: 'Plan not found' })

    const { rows: [subscription] } = await db.query<{ id: string }>(
      `SELECT id FROM subscriptions WHERE user_id = $1`,
      [userId],
    )
    if (!subscription) return reply.code(404).send({ error: 'No subscription record found' })

    let paymentRequest: { id: string; reference_code: string } | undefined
    for (let attempt = 0; attempt < 5 && !paymentRequest; attempt++) {
      const referenceCode = randomCode('ZURI', 4)
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

    let redemptionCode: string | undefined
    let giftId: string | undefined
    for (let attempt = 0; attempt < 5 && !redemptionCode; attempt++) {
      const candidate = randomCode('GIFT', 5)
      try {
        const { rows: [created] } = await db.query<{ id: string; redemption_code: string }>(
          `INSERT INTO gift_memberships
             (gifter_user_id, recipient_name, recipient_contact, plan_id, payment_request_id, redemption_code)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, redemption_code`,
          [userId, body.recipientName, body.recipientContact, plan.id, paymentRequest.id, candidate],
        )
        redemptionCode = created.redemption_code
        giftId = created.id
      } catch (err: any) {
        if (err.code !== '23505') throw err
      }
    }
    if (!redemptionCode) return reply.code(500).send({ error: 'Could not generate a unique redemption code' })

    return reply.send({
      giftId,
      redemptionCode,
      referenceCode: paymentRequest.reference_code,
      amountNgwee: Number(plan.price_ngwee),
      planName: plan.name,
      mobileMoneyNumbers: {
        airtel: config.MOBILE_MONEY_AIRTEL_NUMBER,
        mtn: config.MOBILE_MONEY_MTN_NUMBER,
      },
    })
  })

  fastify.get('/api/gifts/mine', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows } = await db.query(
      `SELECT g.id, g.recipient_name, g.recipient_contact, g.redemption_code, g.status, g.created_at,
              sp.name AS plan_name
       FROM gift_memberships g
       JOIN subscription_plans sp ON sp.id = g.plan_id
       WHERE g.gifter_user_id = $1
       ORDER BY g.created_at DESC`,
      [userId],
    )
    return reply.send({
      gifts: rows.map((r: any) => ({
        id: r.id, recipientName: r.recipient_name, recipientContact: r.recipient_contact,
        redemptionCode: r.redemption_code, status: r.status, planName: r.plan_name, createdAt: r.created_at,
      })),
    })
  })

  fastify.post('/api/gifts/redeem/:code', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { code } = request.params as { code: string }

    const { rows: [gift] } = await db.query<{ id: string; plan_id: string; status: string; duration_days: number }>(
      `SELECT g.id, g.plan_id, g.status, sp.duration_days
       FROM gift_memberships g JOIN subscription_plans sp ON sp.id = g.plan_id
       WHERE g.redemption_code = $1`,
      [code.toUpperCase()],
    )
    if (!gift) return reply.code(404).send({ error: 'Gift code not found' })
    if (gift.status !== 'ready') return reply.code(409).send({ error: 'This gift is not ready to redeem yet' })

    const { rows: [plan] } = await db.query<{
      billing_period: string | null; messages_per_day: number; ai_replies_per_day: number
      proactive_nudges_per_day: number; documents_per_day: number
    }>(
      `SELECT billing_period, messages_per_day, ai_replies_per_day, proactive_nudges_per_day, documents_per_day
       FROM subscription_plans WHERE id = $1`,
      [gift.plan_id],
    )

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE subscriptions SET
           plan_id = $1, billing_period = $2, status = 'active',
           current_period_start = NOW(), current_period_end = NOW() + ($3 || ' days')::interval,
           grace_period_ends_at = NULL, read_only_at = NULL,
           messages_remaining_today = $4, ai_replies_remaining_today = $5, nudges_remaining_today = $6,
           documents_remaining_today = $7, credits_reset_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
         WHERE user_id = $8`,
        [gift.plan_id, plan?.billing_period, gift.duration_days, plan?.messages_per_day, plan?.ai_replies_per_day,
          plan?.proactive_nudges_per_day, plan?.documents_per_day, userId],
      )
      await client.query(
        `UPDATE gift_memberships SET status = 'redeemed', redeemed_by_user_id = $1, redeemed_at = NOW() WHERE id = $2`,
        [userId, gift.id],
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

  // ─── Student verification ────────────────────────────────────────────────

  fastify.get('/api/student-verification/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows: [user] } = await db.query<{ is_verified_student: boolean }>(
      `SELECT is_verified_student FROM users WHERE id = $1`,
      [userId],
    )
    const { rows: [latest] } = await db.query(
      `SELECT status, rejected_reason, created_at FROM student_verifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    return reply.send({
      isVerifiedStudent: user?.is_verified_student ?? false,
      latestSubmission: latest ? {
        status: latest.status, rejectedReason: latest.rejected_reason, createdAt: latest.created_at,
      } : null,
    })
  })

  fastify.post('/api/student-verification', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const { rows: [pending] } = await db.query(
      `SELECT id FROM student_verifications WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    )
    if (pending) return reply.code(409).send({ error: 'You already have a pending verification request' })

    let fields: { institutionName?: string; studentIdNumber?: string } = {}
    let proofPath: string | null = null

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
        if (buf.length > MAX_UPLOAD_BYTES) return reply.code(400).send({ error: 'File exceeds 10MB limit' })
        const dir = path.join(config.DOC_STORAGE_DIR, 'student-verification', userId)
        await fs.mkdir(dir, { recursive: true })
        const ext = path.extname(data.filename ?? '') || '.jpg'
        proofPath = path.join(dir, `${crypto.randomUUID()}${ext}`)
        await fs.writeFile(proofPath, buf)
      }
      fields = {
        institutionName: typeof data?.fields?.institutionName?.value === 'string' ? data.fields.institutionName.value : undefined,
        studentIdNumber: typeof data?.fields?.studentIdNumber?.value === 'string' ? data.fields.studentIdNumber.value : undefined,
      }
    } else {
      fields = request.body as { institutionName?: string; studentIdNumber?: string }
    }

    const body = studentVerificationBody.parse(fields)

    const { rows: [created] } = await db.query(
      `INSERT INTO student_verifications (user_id, institution_name, student_id_number, proof_document_path)
       VALUES ($1, $2, $3, $4) RETURNING id, status, created_at`,
      [userId, body.institutionName, body.studentIdNumber, proofPath],
    )

    return reply.code(201).send({ id: created.id, status: created.status, createdAt: created.created_at })
  })
}
