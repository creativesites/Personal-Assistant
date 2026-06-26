import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';

const updateBody = z.object({
  status: z.enum(['approved', 'dismissed', 'snoozed']),
  snoozedUntil: z.string().optional(),
});

export async function proactiveRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/proactive', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `SELECT
        pq.id,
        pq.suggestion_type,
        pq.title,
        pq.body,
        pq.draft_message,
        pq.priority,
        pq.status,
        pq.suggested_for_date,
        pq.created_at,
        co.id AS contact_id,
        COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
        co.avatar_url,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type
      FROM proactive_queue pq
      JOIN contacts co ON co.id = pq.contact_id
      LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = pq.user_id
      WHERE pq.user_id = $1 AND pq.status = 'pending'
      ORDER BY pq.priority ASC, pq.suggested_for_date ASC
      LIMIT 50`,
      [userId],
    );

    return reply.send({
      suggestions: rows.map((r: any) => ({
        id: r.id,
        suggestionType: r.suggestion_type,
        title: r.title,
        body: r.body,
        draftMessage: r.draft_message,
        priority: r.priority,
        suggestedForDate: r.suggested_for_date,
        createdAt: r.created_at,
        contact: {
          id: r.contact_id,
          name: r.contact_name,
          avatarUrl: r.avatar_url,
          relationshipType: r.relationship_type,
        },
      })),
    });
  });

  fastify.patch(
    '/api/proactive/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const body = updateBody.parse(request.body);

      const { rows: [item] } = await db.query(
        'SELECT id, contact_id, draft_message FROM proactive_queue WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (!item) return reply.code(404).send({ error: 'Suggestion not found' });

      await db.query(
        `UPDATE proactive_queue
         SET status = $1, snoozed_until = $2, acted_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [body.status, body.snoozedUntil ?? null, id],
      );

      return reply.send({ ok: true });
    },
  );
}
