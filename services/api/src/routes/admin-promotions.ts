import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticateAdmin } from '../plugins/authenticateAdmin'

// Membership Platform Phase 7 — admin side of the Promotion Engine: promo
// code CRUD, gift memberships list (approval itself happens through the
// normal payment-approval flow — see admin-payments.ts's gift branch), and
// student verification review (mirrors admin-payments.ts's approve/reject
// shape exactly).

const promoCodeBody = z.object({
  code: z.string().min(3).max(30),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().int().min(1),
  applicablePlanFamily: z.enum(['personal', 'professional', 'business', 'enterprise']).nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
})

const rejectBody = z.object({ reason: z.string().min(1).max(500) })

function toPromoShape(r: any) {
  return {
    id: r.id, code: r.code, discountType: r.discount_type, discountValue: r.discount_value,
    applicablePlanFamily: r.applicable_plan_family, maxRedemptions: r.max_redemptions,
    timesRedeemed: r.times_redeemed, validFrom: r.valid_from, validUntil: r.valid_until,
    isActive: r.is_active, createdAt: r.created_at,
  }
}

export async function adminPromotionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Promo codes ─────────────────────────────────────────────────────────

  fastify.get('/api/admin/promo-codes', { preHandler: authenticateAdmin }, async (_request, reply) => {
    const { rows } = await db.query(`SELECT * FROM promo_codes ORDER BY created_at DESC`)
    return reply.send({ promoCodes: rows.map(toPromoShape) })
  })

  fastify.post('/api/admin/promo-codes', { preHandler: authenticateAdmin }, async (request, reply) => {
    const body = promoCodeBody.parse(request.body)
    const { rows: [row] } = await db.query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, applicable_plan_family, max_redemptions, valid_until, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        body.code.toUpperCase(), body.discountType, body.discountValue,
        body.applicablePlanFamily ?? null, body.maxRedemptions ?? null, body.validUntil ?? null,
        body.isActive ?? true,
      ],
    )
    return reply.code(201).send({ promoCode: toPromoShape(row) })
  })

  fastify.patch('/api/admin/promo-codes/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = promoCodeBody.partial().parse(request.body)

    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1
    const columnByKey: Record<string, string> = {
      code: 'code', discountType: 'discount_type', discountValue: 'discount_value',
      applicablePlanFamily: 'applicable_plan_family', maxRedemptions: 'max_redemptions',
      validUntil: 'valid_until', isActive: 'is_active',
    }
    for (const [key, column] of Object.entries(columnByKey)) {
      const value = (body as Record<string, unknown>)[key]
      if (value === undefined) continue
      sets.push(`${column} = $${idx++}`)
      values.push(key === 'code' && typeof value === 'string' ? value.toUpperCase() : value)
    }
    if (!sets.length) return reply.code(400).send({ error: 'No fields to update' })
    values.push(id)

    const { rows: [row] } = await db.query(
      `UPDATE promo_codes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )
    if (!row) return reply.code(404).send({ error: 'Promo code not found' })
    return reply.send({ promoCode: toPromoShape(row) })
  })

  fastify.delete('/api/admin/promo-codes/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { rowCount } = await db.query(`DELETE FROM promo_codes WHERE id = $1`, [id])
    if (!rowCount) return reply.code(404).send({ error: 'Promo code not found' })
    return reply.send({ ok: true })
  })

  // ─── Gift memberships (list only — approval via admin-payments.ts) ──────

  fastify.get('/api/admin/gifts', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { status } = request.query as { status?: string }
    const filterStatus = status && ['pending_payment', 'ready', 'redeemed', 'rejected'].includes(status) ? status : undefined

    const { rows } = await db.query(
      `SELECT g.id, g.recipient_name, g.recipient_contact, g.redemption_code, g.status, g.created_at,
              u.email AS gifter_email, sp.name AS plan_name
       FROM gift_memberships g
       JOIN users u ON u.id = g.gifter_user_id
       JOIN subscription_plans sp ON sp.id = g.plan_id
       ${filterStatus ? 'WHERE g.status = $1' : ''}
       ORDER BY g.created_at DESC LIMIT 200`,
      filterStatus ? [filterStatus] : [],
    )
    return reply.send({
      gifts: rows.map((r: any) => ({
        id: r.id, recipientName: r.recipient_name, recipientContact: r.recipient_contact,
        redemptionCode: r.redemption_code, status: r.status, gifterEmail: r.gifter_email,
        planName: r.plan_name, createdAt: r.created_at,
      })),
    })
  })

  // ─── Student verification review ────────────────────────────────────────

  fastify.get('/api/admin/student-verifications', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { status } = request.query as { status?: string }
    const filterStatus = status && ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending'

    const { rows } = await db.query(
      `SELECT sv.id, sv.institution_name, sv.student_id_number, sv.status, sv.rejected_reason, sv.created_at,
              u.email AS user_email, u.full_name AS user_name
       FROM student_verifications sv
       JOIN users u ON u.id = sv.user_id
       WHERE sv.status = $1
       ORDER BY sv.created_at DESC LIMIT 200`,
      [filterStatus],
    )
    return reply.send({
      verifications: rows.map((r: any) => ({
        id: r.id, institutionName: r.institution_name, studentIdNumber: r.student_id_number,
        status: r.status, rejectedReason: r.rejected_reason, userEmail: r.user_email, userName: r.user_name,
        createdAt: r.created_at,
      })),
    })
  })

  fastify.post('/api/admin/student-verifications/:id/approve', { preHandler: authenticateAdmin }, async (request, reply) => {
    const adminUser = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [sv] } = await db.query<{ id: string; user_id: string; status: string }>(
      `SELECT id, user_id, status FROM student_verifications WHERE id = $1`,
      [id],
    )
    if (!sv) return reply.code(404).send({ error: 'Verification request not found' })
    if (sv.status !== 'pending') return reply.code(409).send({ error: 'Already reviewed' })

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE student_verifications SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
        [adminUser.userId, sv.id],
      )
      await client.query(`UPDATE users SET is_verified_student = TRUE WHERE id = $1`, [sv.user_id])
      await client.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'student_verification.approve', 'student_verification', $2, '{}')`,
        [adminUser.userId, sv.id],
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

  fastify.post('/api/admin/student-verifications/:id/reject', { preHandler: authenticateAdmin }, async (request, reply) => {
    const adminUser = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = rejectBody.parse(request.body)

    const { rows: [sv] } = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM student_verifications WHERE id = $1`,
      [id],
    )
    if (!sv) return reply.code(404).send({ error: 'Verification request not found' })
    if (sv.status !== 'pending') return reply.code(409).send({ error: 'Already reviewed' })

    await db.query(
      `UPDATE student_verifications SET status = 'rejected', rejected_reason = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [body.reason, adminUser.userId, sv.id],
    )
    await db.query(
      `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
       VALUES ($1, 'student_verification.reject', 'student_verification', $2, $3)`,
      [adminUser.userId, sv.id, JSON.stringify({ reason: body.reason })],
    )

    return reply.send({ ok: true })
  })
}
