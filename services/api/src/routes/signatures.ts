import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const createSignatureBody = z.object({
  businessProfileId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255).default('Default Signature'),
  signerName: z.string().min(1).max(255),
  signerTitle: z.string().max(255).optional().nullable(),
  signatureData: z.string().min(10), // Base64 PNG/SVG data URI or SVG string
  isDefault: z.boolean().default(false),
})

const updateSignatureBody = createSignatureBody.partial()

export default async function signaturesRoutes(fastify: FastifyInstance) {
  // GET /api/signatures — List saved brand signatures for user
  fastify.get('/api/signatures', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows } = await db.query(
      `SELECT id, business_profile_id as "businessProfileId", name, signer_name as "signerName",
              signer_title as "signerTitle", signature_data as "signatureData", is_default as "isDefault",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM brand_signatures
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    )
    return reply.send({ signatures: rows })
  })

  // POST /api/signatures — Save a new brand signature
  fastify.post('/api/signatures', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = createSignatureBody.parse(request.body)

    // Check if this is user's first signature — auto-set as default if true
    const { rows: existing } = await db.query(
      `SELECT id FROM brand_signatures WHERE user_id = $1 LIMIT 1`,
      [userId]
    )
    const shouldBeDefault = body.isDefault || existing.length === 0

    if (shouldBeDefault) {
      await db.query(
        `UPDATE brand_signatures SET is_default = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      )
    }

    const { rows: [created] } = await db.query(
      `INSERT INTO brand_signatures
         (user_id, business_profile_id, name, signer_name, signer_title, signature_data, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, business_profile_id as "businessProfileId", name, signer_name as "signerName",
                 signer_title as "signerTitle", signature_data as "signatureData", is_default as "isDefault",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        userId,
        body.businessProfileId || null,
        body.name,
        body.signerName,
        body.signerTitle || null,
        body.signatureData,
        shouldBeDefault,
      ]
    )

    return reply.status(201).send({ signature: created })
  })

  // PATCH /api/signatures/:id — Update signature
  fastify.patch('/api/signatures/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = updateSignatureBody.parse(request.body)

    const { rows: [existing] } = await db.query(
      `SELECT id FROM brand_signatures WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (!existing) return reply.status(404).send({ error: 'Signature not found' })

    if (body.isDefault) {
      await db.query(
        `UPDATE brand_signatures SET is_default = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      )
    }

    const { rows: [updated] } = await db.query(
      `UPDATE brand_signatures
       SET name = COALESCE($1, name),
           signer_name = COALESCE($2, signer_name),
           signer_title = COALESCE($3, signer_title),
           signature_data = COALESCE($4, signature_data),
           is_default = COALESCE($5, is_default),
           updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING id, business_profile_id as "businessProfileId", name, signer_name as "signerName",
                 signer_title as "signerTitle", signature_data as "signatureData", is_default as "isDefault",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        body.name,
        body.signerName,
        body.signerTitle,
        body.signatureData,
        body.isDefault,
        id,
        userId,
      ]
    )

    return reply.send({ signature: updated })
  })

  // DELETE /api/signatures/:id — Delete signature
  fastify.delete('/api/signatures/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [deleted] } = await db.query(
      `DELETE FROM brand_signatures WHERE id = $1 AND user_id = $2 RETURNING id, is_default`,
      [id, userId]
    )
    if (!deleted) return reply.status(404).send({ error: 'Signature not found' })

    // If deleted signature was default, promote newest remaining signature to default
    if (deleted.is_default) {
      await db.query(
        `UPDATE brand_signatures
         SET is_default = true, updated_at = NOW()
         WHERE id = (SELECT id FROM brand_signatures WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
        [userId]
      )
    }

    return reply.send({ ok: true, deletedId: id })
  })
}
