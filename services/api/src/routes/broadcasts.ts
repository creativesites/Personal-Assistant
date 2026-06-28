import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { Queue } from 'bullmq';
import { config } from '../config';

// Dedicated queue for broadcast send jobs — not part of the shared QueueName union,
// so we construct it directly here rather than going through addToQueue.
function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}
const broadcastQueue = new Queue('broadcasts.send', { connection: parseRedisUrl(config.REDIS_URL) });

const createBroadcastBody = z.object({
  name: z.string().min(1).max(255),
  message_template: z.string().min(1),
  segment_filter: z.record(z.unknown()).optional().default({}),
  scheduled_at: z.string().datetime().optional(),
});

const updateBroadcastBody = z.object({
  name: z.string().min(1).max(255).optional(),
  message_template: z.string().min(1).optional(),
  segment_filter: z.record(z.unknown()).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

const consentBody = z.object({
  contact_id: z.string().uuid(),
  consent_type: z.string().min(1).max(100),
  status: z.enum(['granted', 'denied', 'pending', 'withdrawn']),
  source: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
});

export async function broadcastsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/broadcasts — list broadcasts for user (paginated)
  fastify.get(
    '/api/broadcasts',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const query = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
      const offset = (page - 1) * pageSize;

      const { rows } = await db.query(
        `SELECT
          id, name, message_template, segment_filter, status,
          scheduled_at, sent_at, recipient_count, created_at, updated_at
        FROM broadcasts
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      );

      const { rows: [countRow] } = await db.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM broadcasts WHERE user_id = $1`,
        [userId],
      );

      return reply.send({
        broadcasts: rows,
        pagination: {
          page,
          pageSize,
          total: parseInt(countRow.total, 10),
        },
      });
    },
  );

  // POST /api/broadcasts — create a broadcast
  fastify.post(
    '/api/broadcasts',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof createBroadcastBody>;
      try {
        body = createBroadcastBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [broadcast] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO broadcasts (user_id, name, message_template, segment_filter, status, scheduled_at)
         VALUES ($1, $2, $3, $4, 'draft', $5)
         RETURNING id, created_at`,
        [
          userId,
          body.name,
          body.message_template,
          JSON.stringify(body.segment_filter),
          body.scheduled_at ?? null,
        ],
      );

      return reply.code(201).send({ broadcast: { id: broadcast.id, createdAt: broadcast.created_at } });
    },
  );

  // GET /api/broadcasts/:id — detail + recipient list (paginated)
  fastify.get(
    '/api/broadcasts/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const query = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
      const offset = (page - 1) * pageSize;

      const { rows: [broadcast] } = await db.query(
        `SELECT id, name, message_template, segment_filter, status,
                scheduled_at, sent_at, recipient_count, created_at, updated_at
         FROM broadcasts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!broadcast) return reply.code(404).send({ error: 'Broadcast not found' });

      const { rows: recipients } = await db.query(
        `SELECT
          br.id,
          br.status,
          br.sent_at,
          br.failed_reason,
          COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
          co.phone_number
        FROM broadcast_recipients br
        JOIN contacts co ON co.id = br.contact_id
        WHERE br.broadcast_id = $1
        ORDER BY br.created_at ASC
        LIMIT $2 OFFSET $3`,
        [id, pageSize, offset],
      );

      const { rows: [countRow] } = await db.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM broadcast_recipients WHERE broadcast_id = $1`,
        [id],
      );

      return reply.send({
        broadcast,
        recipients,
        pagination: {
          page,
          pageSize,
          total: parseInt(countRow.total, 10),
        },
      });
    },
  );

  // PATCH /api/broadcasts/:id — update a draft broadcast
  fastify.patch(
    '/api/broadcasts/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      let body: z.infer<typeof updateBroadcastBody>;
      try {
        body = updateBroadcastBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [broadcast] } = await db.query<{ status: string }>(
        `SELECT status FROM broadcasts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!broadcast) return reply.code(404).send({ error: 'Broadcast not found' });
      if (broadcast.status !== 'draft') {
        return reply.code(409).send({ error: 'Only draft broadcasts can be edited' });
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name); }
      if (body.message_template !== undefined) { updates.push(`message_template = $${idx++}`); values.push(body.message_template); }
      if (body.segment_filter !== undefined) { updates.push(`segment_filter = $${idx++}`); values.push(JSON.stringify(body.segment_filter)); }
      if (body.scheduled_at !== undefined) { updates.push(`scheduled_at = $${idx++}`); values.push(body.scheduled_at); }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      values.push(id, userId);

      const { rows: [updated] } = await db.query(
        `UPDATE broadcasts SET ${updates.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING id, name, status, updated_at`,
        values,
      );

      return reply.send({ broadcast: updated });
    },
  );

  // DELETE /api/broadcasts/:id — delete a draft broadcast only
  fastify.delete(
    '/api/broadcasts/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [broadcast] } = await db.query<{ status: string }>(
        `SELECT status FROM broadcasts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!broadcast) return reply.code(404).send({ error: 'Broadcast not found' });
      if (broadcast.status !== 'draft') {
        return reply.code(409).send({ error: 'Only draft broadcasts can be deleted' });
      }

      await db.query(`DELETE FROM broadcasts WHERE id = $1`, [id]);
      return reply.send({ ok: true });
    },
  );

  // POST /api/broadcasts/:id/send — trigger sending a broadcast
  fastify.post(
    '/api/broadcasts/:id/send',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [broadcast] } = await db.query<{
        id: string;
        status: string;
        segment_filter: Record<string, unknown>;
      }>(
        `SELECT id, status, segment_filter FROM broadcasts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!broadcast) return reply.code(404).send({ error: 'Broadcast not found' });
      if (!['draft', 'scheduled'].includes(broadcast.status)) {
        return reply.code(409).send({ error: 'Broadcast cannot be sent in its current state' });
      }

      // Resolve recipients from segment_filter
      // segment_filter may contain: { tag?: string, relationship_type?: string }
      const filter = broadcast.segment_filter ?? {};
      const conditions: string[] = ['co.user_id = $1'];
      const filterValues: unknown[] = [userId];
      let fIdx = 2;

      if (filter.tag) {
        conditions.push(`$${fIdx++} = ANY(co.tags)`);
        filterValues.push(filter.tag);
      }
      if (filter.relationship_type) {
        conditions.push(`r.relationship_type = $${fIdx++}`);
        filterValues.push(filter.relationship_type);
      }

      const { rows: contactRows } = await db.query<{ id: string }>(
        `SELECT DISTINCT co.id
         FROM contacts co
         LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = co.user_id
         WHERE ${conditions.join(' AND ')}`,
        filterValues,
      );

      if (contactRows.length === 0) {
        return reply.code(422).send({ error: 'No contacts match the segment filter' });
      }

      // Insert broadcast_recipients rows
      if (contactRows.length > 0) {
        const placeholders = contactRows
          .map((_, i) => `($1, $${i + 2}, 'pending')`)
          .join(', ');
        await db.query(
          `INSERT INTO broadcast_recipients (broadcast_id, contact_id, status)
           VALUES ${placeholders}
           ON CONFLICT (broadcast_id, contact_id) DO NOTHING`,
          [id, ...contactRows.map((c) => c.id)],
        );
      }

      // Mark as sending and set recipient count
      await db.query(
        `UPDATE broadcasts
         SET status = 'sending', recipient_count = $1, updated_at = NOW()
         WHERE id = $2`,
        [contactRows.length, id],
      );

      // Enqueue BullMQ job for the intelligence/whatsapp worker to process
      await broadcastQueue.add('broadcasts.send', { broadcastId: id });

      return reply.send({ ok: true, recipientCount: contactRows.length });
    },
  );

  // POST /api/broadcasts/:id/cancel — cancel a scheduled broadcast
  fastify.post(
    '/api/broadcasts/:id/cancel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [broadcast] } = await db.query<{ status: string }>(
        `SELECT status FROM broadcasts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!broadcast) return reply.code(404).send({ error: 'Broadcast not found' });
      if (!['draft', 'scheduled'].includes(broadcast.status)) {
        return reply.code(409).send({ error: 'Only draft or scheduled broadcasts can be cancelled' });
      }

      await db.query(
        `UPDATE broadcasts SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [id],
      );

      return reply.send({ ok: true });
    },
  );

  // ─── Consent records ──────────────────────────────────────────────────────────

  // GET /api/consent — list consent records for user's contacts (paginated, filter by status)
  fastify.get(
    '/api/consent',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const query = request.query as { page?: string; pageSize?: string; status?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
      const offset = (page - 1) * pageSize;

      const conditions: string[] = ['co.user_id = $1'];
      const values: unknown[] = [userId];
      let idx = 2;

      if (query.status) {
        conditions.push(`cr.status = $${idx++}`);
        values.push(query.status);
      }

      const { rows } = await db.query(
        `SELECT
          cr.id,
          cr.contact_id,
          cr.consent_type,
          cr.status,
          cr.source,
          cr.notes,
          cr.created_at,
          cr.updated_at,
          COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name
        FROM consent_records cr
        JOIN contacts co ON co.id = cr.contact_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY cr.updated_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
        [...values, pageSize, offset],
      );

      const { rows: [countRow] } = await db.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM consent_records cr
         JOIN contacts co ON co.id = cr.contact_id
         WHERE ${conditions.join(' AND ')}`,
        values,
      );

      return reply.send({
        records: rows,
        pagination: { page, pageSize, total: parseInt(countRow.total, 10) },
      });
    },
  );

  // POST /api/consent — upsert a consent record
  fastify.post(
    '/api/consent',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof consentBody>;
      try {
        body = consentBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Verify contact belongs to user
      const { rows: [contact] } = await db.query(
        `SELECT id FROM contacts WHERE id = $1 AND user_id = $2`,
        [body.contact_id, userId],
      );
      if (!contact) return reply.code(404).send({ error: 'Contact not found' });

      const { rows: [record] } = await db.query<{ id: string; updated_at: string }>(
        `INSERT INTO consent_records (contact_id, consent_type, status, source, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (contact_id, consent_type) DO UPDATE
           SET status = EXCLUDED.status,
               source = EXCLUDED.source,
               notes = EXCLUDED.notes,
               updated_at = NOW()
         RETURNING id, updated_at`,
        [body.contact_id, body.consent_type, body.status, body.source ?? null, body.notes ?? null],
      );

      return reply.code(201).send({ record: { id: record.id, updatedAt: record.updated_at } });
    },
  );

  // GET /api/consent/:contactId — all consent records for a contact
  fastify.get(
    '/api/consent/:contactId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { contactId } = request.params as { contactId: string };

      const { rows: [contact] } = await db.query(
        `SELECT id FROM contacts WHERE id = $1 AND user_id = $2`,
        [contactId, userId],
      );
      if (!contact) return reply.code(404).send({ error: 'Contact not found' });

      const { rows } = await db.query(
        `SELECT id, consent_type, status, source, notes, created_at, updated_at
         FROM consent_records
         WHERE contact_id = $1
         ORDER BY consent_type ASC`,
        [contactId],
      );

      return reply.send({ records: rows });
    },
  );
}
