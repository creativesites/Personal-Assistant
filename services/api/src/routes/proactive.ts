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

  // ── AI Recommendations (§5.11/§6.10) — a ranked view over proactive_queue
  // ∪ opportunities ∪ stalling deals, not a new detector. Every source stays
  // a plain draft the user approves elsewhere — this endpoint only ranks
  // and surfaces, never acts. Stall thresholds mirror health.py's
  // STAGE_STALL_THRESHOLD_DAYS so "stalled" means the same thing everywhere.
  fastify.get(
    '/api/proactive/recommendations',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `WITH ranked AS (
          SELECT
            'suggestion'::text AS source_type, pq.id, pq.contact_id,
            pq.title, pq.body AS description,
            NULL::bigint AS estimated_value_cents, NULL::decimal AS confidence,
            ((6 - pq.priority) * 20)::decimal AS score,
            pq.created_at AS detected_at
          FROM proactive_queue pq
          WHERE pq.user_id = $1 AND pq.status = 'pending'

          UNION ALL

          SELECT
            'opportunity'::text AS source_type, o.id, o.contact_id,
            o.title, o.description,
            o.estimated_value_cents, o.confidence,
            (o.confidence * 60 + LEAST(40, COALESCE(o.estimated_value_cents, 0) / 100000.0))::decimal AS score,
            o.detected_at
          FROM opportunities o
          WHERE o.user_id = $1 AND o.status = 'open' AND (o.expires_at IS NULL OR o.expires_at > NOW())

          UNION ALL

          SELECT
            'stalling_deal'::text AS source_type, d.id, d.contact_id,
            ('Stalled: ' || d.title) AS title,
            ('In ' || d.stage || ' for ' || EXTRACT(DAY FROM NOW() - d.entered_stage_at)::int || ' days') AS description,
            d.value_cents, (d.probability / 100.0)::decimal AS confidence,
            (d.probability * 0.4 + LEAST(60, EXTRACT(DAY FROM NOW() - d.entered_stage_at)))::decimal AS score,
            d.entered_stage_at AS detected_at
          FROM deals d
          WHERE d.user_id = $1
            AND d.stage NOT IN ('closed_won', 'closed_lost')
            AND d.entered_stage_at < NOW() - (CASE d.stage
                  WHEN 'discovery'   THEN INTERVAL '14 days'
                  WHEN 'qualified'   THEN INTERVAL '14 days'
                  WHEN 'proposal'    THEN INTERVAL '21 days'
                  WHEN 'negotiation' THEN INTERVAL '14 days'
                  ELSE INTERVAL '14 days' END)
        )
        SELECT r.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name, c.avatar_url
        FROM ranked r
        JOIN contacts c ON c.id = r.contact_id
        ORDER BY r.score DESC
        LIMIT 50`,
        [userId],
      );

      return reply.send({
        recommendations: rows.map((r: any) => ({
          id: r.id,
          sourceType: r.source_type,
          title: r.title,
          description: r.description,
          estimatedValueCents: r.estimated_value_cents !== null ? parseInt(r.estimated_value_cents, 10) : null,
          confidence: r.confidence !== null ? parseFloat(r.confidence) : null,
          score: parseFloat(r.score),
          detectedAt: r.detected_at,
          contact: {
            id: r.contact_id,
            name: r.contact_name,
            avatarUrl: r.avatar_url,
          },
        })),
      });
    },
  );
}
