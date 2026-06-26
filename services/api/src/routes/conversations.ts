import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function conversationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/conversations', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `SELECT
        c.id,
        c.last_message_at,
        c.last_message_preview,
        c.unread_count,
        co.id AS contact_id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
        co.avatar_url,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.importance_tier, 3) AS importance_tier
      FROM conversations c
      JOIN contacts co ON co.id = c.contact_id
      LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
      WHERE c.user_id = $1 AND c.is_archived = false
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 60`,
      [userId],
    );

    return reply.send({
      conversations: rows.map((r: any) => ({
        id: r.id,
        lastMessageAt: r.last_message_at,
        lastMessagePreview: r.last_message_preview,
        unreadCount: r.unread_count,
        contact: {
          id: r.contact_id,
          name: r.contact_name,
          avatarUrl: r.avatar_url,
        },
        relationshipType: r.relationship_type,
        healthScore: r.health_score,
        importanceTier: r.importance_tier,
      })),
    });
  });

  fastify.get(
    '/api/conversations/:id/messages',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [conv] } = await db.query(
        'SELECT id, contact_id FROM conversations WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const [messagesResult, contactResult] = await Promise.all([
        db.query(
          `SELECT
            m.id,
            m.sender_type,
            m.message_type,
            m.body,
            m.whatsapp_timestamp,
            m.is_deleted,
            ma.sentiment,
            ma.sentiment_score,
            ma.requires_response,
            ma.response_urgency,
            ma.importance_score,
            (SELECT COUNT(*) FROM suggested_replies sr
              WHERE sr.message_id = m.id AND sr.status = 'pending') AS pending_suggestions
          FROM messages m
          LEFT JOIN message_analyses ma ON ma.message_id = m.id
          WHERE m.conversation_id = $1 AND m.is_deleted = false
          ORDER BY m.whatsapp_timestamp ASC
          LIMIT 150`,
          [id],
        ),
        db.query(
          `SELECT
            co.id, COALESCE(co.custom_name, co.display_name, co.phone_number) AS name,
            co.avatar_url, COALESCE(r.relationship_type, 'acquaintance') AS relationship_type
          FROM contacts co
          LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
          WHERE co.id = $1`,
          [conv.contact_id, userId],
        ),
      ]);

      // Mark conversation as read
      await db.query(
        'UPDATE conversations SET unread_count = 0 WHERE id = $1',
        [id],
      );

      return reply.send({
        messages: messagesResult.rows.map((m: any) => ({
          id: m.id,
          senderType: m.sender_type,
          messageType: m.message_type,
          body: m.body,
          timestamp: m.whatsapp_timestamp,
          analysis: m.sentiment
            ? {
                sentiment: m.sentiment,
                sentimentScore: m.sentiment_score,
                requiresResponse: m.requires_response,
                responseUrgency: m.response_urgency,
                importanceScore: m.importance_score,
              }
            : null,
          pendingSuggestions: parseInt(m.pending_suggestions, 10),
        })),
        contact: contactResult.rows[0]
          ? {
              id: contactResult.rows[0].id,
              name: contactResult.rows[0].name,
              avatarUrl: contactResult.rows[0].avatar_url,
              relationshipType: contactResult.rows[0].relationship_type,
            }
          : null,
      });
    },
  );
}
