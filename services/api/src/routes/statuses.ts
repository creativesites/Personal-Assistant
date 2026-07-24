// @ts-nocheck
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { QUEUE_NAMES } from '@zuri/types';
import type { ContactStatusGroup, WhatsAppStatus } from '@zuri/types';
import { authenticate } from '../plugins/authenticate';

export async function statusRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);

  // GET /api/statuses — Fetch all active WhatsApp status stories
  fastify.get('/api/statuses', async (request, reply) => {
    const userId = request.user.sub;

    const { rows } = await fastify.db.query(
      `SELECT
         s.id,
         s.user_id AS "userId",
         s.contact_id AS "contactId",
         s.whatsapp_status_id AS "whatsappStatusId",
         s.media_type AS "mediaType",
         s.caption,
         s.media_url AS "mediaUrl",
         s.background_color AS "backgroundColor",
         s.font,
         s.views_count AS "viewsCount",
         s.is_from_me AS "isFromMe",
         s.ai_insight AS "aiInsight",
         s.expires_at AS "expiresAt",
         s.created_at AS "createdAt",
         c.name AS "contactName",
         c.phone AS "contactPhone",
         c.avatar_url AS "contactAvatarUrl"
       FROM whatsapp_statuses s
       LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.user_id = $1
         AND s.expires_at > NOW()
       ORDER BY s.created_at DESC`,
      [userId]
    );

    // Group statuses by contact
    const groupMap = new Map<string, ContactStatusGroup>();

    for (const r of rows) {
      const key = r.isFromMe ? 'me' : (r.contactId || 'unknown');
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          contactId: r.isFromMe ? null : r.contactId,
          contactName: r.isFromMe ? 'My Status' : (r.contactName || r.contactPhone || 'Contact'),
          contactPhone: r.isFromMe ? '' : (r.contactPhone || ''),
          avatarUrl: r.isFromMe ? null : r.contactAvatarUrl,
          isFromMe: r.isFromMe,
          hasUnviewed: true,
          statuses: [],
        });
      }

      const statusItem: WhatsAppStatus = {
        id: r.id,
        userId: r.userId,
        contactId: r.contactId,
        whatsappStatusId: r.whatsappStatusId,
        mediaType: r.mediaType,
        caption: r.caption,
        mediaUrl: r.mediaUrl,
        backgroundColor: r.backgroundColor,
        font: r.font,
        viewsCount: r.viewsCount,
        isFromMe: r.isFromMe,
        aiInsight: r.aiInsight,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      };

      groupMap.get(key)!.statuses.push(statusItem);
    }

    const result = Array.from(groupMap.values());
    return reply.send({ groups: result });
  });

  // POST /api/statuses — Post a new WhatsApp status story
  fastify.post('/api/statuses', async (request, reply) => {
    const userId = request.user.sub;
    const bodySchema = z.object({
      mediaType: z.enum(['text', 'image', 'video']),
      content: z.string().min(1),
      caption: z.string().optional(),
      backgroundColor: z.string().optional(),
    });

    const { mediaType, content, caption, backgroundColor } = bodySchema.parse(request.body);

    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';

    try {
      // Call whatsapp service to broadcast status
      const res = await fetch(`${whatsappServiceUrl}/internal/sessions/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType,
          content,
          caption,
          backgroundColor,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return reply.code(400).send({ error: (errJson as any).error || 'Failed to broadcast status to WhatsApp' });
      }

      // Save row to local DB
      const { rows } = await fastify.db.query(
        `INSERT INTO whatsapp_statuses
         (user_id, whatsapp_status_id, media_type, caption, media_url, background_color, is_from_me)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, created_at, expires_at`,
        [
          userId,
          `status_me_${Date.now()}`,
          mediaType,
          caption || (mediaType === 'text' ? content : null),
          mediaType !== 'text' ? content : null,
          backgroundColor || null,
        ]
      );

      return reply.send({ success: true, status: rows[0] });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /api/statuses/:id/reply — Reply directly to a contact's status story
  fastify.post('/api/statuses/:id/reply', async (request, reply) => {
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { text } = z.object({ text: z.string().min(1) }).parse(request.body);

    const { rows } = await fastify.db.query(
      `SELECT s.*, c.whatsapp_jid AS jid
       FROM whatsapp_statuses s
       LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [id, userId]
    );

    const status = rows[0];
    if (!status || !status.jid) {
      return reply.code(404).send({ error: 'Status not found or contact JID missing' });
    }

    // Queue reply via SEND_REPLY
    await fastify.queues.sendReply.add(
      QUEUE_NAMES.SEND_REPLY,
      {
        userId,
        messageId: `reply_${Date.now()}`,
        suggestedReplyId: null,
        recipientJid: status.jid,
        text,
        quotedWaMessageId: status.whatsapp_status_id,
        quotedBody: status.caption || 'Status Update',
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }
    );

    return reply.send({ success: true, message: 'Status reply queued successfully' });
  });

  // POST /api/statuses/:id/analyze — Trigger AI analysis on a contact's status update
  fastify.post('/api/statuses/:id/analyze', async (request, reply) => {
    const userId = request.user.sub;
    const { id } = request.params as { id: string };

    const { rows } = await fastify.db.query(
      `SELECT s.*, c.name AS contact_name
       FROM whatsapp_statuses s
       LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [id, userId]
    );

    const status = rows[0];
    if (!status) {
      return reply.code(404).send({ error: 'Status update not found' });
    }

    // Generate quick contextual insight
    const caption = status.caption || '';
    const contactName = status.contact_name || 'Contact';
    const mediaType = status.media_type;

    let insight = `${contactName} posted a ${mediaType} status update.`;
    if (caption) {
      insight = `${contactName} posted: "${caption}"`;
    }

    await fastify.db.query(
      `UPDATE whatsapp_statuses SET ai_insight = $1 WHERE id = $2`,
      [insight, id]
    );

    return reply.send({ success: true, insight });
  });
}
