import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';

export async function suggestionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/messages/:messageId/suggestions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params as { messageId: string };

      // Verify message belongs to user
      const { rows: [msg] } = await db.query(
        `SELECT m.id FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = $1 AND c.user_id = $2`,
        [messageId, userId],
      );
      if (!msg) return reply.code(404).send({ error: 'Message not found' });

      const { rows } = await db.query(
        `SELECT id, suggestion_text, tone, reasoning, status, created_at
         FROM suggested_replies
         WHERE message_id = $1 AND status = 'pending'
         ORDER BY created_at ASC`,
        [messageId],
      );

      return reply.send({
        suggestions: rows.map((r: any) => ({
          id: r.id,
          text: r.suggestion_text,
          tone: r.tone,
          reasoning: r.reasoning,
          status: r.status,
        })),
      });
    },
  );

  fastify.post(
    '/api/suggestions/:id/approve',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [suggestion] } = await db.query(
        `SELECT sr.id, sr.suggestion_text, sr.message_id, m.conversation_id,
                co.whatsapp_jid AS recipient_jid
         FROM suggested_replies sr
         JOIN messages m ON m.id = sr.message_id
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts co ON co.id = c.contact_id
         WHERE sr.id = $1 AND c.user_id = $2 AND sr.status = 'pending'`,
        [id, userId],
      );
      if (!suggestion) return reply.code(404).send({ error: 'Suggestion not found' });

      await addToQueue(QUEUE_NAMES.SEND_REPLY, {
        userId,
        messageId: suggestion.message_id,
        suggestedReplyId: id,
        recipientJid: suggestion.recipient_jid,
        text: suggestion.suggestion_text,
      });

      await db.query(
        "UPDATE suggested_replies SET status = 'approved', updated_at = NOW() WHERE id = $1",
        [id],
      );

      return reply.send({ ok: true });
    },
  );

  fastify.post(
    '/api/suggestions/:id/dismiss',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rowCount } = await db.query(
        `UPDATE suggested_replies sr SET status = 'dismissed', updated_at = NOW()
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE sr.id = $1 AND sr.message_id = m.id AND c.user_id = $2`,
        [id, userId],
      );
      if (!rowCount) return reply.code(404).send({ error: 'Suggestion not found' });

      return reply.send({ ok: true });
    },
  );
}
