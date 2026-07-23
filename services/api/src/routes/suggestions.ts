import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';
import { getEffectiveScope, buildScopeWhere } from '../lib/org-scope';

export async function suggestionsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/suggestions/pending — list pending/available suggestions for queue page
  fastify.get(
    '/api/suggestions/pending',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const scope = await getEffectiveScope(userId);
      const { clause, params } = buildScopeWhere(scope, 'c', 1);

      const { rows } = await db.query(
        `SELECT
           sr.id, sr.suggestion_text AS text, sr.tone, sr.reasoning,
           m.id AS message_id, m.body AS message_body, m.created_at AS message_timestamp,
           c.id AS conversation_id,
           co.id AS contact_id, co.name AS contact_name, co.avatar_url AS contact_avatar_url
         FROM suggested_replies sr
         JOIN messages m ON m.id = sr.message_id
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts co ON co.id = c.contact_id
         WHERE ${clause} AND sr.status IN ('pending', 'available')
         ORDER BY sr.created_at DESC
         LIMIT 100`,
        params,
      );

      const suggestions = rows.map((r: any) => ({
        id: r.id,
        text: r.text,
        tone: r.tone || 'professional',
        reasoning: r.reasoning || '',
        message: {
          id: r.message_id,
          body: r.message_body,
          timestamp: r.message_timestamp,
          conversation: {
            id: r.conversation_id,
            contact: {
              id: r.contact_id,
              name: r.contact_name,
              avatarUrl: r.contact_avatar_url,
            },
          },
        },
      }));

      return reply.send({ suggestions });
    },
  );

  fastify.get(
    '/api/messages/:messageId/suggestions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params as { messageId: string };
      const scope = await getEffectiveScope(userId);
      const { clause, params } = buildScopeWhere(scope, 'c', 2);

      // Verify message belongs to user/org
      const { rows: [msg] } = await db.query(
        `SELECT m.id FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = $1 AND ${clause}`,
        [messageId, ...params],
      );
      if (!msg) return reply.code(404).send({ error: 'Message not found' });

      const { rows } = await db.query(
        `SELECT id, suggestion_text, tone, reasoning, status, created_at
         FROM suggested_replies
         WHERE message_id = $1 AND status IN ('pending', 'available')
         ORDER BY created_at ASC`,
        [messageId],
      );

      return reply.send({
        suggestions: rows.map((r: any) => ({
          id: r.id,
          text: r.suggestion_text,
          tone: r.tone,
          reasoning: r.reasoning,
          status: r.status === 'pending' ? 'available' : r.status,
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
      const body = (request.body as { editedText?: string; text?: string } | undefined) ?? {};
      const editedText = body.editedText ?? body.text;
      const scope = await getEffectiveScope(userId);
      const { clause, params } = buildScopeWhere(scope, 'c', 2);

      const { rows: [suggestion] } = await db.query(
        `SELECT sr.id, sr.suggestion_text, sr.message_id, m.conversation_id,
                co.whatsapp_jid AS recipient_jid, c.user_id AS conversation_owner_id
         FROM suggested_replies sr
         JOIN messages m ON m.id = sr.message_id
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts co ON co.id = c.contact_id
         WHERE sr.id = $1 AND ${clause} AND sr.status IN ('pending', 'available')`,
        [id, ...params],
      );
      if (!suggestion) return reply.code(404).send({ error: 'Suggestion not found' });

      const wasEdited = !!editedText && editedText.trim() !== suggestion.suggestion_text.trim();
      const finalText = wasEdited ? editedText!.trim() : suggestion.suggestion_text;
      const targetUserId = suggestion.conversation_owner_id || scope.ownerUserId || userId;

      await addToQueue(QUEUE_NAMES.SEND_REPLY, {
        userId: targetUserId,
        messageId: suggestion.message_id,
        suggestedReplyId: id,
        recipientJid: suggestion.recipient_jid,
        text: finalText,
      });

      await db.query(
        `UPDATE suggested_replies
         SET status = 'used', edited_text = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, wasEdited ? finalText : null],
      );

      return reply.send({ ok: true });
    },
  );

  fastify.post(
    '/api/messages/:messageId/regenerate',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params as { messageId: string };
      const scope = await getEffectiveScope(userId);
      const { clause, params } = buildScopeWhere(scope, 'c', 2);

      const { rows: [msg] } = await db.query(
        `SELECT m.id, m.conversation_id, m.sender_type, m.message_type,
                m.body, m.whatsapp_timestamp, c.contact_id, c.user_id AS conversation_owner_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = $1 AND ${clause}`,
        [messageId, ...params],
      );
      if (!msg) return reply.code(404).send({ error: 'Message not found' });

      await db.query(
        "UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW() WHERE message_id = $1 AND status = 'pending'",
        [messageId],
      );

      const targetUserId = msg.conversation_owner_id || scope.ownerUserId || userId;

      await addToQueue(QUEUE_NAMES.MESSAGES_INCOMING, {
        messageId,
        userId: targetUserId,
        contactId: msg.contact_id,
        conversationId: msg.conversation_id,
        senderType: msg.sender_type,
        messageType: msg.message_type,
        body: msg.body,
        whatsappTimestamp: msg.whatsapp_timestamp,
      });

      return reply.send({ ok: true });
    },
  );

  fastify.post(
    '/api/suggestions/:id/dismiss',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);
      const { clause, params } = buildScopeWhere(scope, 'c', 2);

      const { rowCount } = await db.query(
        `UPDATE suggested_replies sr SET status = 'dismissed', updated_at = NOW()
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE sr.id = $1 AND sr.message_id = m.id AND ${clause}`,
        [id, ...params],
      );
      if (!rowCount) return reply.code(404).send({ error: 'Suggestion not found' });

      return reply.send({ ok: true });
    },
  );
}

