import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

const CONNECTION_TYPES = [
  'works_with', 'introduced_by', 'owns', 'refers_to', 'family_of', 'friend_of', 'married_to',
] as const

const createBody = z.object({
  contactId: z.string().uuid(),
  otherContactId: z.string().uuid(),
  connectionType: z.enum(CONNECTION_TYPES),
})

type ConnectionRow = {
  id: string
  connection_type: string
  confidence: string
  source: string
  evidence_count: number
  other_contact_id: string
  other_contact_name: string | null
}

function toApiShape(c: ConnectionRow) {
  return {
    id: c.id,
    connectionType: c.connection_type,
    confidence: parseFloat(c.confidence),
    source: c.source,
    evidenceCount: c.evidence_count,
    otherContactId: c.other_contact_id,
    otherContactName: c.other_contact_name,
  }
}

// The Business Graph (docs/RELATIONSHIP_OS_PLAN.md §5.7) — a simple
// expandable list for v1 rather than a force-directed graph. Connections
// are directional rows (contact_a_id, contact_b_id) but callers only care
// "who is this contact connected to" regardless of which side they're on,
// so the query normalizes to other_contact_id/other_contact_name.
export async function connectionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/connections?contactId=... ────────────────────────────────────
  fastify.get(
    '/api/connections',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { contactId } = request.query as { contactId?: string }
      if (!contactId) return reply.code(400).send({ error: 'contactId is required' })

      const { rows } = await db.query<ConnectionRow>(
        `WITH conn AS (
           SELECT rc.id, rc.connection_type, rc.confidence, rc.source, rc.evidence_count,
                  CASE WHEN rc.contact_a_id = $2 THEN rc.contact_b_id ELSE rc.contact_a_id END AS other_contact_id
           FROM relationship_connections rc
           WHERE rc.user_id = $1 AND (rc.contact_a_id = $2 OR rc.contact_b_id = $2) AND rc.is_active = TRUE
         )
         SELECT conn.id, conn.connection_type, conn.confidence, conn.source, conn.evidence_count,
                conn.other_contact_id,
                COALESCE(c.custom_name, c.display_name, c.phone_number) AS other_contact_name
         FROM conn
         JOIN contacts c ON c.id = conn.other_contact_id
         ORDER BY conn.confidence DESC`,
        [userId, contactId],
      )

      return reply.send({ connections: rows.map(toApiShape) })
    },
  )

  // ── POST /api/connections — manually confirm a connection ────────────────
  fastify.post(
    '/api/connections',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: contacts } = await db.query<{ id: string }>(
        `SELECT id FROM contacts WHERE id = ANY($1) AND user_id = $2`,
        [[body.contactId, body.otherContactId], userId],
      )
      if (contacts.length !== 2) return reply.code(404).send({ error: 'Contact not found' })

      await db.query(
        `INSERT INTO relationship_connections (user_id, contact_a_id, contact_b_id, connection_type, confidence, source)
         VALUES ($1, $2, $3, $4, 1.0, 'manual')
         ON CONFLICT (user_id, contact_a_id, contact_b_id, connection_type)
         DO UPDATE SET is_active = TRUE, confidence = 1.0, source = 'manual', updated_at = NOW()`,
        [userId, body.contactId, body.otherContactId, body.connectionType],
      )

      return reply.code(201).send({ ok: true })
    },
  )

  // ── PATCH /api/connections/:id — dismiss an incorrect connection ─────────
  fastify.patch(
    '/api/connections/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE relationship_connections SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Connection not found' })

      return reply.send({ ok: true })
    },
  )
}
