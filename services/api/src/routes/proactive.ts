import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';
import { getInboxConversation, publishInboxEvent } from '../lib/inbox-events';

const updateBody = z.object({
  status: z.enum(['approved', 'dismissed', 'snoozed']),
  snoozedUntil: z.string().optional(),
});

const regenerateBody = z.object({
  instruction: z.string().max(500).optional(),
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

  // ── Send Now (§ proactive actions) — dispatches the draft message for real,
  // reusing the same insert-message + SEND_REPLY-queue path the inbox reply
  // dock uses, then marks the suggestion 'sent' so it drops out of the queue.
  fastify.post(
    '/api/proactive/:id/send',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [item] } = await db.query(
        `SELECT pq.id, pq.contact_id, pq.draft_message, co.whatsapp_jid
         FROM proactive_queue pq
         JOIN contacts co ON co.id = pq.contact_id
         WHERE pq.id = $1 AND pq.user_id = $2`,
        [id, userId],
      );
      if (!item) return reply.code(404).send({ error: 'Suggestion not found' });
      if (!item.draft_message) {
        return reply.code(400).send({ error: 'Suggestion has no draft message to send' });
      }

      const { rows: [conv] } = await db.query(
        `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
           last_message_at = NOW(), last_message_preview = $4, updated_at = NOW()
         RETURNING id`,
        [userId, item.contact_id, item.whatsapp_jid, item.draft_message.slice(0, 200)],
      );

      const now = new Date();
      const tempWaId = `direct-${crypto.randomUUID()}`;

      const { rows: [msg] } = await db.query(
        `INSERT INTO messages
           (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
         VALUES ($1, $2, 'user', 'text', $3, $4)
         RETURNING id`,
        [conv.id, tempWaId, item.draft_message, now],
      );

      await addToQueue(QUEUE_NAMES.SEND_REPLY, {
        userId,
        messageId: msg.id,
        suggestedReplyId: null,
        recipientJid: item.whatsapp_jid,
        text: item.draft_message,
      });

      await db.query(
        `UPDATE proactive_queue SET status = 'sent', acted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );

      const conversation = await getInboxConversation(userId, conv.id);
      if (conversation) {
        await publishInboxEvent(userId, 'conversation:upsert', { conversation });
      }
      await publishInboxEvent(userId, 'message:new', {
        messageId: msg.id, conversationId: conv.id, contactId: item.contact_id,
        senderType: 'user', messageType: 'text', body: item.draft_message,
        mediaUrl: null, mediaMimeType: null, transcription: null,
        timestamp: now.toISOString(),
      });

      return reply.send({ ok: true, conversationId: conv.id });
    },
  );

  // ── Regenerate (§ proactive actions) — proxies to the intelligence service
  // to re-derive context for this contact and produce a fresh draft, optionally
  // steered by free-text user instruction. Updates the row in place.
  fastify.post(
    '/api/proactive/:id/regenerate',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const { instruction } = regenerateBody.parse(request.body ?? {});

      const { rows: [item] } = await db.query(
        'SELECT id FROM proactive_queue WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (!item) return reply.code(404).send({ error: 'Suggestion not found' });

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
      try {
        const res = await fetch(`${intelligenceUrl}/internal/proactive/${id}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, instruction: instruction ?? null }),
        });
        if (!res.ok) {
          const errText = await res.text();
          fastify.log.error({ errText }, 'proactive_regenerate_failed');
          return reply.code(502).send({ error: 'Failed to regenerate suggestion' });
        }
        const data = await res.json() as {
          id: string; suggestionType: string; title: string; body: string;
          draftMessage: string | null; priority: number;
        };
        return reply.send({ suggestion: data });
      } catch (err) {
        fastify.log.error({ err }, 'proactive_regenerate_error');
        return reply.code(502).send({ error: 'Failed to regenerate suggestion' });
      }
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

  // ── AI Daily Brief (§5.3/§6.2) — a rendering layer, not a new detector:
  // today's proactive_queue suggestions, open opportunities, declining
  // relationships, and upcoming birthdays, deterministically composed into
  // one-line facts the frontend prose-ifies. Revenue-at-risk is a single
  // account-wide summary line, not per-contact, so it's returned separately.
  fastify.get(
    '/api/proactive/brief',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const [itemsResult, riskResult] = await Promise.all([
        db.query(
          `WITH today_suggestions AS (
            SELECT 'suggestion'::text AS source_type, pq.id, pq.contact_id,
                   pq.title AS headline, pq.body AS detail, NULL::bigint AS amount_cents,
                   ((6 - pq.priority) * 20)::decimal AS score
            FROM proactive_queue pq
            WHERE pq.user_id = $1 AND pq.status = 'pending' AND pq.suggested_for_date = CURRENT_DATE

            UNION ALL

            SELECT 'opportunity'::text AS source_type, o.id, o.contact_id,
                   o.title AS headline, o.description AS detail, o.estimated_value_cents AS amount_cents,
                   (o.confidence * 60 + LEAST(40, COALESCE(o.estimated_value_cents, 0) / 100000.0))::decimal AS score
            FROM opportunities o
            WHERE o.user_id = $1 AND o.status = 'open' AND (o.expires_at IS NULL OR o.expires_at > NOW())
              AND o.opportunity_type != 'churn_risk'

            UNION ALL

            SELECT 'health_decline'::text AS source_type, r.id, r.contact_id,
                   ('Health dropped to ' || r.health_score) AS headline, rhl.change_reason AS detail,
                   NULL::bigint AS amount_cents, (100 - r.health_score)::decimal AS score
            FROM relationships r
            LEFT JOIN LATERAL (
              SELECT change_reason FROM relationship_health_logs
              WHERE relationship_id = r.id ORDER BY logged_at DESC LIMIT 1
            ) rhl ON true
            WHERE r.user_id = $1 AND (r.health_score < 40 OR r.health_trend = 'declining')

            UNION ALL

            SELECT 'event'::text AS source_type, e.id, e.contact_id,
                   (e.title || CASE WHEN e.event_date = CURRENT_DATE THEN ' is today' ELSE ' is tomorrow' END) AS headline,
                   NULL::text AS detail, NULL::bigint AS amount_cents, 90::decimal AS score
            FROM events e
            WHERE e.user_id = $1 AND e.event_date IN (CURRENT_DATE, CURRENT_DATE + 1)
              AND NOT EXISTS (
                SELECT 1 FROM proactive_queue pq2
                WHERE pq2.contact_id = e.contact_id AND pq2.user_id = $1
                  AND pq2.suggested_for_date = CURRENT_DATE AND pq2.status = 'pending'
              )

            UNION ALL

            -- Business OS Phase F (docs/BUSINESS_OS_PLAN.md §11) — the "AI
            -- Project Manager" morning update is this same brief, not a new
            -- notification system. Only projects/tasks with a linked contact
            -- surface here, since every brief item needs one to render.
            SELECT 'task_overdue'::text AS source_type, pt.id, p.contact_id,
                   ('Task overdue: ' || pt.title) AS headline, ('Project: ' || p.title) AS detail,
                   NULL::bigint AS amount_cents, 80::decimal AS score
            FROM project_tasks pt
            JOIN projects p ON p.id = pt.project_id AND p.user_id = $1
            WHERE pt.status != 'done' AND pt.due_date < CURRENT_DATE AND p.contact_id IS NOT NULL

            UNION ALL

            SELECT 'project_behind'::text AS source_type, p.id, p.contact_id,
                   ('Project behind schedule: ' || p.title) AS headline,
                   ('Was due ' || p.due_date::text) AS detail,
                   NULL::bigint AS amount_cents, 75::decimal AS score
            FROM projects p
            WHERE p.user_id = $1 AND p.status = 'active' AND p.due_date < CURRENT_DATE AND p.contact_id IS NOT NULL
          )
          SELECT i.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name, c.avatar_url
          FROM today_suggestions i
          JOIN contacts c ON c.id = i.contact_id
          ORDER BY i.score DESC
          LIMIT 20`,
          [userId],
        ),
        db.query(
          `SELECT COUNT(DISTINCT d.contact_id) AS at_risk_count, COALESCE(SUM(d.value_cents), 0) AS at_risk_cents
           FROM deals d
           JOIN relationships r ON r.contact_id = d.contact_id AND r.user_id = d.user_id
           WHERE d.user_id = $1 AND d.stage NOT IN ('closed_won', 'closed_lost')
             AND (r.health_score < 50 OR r.health_trend = 'declining')`,
          [userId],
        ),
      ]);

      const risk = riskResult.rows[0];
      const atRiskCount = parseInt(risk?.at_risk_count ?? '0', 10);

      return reply.send({
        items: itemsResult.rows.map((r: any) => ({
          id: r.id,
          sourceType: r.source_type,
          headline: r.headline,
          detail: r.detail,
          amountCents: r.amount_cents !== null ? parseInt(r.amount_cents, 10) : null,
          contact: { id: r.contact_id, name: r.contact_name, avatarUrl: r.avatar_url },
        })),
        revenueAtRisk: atRiskCount > 0 ? {
          contactCount: atRiskCount,
          cents: parseInt(risk.at_risk_cents, 10),
        } : null,
      });
    },
  );
}
