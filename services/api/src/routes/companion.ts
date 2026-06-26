import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';

const messageBody = z.object({
  senderName: z.string().min(1).max(255),
  message: z.string().min(1).max(4096),
  timestamp: z.number().int().positive(),
  source: z.enum(['whatsapp', 'whatsapp_business']).default('whatsapp'),
});

export async function companionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/companion/message',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = messageBody.parse(request.body);

      // Use a stable pseudo-JID derived from sender name for companion messages
      const pseudoJid = `companion_${body.senderName.toLowerCase().replace(/\W+/g, '_')}@c.us`;

      const { rows: [contact] } = await db.query(
        `INSERT INTO contacts (user_id, whatsapp_jid, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, whatsapp_jid) DO UPDATE
           SET display_name = EXCLUDED.display_name, updated_at = NOW()
         RETURNING id`,
        [userId, pseudoJid, body.senderName],
      );

      await db.query(
        `INSERT INTO relationships (user_id, contact_id, relationship_type)
         VALUES ($1, $2, 'acquaintance')
         ON CONFLICT (user_id, contact_id) DO NOTHING`,
        [userId, contact.id],
      );

      const preview = body.message.slice(0, 200);
      const { rows: [conv] } = await db.query(
        `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at,
                                    last_message_preview, unread_count)
         VALUES ($1, $2, $3, NOW(), $4, 1)
         ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
           last_message_at = NOW(),
           last_message_preview = $4,
           unread_count = conversations.unread_count + 1,
           updated_at = NOW()
         RETURNING id`,
        [userId, contact.id, pseudoJid, preview],
      );

      const whatsappTimestamp = new Date(body.timestamp).toISOString();
      const msgId = `companion_${body.timestamp}_${Math.random().toString(36).slice(2, 8)}`;

      const { rows: [msg] } = await db.query(
        `INSERT INTO messages
           (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
         VALUES ($1, $2, 'contact', 'text', $3, $4)
         RETURNING id`,
        [conv.id, msgId, body.message, whatsappTimestamp],
      );

      await addToQueue(QUEUE_NAMES.MESSAGES_INCOMING, {
        userId,
        conversationId: conv.id,
        messageId: msg.id,
        contactId: contact.id,
        senderType: 'contact' as const,
        messageType: 'text' as const,
        body: body.message,
        whatsappTimestamp,
      });

      return reply.code(202).send({ ok: true, messageId: msg.id });
    },
  );
}
