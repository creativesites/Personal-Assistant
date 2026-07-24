import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';
import { formatConversationRow, getInboxConversation, publishInboxEvent } from '../lib/inbox-events';
import { sendWhatsAppMessage } from '../lib/whatsapp-send';
import { actionRequestApiShape } from '../lib/advisor-actions';
import { config } from '../config';
import { getEffectiveScope } from '../lib/org-scope';
import { redis } from '../lib/redis';
import { transcribeAudioMessage } from '../lib/transcription';

// ── helpers ───────────────────────────────────────────────────────────────────

export async function conversationsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/conversations ──────────────────────────────────────────────────

  fastify.get('/api/conversations', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const scope = await getEffectiveScope(userId);

    const { rows } = await db.query(
      `WITH latest_contact_msg AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.id           AS message_id,
          m.whatsapp_timestamp,
          (ma.intent->>'primary') AS intent,
          ma.response_urgency,
          ma.sentiment,
          ma.requires_response,
          EXTRACT(EPOCH FROM (NOW() - m.whatsapp_timestamp)) / 60 AS sla_minutes
        FROM messages m
        LEFT JOIN message_analyses ma ON ma.message_id = m.id
        WHERE m.sender_type = 'contact' AND m.is_deleted = false
        ORDER BY m.conversation_id, m.whatsapp_timestamp DESC
      ),
      lead_scores AS (
        SELECT ci.contact_id, MAX(ci.confidence * 100) AS lead_score
        FROM contact_insights ci
        WHERE (ci.user_id = $1 OR ($2::uuid IS NOT NULL AND ci.user_id = $3::uuid)) AND ci.is_active = true
          AND (ci.insight_key ILIKE '%lead%' OR ci.insight_key ILIKE '%score%' OR ci.insight_key ILIKE '%intent%')
        GROUP BY ci.contact_id
      )
      SELECT
        c.id,
        c.last_message_at,
        c.last_message_preview,
        c.unread_count,
        c.is_pinned,
        co.id   AS contact_id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
        co.avatar_url,
        co.phone_number,
        co.is_group,
        COALESCE(r.relationship_type, 'acquaintance')  AS relationship_type,
        COALESCE(r.health_score, 70)                   AS health_score,
        COALESCE(r.importance_tier, 3)                 AS importance_tier,
        COALESCE(ls.lead_score, 0)                     AS lead_score,
        lcm.sla_minutes,
        lcm.intent          AS latest_intent,
        lcm.response_urgency AS latest_urgency,
        lcm.sentiment       AS latest_sentiment,
        lcm.requires_response,
        ca.assigned_to,
        ca.locked_by,
        ca.locked_at,
        u_assigned.email AS assigned_to_email,
        u_locked.email AS locked_by_email
      FROM conversations c
      JOIN contacts co ON co.id = c.contact_id
      LEFT JOIN relationships r   ON r.contact_id   = co.id AND (r.user_id = c.user_id OR r.user_id = $1)
      LEFT JOIN lead_scores ls    ON ls.contact_id  = co.id
      LEFT JOIN latest_contact_msg lcm ON lcm.conversation_id = c.id
      LEFT JOIN conversation_assignments ca ON ca.conversation_id = c.id
      LEFT JOIN users u_assigned ON u_assigned.id = ca.assigned_to
      LEFT JOIN users u_locked ON u_locked.id = ca.locked_by
      WHERE (($2::uuid IS NOT NULL AND c.organization_id = $2::uuid) OR (c.user_id = $1 OR c.user_id = $3::uuid))
        AND c.is_archived = false
      ORDER BY
        COALESCE(c.is_pinned, false) DESC,
        CASE WHEN c.unread_count > 0 THEN 0 ELSE 1 END,
        c.last_message_at DESC NULLS LAST
      LIMIT 100`,
      [userId, scope.organizationId, scope.ownerUserId],
    );

    return reply.send({ conversations: rows.map(formatConversationRow) });
  });

  // ── GET /api/inbox/sync-status ────────────────────────────────────────────

  fastify.get('/api/inbox/sync-status', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: [job] } = await db.query(
      `SELECT id, status, total_conversations, processed_conversations,
              total_messages, processed_messages, current_chat_name,
              error_message, started_at, completed_at, updated_at
       FROM sync_jobs
       WHERE user_id = $1
       ORDER BY
         CASE WHEN status IN ('pending', 'running') THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1`,
      [userId],
    );

    if (!job) {
      return reply.send({ sync: null });
    }

    return reply.send({
      sync: {
        jobId: job.id,
        status: job.status,
        phase: job.status === 'completed' ? 'complete' : job.status === 'running' ? 'analysing' : job.status,
        totalConversations: job.total_conversations,
        processedConversations: job.processed_conversations,
        totalMessages: job.total_messages,
        processedMessages: job.processed_messages,
        currentChatName: job.current_chat_name,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        updatedAt: job.updated_at,
      },
    });
  });

  // ── POST /api/inbox/sync-cancel ───────────────────────────────────────────

  fastify.post('/api/inbox/sync-cancel', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    await redis.set(`history:skip:${userId}`, '1', 'EX', 86400);

    await db.query(
      `UPDATE sync_jobs SET status = 'cancelled', updated_at = NOW() WHERE user_id = $1 AND status = 'running'`,
      [userId],
    );

    await redis.publish(
      `history:progress:${userId}`,
      JSON.stringify({
        status: 'cancelled',
        phase: 'skipped',
        message: 'Historical sync skipped by user',
      }),
    ).catch(() => {});

    return reply.send({ ok: true, message: 'Historical sync cancelled/skipped' });
  });

  // ── GET /api/conversations/:id/messages ────────────────────────────────────

  fastify.get('/api/conversations/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const scope = await getEffectiveScope(userId);

    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.contact_id FROM conversations c 
       WHERE c.id = $1 AND (
         ($2::uuid IS NOT NULL AND c.organization_id = $2::uuid) OR
         (c.user_id = $3::uuid OR c.user_id = $4::uuid)
       )`,
      [id, scope.organizationId, scope.ownerUserId, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const [messagesResult, contactResult] = await Promise.all([
      db.query(
        `SELECT * FROM (
          SELECT
            m.id,
            m.sender_type,
            m.message_type,
            m.body,
            m.whatsapp_timestamp,
            m.is_deleted,
            m.media_url,
            m.media_mime_type,
            m.transcription,
            m.quoted_message_id,
            m.sender_display_name,
            m.sender_jid,
            m.delivery_status,
            m.is_forwarded,
            COALESCE(m.is_starred, false) AS is_starred,
            COALESCE(m.is_pinned, false) AS is_pinned,
            m.pinned_at,
            ma.sentiment,
            ma.sentiment_score,
            ma.requires_response,
            ma.response_urgency,
            ma.importance_score,
            (SELECT COUNT(*) FROM suggested_replies sr
              WHERE sr.message_id = m.id AND sr.status = 'pending') AS pending_suggestions,
            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'emoji', mr_sub.emoji,
                    'count', mr_sub.cnt,
                    'userReacted', mr_sub.has_user
                  )
                ), '[]'::json
              )
              FROM (
                SELECT
                  mr.emoji,
                  COUNT(*)::int AS cnt,
                  BOOL_OR(mr.user_id = $2) AS has_user
                FROM message_reactions mr
                WHERE mr.message_id = m.id
                GROUP BY mr.emoji
              ) mr_sub
            ) AS reactions
          FROM messages m
          LEFT JOIN message_analyses ma ON ma.message_id = m.id
          WHERE m.conversation_id = $1 AND m.is_deleted = false
          ORDER BY m.whatsapp_timestamp DESC
          LIMIT 150
        ) sub
        ORDER BY whatsapp_timestamp ASC`,
        [id, userId],
      ),
      db.query(
        `SELECT
          co.id,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS name,
          co.avatar_url,
          co.phone_number,
          co.is_group,
          COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
          COALESCE(r.health_score, 70) AS health_score
        FROM contacts co
        LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
        WHERE co.id = $1`,
        [conv.contact_id, userId],
      ),
    ]);

    // Mark conversation as read
    await db.query('UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1', [id]);
    await publishInboxEvent(userId, 'conversation:read', { conversationId: id, unreadCount: 0 });

    // Trigger background chat verification and repair loop (debounced by Job ID)
    await addToQueue(
      QUEUE_NAMES.RECONCILIATION_VERIFY_CHAT,
      { userId, conversationId: id, contactId: conv.contact_id },
      { jobId: `recon-${id}`, removeOnComplete: true, removeOnFail: false }
    );

    return reply.send({
      messages: messagesResult.rows.map((m: any) => ({
        id: m.id,
        senderType: m.sender_type,
        messageType: m.message_type,
        body: m.body,
        timestamp: m.whatsapp_timestamp,
        mediaUrl: m.media_url,
        mediaMimeType: m.media_mime_type,
        transcription: m.transcription,
        quotedMessageId: m.quoted_message_id,
        senderDisplayName: m.sender_display_name,
        senderJid: m.sender_jid,
        deliveryStatus: m.delivery_status,
        isForwarded: !!m.is_forwarded,
        isStarred: Boolean(m.is_starred),
        isPinned: Boolean(m.is_pinned),
        reactions: m.reactions || [],
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
            phone: contactResult.rows[0].phone_number,
            isGroup: contactResult.rows[0].is_group,
            relationshipType: contactResult.rows[0].relationship_type,
            healthScore: contactResult.rows[0].health_score,
          }
        : null,
    });
  });

  // ── POST /api/conversations/:id/messages ───────────────────────────────────

  const sendMessageBody = z.object({
    text: z.string().min(1).max(4096),
    quotedMessageId: z.string().uuid().optional(),
    forwardedFromMessageId: z.string().uuid().optional(),
    isAiGenerated: z.boolean().optional(),
  });

  fastify.post('/api/conversations/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { text, quotedMessageId, forwardedFromMessageId, isAiGenerated } = sendMessageBody.parse(request.body);

    try {
      const { message, conversation } = await sendWhatsAppMessage(userId, id, text, {
        quotedMessageId,
        forwardedFromMessageId,
        isAiGenerated,
      });
      return reply.code(201).send({ message, conversation });
    } catch (err) {
      if (err instanceof Error && err.message === 'Conversation not found') {
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      throw err;
    }
  });

  // ── POST /api/conversations/:id/messages/:messageId/react ──────────────────

  const reactBody = z.object({ emoji: z.string().min(1).max(32) });

  fastify.post('/api/conversations/:id/messages/:messageId/react', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, messageId } = request.params as { id: string; messageId: string };
    const { emoji } = reactBody.parse(request.body);

    const scope = await getEffectiveScope(userId);
    const { rows: [conv] } = await db.query(
      `SELECT c.id FROM conversations c WHERE c.id = $1 AND (
         ($2::uuid IS NOT NULL AND c.organization_id = $2::uuid) OR
         (c.user_id = $3::uuid OR c.user_id = $4::uuid)
       )`,
      [id, scope.organizationId, scope.ownerUserId, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: [existing] } = await db.query(
      `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji],
    );

    if (existing) {
      await db.query(`DELETE FROM message_reactions WHERE id = $1`, [existing.id]);
    } else {
      await db.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
        [messageId, userId, emoji],
      );
    }

    const { rows: reactions } = await db.query(
      `SELECT
         mr.emoji,
         COUNT(*)::int AS count,
         BOOL_OR(mr.user_id = $2) AS "userReacted"
       FROM message_reactions mr
       WHERE mr.message_id = $1
       GROUP BY mr.emoji`,
      [messageId, userId],
    );

    // Queue reaction dispatch to WhatsApp
    const { rows: [targetMsg] } = await db.query(
      `SELECT m.whatsapp_message_id, m.sender_type, co.whatsapp_jid 
       FROM messages m 
       JOIN conversations c ON c.id = m.conversation_id 
       JOIN contacts co ON co.id = c.contact_id 
       WHERE m.id = $1`,
      [messageId]
    );

    if (targetMsg && targetMsg.whatsapp_message_id) {
      await addToQueue(QUEUE_NAMES.SEND_REPLY, {
        userId: scope.ownerUserId,
        messageId,
        suggestedReplyId: null,
        recipientJid: targetMsg.whatsapp_jid,
        text: '',
        reactionEmoji: existing ? '' : emoji,
        reactionTargetWaMessageId: targetMsg.whatsapp_message_id,
        reactionFromMe: targetMsg.sender_type === 'user',
      });
    }

    await publishInboxEvent(scope.ownerUserId, 'message:reaction', {
      conversationId: id,
      messageId,
      reactions,
    });

    return reply.send({ ok: true, messageId, reactions });
  });

  // ── DELETE /api/conversations/:id/messages/:messageId ────────────────────────

  const deleteMsgBody = z.object({
    deleteForEveryone: z.boolean().default(false),
  });

  fastify.delete('/api/conversations/:id/messages/:messageId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, messageId } = request.params as { id: string; messageId: string };
    const { deleteForEveryone } = deleteMsgBody.parse(request.body || {});

    const scope = await getEffectiveScope(userId);
    const { rows: [msg] } = await db.query(
      `SELECT m.id, m.whatsapp_message_id, m.sender_type, co.whatsapp_jid
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN contacts co ON co.id = c.contact_id
       WHERE m.id = $1 AND m.conversation_id = $2 AND (
         ($3::uuid IS NOT NULL AND c.organization_id = $3::uuid) OR
         (c.user_id = $4::uuid OR c.user_id = $5::uuid)
       )`,
      [messageId, id, scope.organizationId, scope.ownerUserId, userId]
    );

    if (!msg) return reply.code(404).send({ error: 'Message not found' });

    if (deleteForEveryone) {
      await db.query(
        `UPDATE messages SET message_type = 'deleted', body = 'This message was deleted' WHERE id = $1`,
        [messageId]
      );

      if (msg.whatsapp_message_id) {
        await addToQueue(QUEUE_NAMES.SEND_REPLY, {
          userId: scope.ownerUserId,
          messageId,
          suggestedReplyId: null,
          recipientJid: msg.whatsapp_jid,
          text: '',
          deleteWaMessageId: msg.whatsapp_message_id,
          deleteFromMe: msg.sender_type === 'user',
        });
      }
    } else {
      await db.query(
        `UPDATE messages SET deleted_for_user_ids = array_append(deleted_for_user_ids, $1::uuid) WHERE id = $2`,
        [userId, messageId]
      );
    }

    await publishInboxEvent(scope.ownerUserId, 'message:delete', {
      conversationId: id,
      messageId,
      deleteForEveryone,
    });

    return reply.send({ ok: true, messageId, deleteForEveryone });
  });

  // ── GET /api/conversations/:id/participants ──────────────────────────────────

  fastify.get('/api/conversations/:id/participants', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const scope = await getEffectiveScope(userId);
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.contact_id, co.whatsapp_jid, co.is_group 
       FROM conversations c 
       JOIN contacts co ON co.id = c.contact_id 
       WHERE c.id = $1 AND (
         ($2::uuid IS NOT NULL AND c.organization_id = $2::uuid) OR
         (c.user_id = $3::uuid OR c.user_id = $4::uuid)
       )`,
      [id, scope.organizationId, scope.ownerUserId, userId]
    );

    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: participants } = await db.query(
      `SELECT 
         gm.id,
         mco.id AS "contactId",
         COALESCE(mco.custom_name, mco.display_name, mco.phone_number) AS name,
         mco.phone_number AS phone,
         mco.avatar_url AS "avatarUrl",
         COALESCE(gm.role, 'member') AS role,
         gm.joined_at AS "joinedAt"
       FROM contact_group_members gm
       JOIN contacts mco ON mco.id = gm.member_contact_id
       WHERE gm.group_contact_id = $1
       ORDER BY (CASE WHEN gm.role IN ('admin', 'superadmin') THEN 0 ELSE 1 END), name ASC`,
      [conv.contact_id]
    );

    return reply.send({ ok: true, participants });
  });

  // ── POST /api/conversations/:id/forward ─────────────────────────────────────

  const forwardBody = z.object({
    messageId: z.string().uuid(),
    targetConversationId: z.string().uuid(),
  });

  fastify.post('/api/conversations/:id/forward', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { messageId, targetConversationId } = forwardBody.parse(request.body);

    const { rows: [origMsg] } = await db.query(
      `SELECT body FROM messages WHERE id = $1 AND is_deleted = false`,
      [messageId],
    );
    if (!origMsg || !origMsg.body) {
      return reply.code(404).send({ error: 'Original message not found or empty' });
    }

    const { message, conversation } = await sendWhatsAppMessage(userId, targetConversationId, origMsg.body, {
      forwardedFromMessageId: messageId,
    });

    return reply.code(201).send({ message, conversation });
  });

  // ── GET /api/inbox/briefing ────────────────────────────────────────────────

  fastify.get('/api/inbox/briefing', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const [
      waitingResult,
      intentResult,
      slaResult,
      healthResult,
      longestWaitResult,
      hotLeadResult,
      upcomingEventResult,
      dormantVipResult,
      healthDropResult,
      frustratedResult,
      proactiveResult,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) AS count FROM conversations WHERE user_id = $1 AND unread_count > 0 AND is_archived = false`, [userId]),
      db.query(`SELECT COUNT(DISTINCT m.conversation_id) AS count FROM messages m JOIN message_analyses ma ON ma.message_id = m.id JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.sender_type = 'contact' AND (ma.intent::text ILIKE '%buy%' OR ma.intent::text ILIKE '%order%' OR ma.intent::text ILIKE '%price%') AND m.whatsapp_timestamp > NOW() - INTERVAL '48 hours'`, [userId]),
      db.query(`SELECT COUNT(*) AS count FROM (SELECT DISTINCT ON (m.conversation_id) m.conversation_id, EXTRACT(EPOCH FROM (NOW() - m.whatsapp_timestamp)) / 3600 AS hours_waiting FROM messages m JOIN conversations c ON c.id = m.conversation_id LEFT JOIN message_analyses ma ON ma.message_id = m.id WHERE c.user_id = $1 AND m.sender_type = 'contact' AND (ma.requires_response = true OR ma.requires_response IS NULL) AND c.unread_count > 0 ORDER BY m.conversation_id, m.whatsapp_timestamp DESC) waiting WHERE hours_waiting > 2`, [userId]),
      db.query(`SELECT COUNT(DISTINCT co.id) AS count FROM contacts co JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1 WHERE r.importance_tier <= 2`, [userId]),
      
      // longest_wait: latest contact message per conversation where unread_count > 0, find the one with the most elapsed hours
      db.query(`
        SELECT * FROM (
          SELECT DISTINCT ON (c.id)
            c.id AS conversation_id,
            COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
            EXTRACT(EPOCH FROM (NOW() - m.whatsapp_timestamp)) / 3600 AS hours_waiting
          FROM conversations c
          JOIN contacts co ON co.id = c.contact_id
          JOIN messages m ON m.conversation_id = c.id
          WHERE c.user_id = $1 
            AND c.unread_count > 0 
            AND c.is_archived = false
            AND m.sender_type = 'contact'
          ORDER BY c.id, m.whatsapp_timestamp DESC
        ) q
        ORDER BY hours_waiting DESC
        LIMIT 1
      `, [userId]),

      // hot_lead: highest lead-score contact with recent buying intent in last 48h
      db.query(`
        SELECT 
          c.id AS conversation_id,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
          co.lead_score
        FROM messages m
        JOIN message_analyses ma ON ma.message_id = m.id
        JOIN conversations c ON c.id = m.conversation_id
        JOIN contacts co ON co.id = c.contact_id
        WHERE c.user_id = $1 
          AND m.sender_type = 'contact'
          AND (ma.intent::text ILIKE '%buy%' OR ma.intent::text ILIKE '%order%' OR ma.intent::text ILIKE '%price%')
          AND m.whatsapp_timestamp > NOW() - INTERVAL '48 hours'
          AND NOT EXISTS (
            SELECT 1 FROM messages m2
            WHERE m2.conversation_id = c.id
              AND m2.sender_type = 'user'
              AND m2.whatsapp_timestamp > m.whatsapp_timestamp
          )
        ORDER BY co.lead_score DESC, m.whatsapp_timestamp DESC
        LIMIT 1
      `, [userId]),

      // upcoming_event: nearest event in events table within 7 days
      db.query(`
        SELECT 
          e.title,
          e.event_date,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
          co.id AS contact_id,
          (e.event_date::date - CURRENT_DATE) AS days_until
        FROM events e
        JOIN contacts co ON co.id = e.contact_id
        WHERE co.user_id = $1
          AND e.event_date >= CURRENT_DATE
          AND e.event_date <= CURRENT_DATE + INTERVAL '7 days'
        ORDER BY e.event_date ASC
        LIMIT 1
      `, [userId]),

      // dormant_vip: importance tier 1-2 contact with no message in >14 days
      db.query(`
        SELECT 
          c.id AS conversation_id,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
          r.importance_tier,
          EXTRACT(DAY FROM (NOW() - c.last_message_at)) AS days_silent
        FROM relationships r
        JOIN contacts co ON co.id = r.contact_id
        JOIN conversations c ON c.contact_id = co.id AND c.user_id = $1
        WHERE r.user_id = $1
          AND r.importance_tier <= 2
          AND c.last_message_at < NOW() - INTERVAL '14 days'
          AND c.is_archived = false
        ORDER BY c.last_message_at ASC
        LIMIT 1
      `, [userId]),

      // health_drop: contact whose health score dropped >5 points this week
      db.query(`
        SELECT 
          c.id AS conversation_id,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
          co.id AS contact_id,
          r.health_score AS current_score,
          (log_old.health_score - r.health_score) AS drop_amount
        FROM relationships r
        JOIN contacts co ON co.id = r.contact_id
        JOIN conversations c ON c.contact_id = co.id AND c.user_id = $1
        JOIN LATERAL (
          SELECT hl.health_score
          FROM relationship_health_logs hl
          WHERE hl.relationship_id = r.id
            AND hl.logged_at >= NOW() - INTERVAL '7 days'
          ORDER BY hl.logged_at ASC
          LIMIT 1
        ) log_old ON true
        WHERE r.user_id = $1
          AND r.health_score < log_old.health_score - 5
        ORDER BY (log_old.health_score - r.health_score) DESC
        LIMIT 1
      `, [userId]),

      // frustrated_contact: contact whose latest message shows negative/frustrated sentiment
      db.query(`
        SELECT * FROM (
          SELECT DISTINCT ON (c.id)
            c.id AS conversation_id,
            COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
            ma.sentiment,
            m.whatsapp_timestamp
          FROM conversations c
          JOIN contacts co ON co.id = c.contact_id
          JOIN messages m ON m.conversation_id = c.id
          JOIN message_analyses ma ON ma.message_id = m.id
          WHERE c.user_id = $1
            AND m.sender_type = 'contact'
            AND ma.sentiment = 'negative'
            AND m.whatsapp_timestamp > NOW() - INTERVAL '72 hours'
            AND NOT EXISTS (
              SELECT 1 FROM messages m2
              WHERE m2.conversation_id = c.id
                AND m2.sender_type = 'user'
                AND m2.whatsapp_timestamp > m.whatsapp_timestamp
            )
          ORDER BY c.id, m.whatsapp_timestamp DESC
        ) q
        ORDER BY whatsapp_timestamp DESC
        LIMIT 1
      `, [userId]),

      // proactive_count: count of pending items in proactive_queue
      db.query(`
        SELECT COUNT(*) AS count
        FROM proactive_queue
        WHERE user_id = $1 AND status = 'pending'
      `, [userId]),
    ]);

    const waitingCount = parseInt(waitingResult.rows[0]?.count ?? '0', 10);
    const highIntentCount = parseInt(intentResult.rows[0]?.count ?? '0', 10);
    const slaBreachCount = parseInt(slaResult.rows[0]?.count ?? '0', 10);
    const vipCount = parseInt(healthResult.rows[0]?.count ?? '0', 10);

    const allInsights: { insight: any; itemText: string }[] = [];

    // Map longest_wait
    if (longestWaitResult.rows.length > 0) {
      const row = longestWaitResult.rows[0];
      const hours = parseFloat(row.hours_waiting);
      allInsights.push({
        insight: {
          type: 'longest_wait',
          urgency: hours > 4 ? 'critical' : 'high',
          label: `${row.contact_name} is waiting`,
          detail: `${Math.round(hours)}h without a reply`,
          conversationId: row.conversation_id,
        },
        itemText: `${row.contact_name} has been waiting for ${Math.round(hours)} hours`,
      });
    }

    // Map frustrated_contact
    if (frustratedResult.rows.length > 0) {
      const row = frustratedResult.rows[0];
      allInsights.push({
        insight: {
          type: 'frustrated_contact',
          urgency: 'high',
          label: `${row.contact_name} seems frustrated`,
          detail: `Latest message shows ${row.sentiment} sentiment`,
          conversationId: row.conversation_id,
        },
        itemText: `${row.contact_name} seems frustrated or dissatisfied`,
      });
    }

    // Map hot_lead
    if (hotLeadResult.rows.length > 0) {
      const row = hotLeadResult.rows[0];
      allInsights.push({
        insight: {
          type: 'hot_lead',
          urgency: 'high',
          label: `${row.contact_name} shows buying intent`,
          detail: `Lead score ${row.lead_score} · recent purchase signal`,
          conversationId: row.conversation_id,
        },
        itemText: `${row.contact_name} shows high buying intent (Lead Score: ${row.lead_score})`,
      });
    }

    // Map upcoming_event
    if (upcomingEventResult.rows.length > 0) {
      const row = upcomingEventResult.rows[0];
      const days = parseInt(row.days_until, 10);
      const daysStr = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`;
      allInsights.push({
        insight: {
          type: 'upcoming_event',
          urgency: 'high',
          label: row.title,
          detail: `${daysStr} · ${row.contact_name}`,
          contactId: row.contact_id,
        },
        itemText: `Upcoming event "${row.title}" with ${row.contact_name} ${daysStr}`,
      });
    }

    // Map dormant_vip
    if (dormantVipResult.rows.length > 0) {
      const row = dormantVipResult.rows[0];
      const days = parseInt(row.days_silent, 10);
      allInsights.push({
        insight: {
          type: 'dormant_vip',
          urgency: 'medium',
          label: `${row.contact_name} has gone quiet`,
          detail: `${days} days without contact — tier ${row.importance_tier} relationship`,
          conversationId: row.conversation_id,
        },
        itemText: `VIP contact ${row.contact_name} has been quiet for ${days} days`,
      });
    }

    // Map health_drop
    if (healthDropResult.rows.length > 0) {
      const row = healthDropResult.rows[0];
      const drop = Math.round(parseFloat(row.drop_amount));
      allInsights.push({
        insight: {
          type: 'health_drop',
          urgency: 'medium',
          label: `${row.contact_name}'s relationship health dropped`,
          detail: `Down ${drop} pts this week (${row.current_score}/100)`,
          contactId: row.contact_id,
          conversationId: row.conversation_id,
        },
        itemText: `${row.contact_name}'s relationship health dropped by ${drop} points`,
      });
    }

    // Map proactive_queue
    const proactiveCount = parseInt(proactiveResult.rows[0]?.count ?? '0', 10);
    if (proactiveCount > 0) {
      allInsights.push({
        insight: {
          type: 'proactive_queue',
          urgency: 'low',
          label: `${proactiveCount} relationship nudge${proactiveCount !== 1 ? 's' : ''} ready`,
          detail: `AI-drafted outreach actions waiting for review`,
        },
        itemText: `${proactiveCount} proactive outreach suggestions ready`,
      });
    }

    // Sort by urgency: critical > high > medium > low
    const urgencyWeight: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    allInsights.sort((a, b) => {
      const weightA = urgencyWeight[a.insight.urgency] ?? 0;
      const weightB = urgencyWeight[b.insight.urgency] ?? 0;
      return weightB - weightA;
    });

    // Slice to at most 2 high-value insights/items
    const selectedInsights = allInsights.slice(0, 2);
    const insights = selectedInsights.map(x => x.insight);
    const items = selectedInsights.map(x => x.itemText);

    // Default if no insights
    if (items.length === 0) {
      items.push('All caught up! No urgent conversations right now.');
    }

    return reply.send({
      waitingCount,
      highIntentCount,
      slaBreachCount,
      vipCount,
      insights,
      items,
    });
  });

  // ── GET /api/conversations/:id/context ────────────────────────────────────

  fastify.get('/api/conversations/:id/context', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    // Verify ownership
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.contact_id, c.last_message_at
       FROM conversations c WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const [analysesResult, insightsResult, profileResult, snapshotResult] = await Promise.all([
      // Recent message analyses — intent, sentiment, topics, entities
      db.query(
        `SELECT
          m.sender_type, m.body, m.whatsapp_timestamp,
          ma.sentiment, ma.intent, ma.topics, ma.entities,
          ma.requires_response, ma.response_urgency, ma.importance_score,
          ma.promises_detected, ma.events_detected
         FROM messages m
         JOIN message_analyses ma ON ma.message_id = m.id
         WHERE m.conversation_id = $1 AND m.is_deleted = false
         ORDER BY m.whatsapp_timestamp DESC
         LIMIT 20`,
        [id],
      ),
      // Active contact insights
      db.query(
        `SELECT insight_key, insight_value, confidence, supporting_text
         FROM contact_insights
         WHERE contact_id = $1 AND user_id = $2 AND is_active = true
         ORDER BY confidence DESC LIMIT 15`,
        [conv.contact_id, userId],
      ),
      // Contact profile
      db.query(
        `SELECT cp.personality_summary, cp.communication_style, cp.mood_baseline,
                cp.known_triggers, cp.current_life_context, r.health_score,
                COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name
         FROM contacts co
         LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $2
         LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
         WHERE co.id = $1`,
        [conv.contact_id, userId],
      ),
      // Latest context snapshot if available
      db.query(
        `SELECT summary, covers_from, covers_to, created_at
         FROM context_snapshots
         WHERE contact_id = $1 AND user_id = $2 AND is_current = true
         ORDER BY created_at DESC LIMIT 1`,
        [conv.contact_id, userId],
      ),
    ]);

    const analyses = analysesResult.rows;
    const insights = insightsResult.rows;
    const profile = profileResult.rows[0] ?? null;
    const snapshot = snapshotResult.rows[0] ?? null;

    // Aggregate sentiment from recent contact messages
    const contactAnalyses = analyses.filter((a: any) => a.sender_type === 'contact');
    const sentimentCounts: Record<string, number> = {};
    for (const a of contactAnalyses) {
      if (a.sentiment) sentimentCounts[a.sentiment] = (sentimentCounts[a.sentiment] ?? 0) + 1;
    }
    const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';

    // Aggregate intents
    const intentSet = new Set<string>();
    for (const a of contactAnalyses) {
      if (a.intent) {
        try {
          const intent = typeof a.intent === 'string' ? JSON.parse(a.intent) : a.intent;
          if (Array.isArray(intent)) intent.forEach((i: string) => intentSet.add(i));
          else if (typeof intent === 'string') intentSet.add(intent);
        } catch {}
      }
    }

    // Aggregate topics
    const topicCounts: Record<string, number> = {};
    for (const a of analyses) {
      if (a.topics) {
        try {
          const topics = typeof a.topics === 'string' ? JSON.parse(a.topics) : a.topics;
          if (Array.isArray(topics)) {
            topics.forEach((t: string) => { topicCounts[t] = (topicCounts[t] ?? 0) + 1; });
          }
        } catch {}
      }
    }
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

    // Urgency
    const hasUrgent = analyses.some((a: any) => a.response_urgency === 'urgent' || a.response_urgency === 'high');
    const requiresResponse = analyses.some((a: any) => a.requires_response === true);

    // Buying signals from intent + insights
    const buyingSignals: string[] = [];
    const intents = Array.from(intentSet);
    if (intents.some(i => i.toLowerCase().includes('buy') || i.toLowerCase().includes('purchase'))) buyingSignals.push('Purchase intent detected');
    if (intents.some(i => i.toLowerCase().includes('price') || i.toLowerCase().includes('cost'))) buyingSignals.push('Pricing inquiry');
    if (intents.some(i => i.toLowerCase().includes('order'))) buyingSignals.push('Order inquiry');
    for (const ins of insights) {
      if ((ins.insight_key ?? '').toLowerCase().includes('interest') || (ins.insight_value ?? '').toLowerCase().includes('interested')) {
        buyingSignals.push(ins.insight_value);
      }
    }

    // Next action recommendation
    let nextAction = 'Continue the conversation';
    if (buyingSignals.length > 0) nextAction = 'Send a proposal or catalogue link';
    else if (dominantSentiment === 'negative') nextAction = 'Address concerns and rebuild trust';
    else if (hasUrgent) nextAction = 'Respond immediately — urgent message detected';
    else if (requiresResponse) nextAction = 'Reply to move the conversation forward';

    return reply.send({
      context: {
        contactName: profile?.contact_name ?? null,
        summary: snapshot?.summary ?? null,
        dominantSentiment,
        intents: intents.slice(0, 5),
        topTopics,
        buyingSignals: [...new Set(buyingSignals)].slice(0, 5),
        nextAction,
        requiresResponse,
        urgency: hasUrgent ? 'high' : 'normal',
        moodBaseline: profile?.mood_baseline ?? null,
        communicationStyle: profile?.communication_style ?? null,
        personalitySummary: profile?.personality_summary ?? null,
        insights: insights.slice(0, 8).map((i: any) => ({ key: i.insight_key, value: i.insight_value, confidence: i.confidence })),
        analysedAt: analyses[0]?.whatsapp_timestamp ?? conv.last_message_at,
      },
    });
  });

  // ── POST /api/conversations/:id/summarize ─────────────────────────────────

  const manualAnalysisBody = z.object({
    scope: z.enum(['latest', 'recent', 'all']).default('recent'),
    includeProfile: z.boolean().default(true),
    includeSuggestions: z.boolean().default(true),
  });

  // ── POST /api/conversations/:id/analyze ───────────────────────────────────

  fastify.post('/api/conversations/:id/analyze', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = manualAnalysisBody.parse(request.body ?? {});

    const { rows: [conv] } = await db.query(
      `SELECT id, contact_id
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const limit = body.scope === 'latest' ? 1 : body.scope === 'recent' ? 25 : 200;
    const { rows } = await db.query(
      `SELECT id, sender_type, message_type, body, transcription, whatsapp_timestamp
       FROM messages
       WHERE conversation_id = $1 AND is_deleted = false
       ORDER BY whatsapp_timestamp DESC
       LIMIT $2`,
      [id, limit],
    );

    for (const message of rows) {
      await addToQueue(QUEUE_NAMES.MESSAGES_INCOMING, {
        messageId: message.id,
        userId,
        contactId: conv.contact_id,
        conversationId: id,
        senderType: message.sender_type,
        messageType: message.message_type,
        body: message.body,
        transcription: message.transcription,
        whatsappTimestamp: message.whatsapp_timestamp,
        isHistorical: !body.includeSuggestions,
      });
    }

    if (body.includeProfile) {
      await addToQueue(QUEUE_NAMES.ANALYSIS_CONTACT_PROFILE, {
        contactId: conv.contact_id,
        userId,
        triggerMessageId: rows[0]?.id,
      });
    }

    return reply.send({
      ok: true,
      queuedMessages: rows.length,
      profileQueued: body.includeProfile,
      suggestionsEnabled: body.includeSuggestions,
    });
  });

  fastify.post('/api/conversations/:id/summarize', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/summarize?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' });
    }
  });

  // ── POST /api/conversations/:id/followup ──────────────────────────────────

  fastify.post('/api/conversations/:id/followup', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/followup?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' });
    }
  });

  // ── GET /api/conversations/:id/ask/messages ──────────────────────────────
  // Returns the message history for the inbox AI chat session linked to this conversation.

  fastify.get('/api/conversations/:id/ask/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const { rows: [session] } = await db.query(
      `SELECT id FROM advisor_sessions
       WHERE user_id = $1 AND conversation_id = $2 AND is_archived = false
       ORDER BY created_at DESC LIMIT 1`,
      [userId, id],
    );

    if (!session) return reply.send({ messages: [], sessionId: null });

    const { rows: messages } = await db.query(
      `SELECT id, role, content, metadata, created_at
       FROM advisor_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [session.id],
    );

    return reply.send({ messages, sessionId: session.id });
  });

  // ── POST /api/conversations/:id/ask ──────────────────────────────────────
  // Sends a question to the AI, persists both the user query and AI response,
  // and returns the answer. Creates an advisor session if one doesn't exist.

  fastify.post('/api/conversations/:id/ask', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { question, sessionId: clientSessionId } = request.body as { question?: string; sessionId?: string };

    if (!question?.trim()) return reply.code(400).send({ error: 'question is required' });

    // Verify conversation ownership and get contact info
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.contact_id,
              COALESCE(co.custom_name, co.display_name, co.phone_number, 'Contact') AS contact_name
       FROM conversations c
       JOIN contacts co ON co.id = c.contact_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Not found' });

    // Find or create advisor session for this conversation
    let sessionId = clientSessionId ?? null;
    if (!sessionId) {
      const { rows: [existing] } = await db.query(
        `SELECT id FROM advisor_sessions
         WHERE user_id = $1 AND conversation_id = $2 AND is_archived = false
         ORDER BY created_at DESC LIMIT 1`,
        [userId, id],
      );
      if (existing) {
        sessionId = existing.id as string;
      } else {
        const { rows: [created] } = await db.query(
          `INSERT INTO advisor_sessions (user_id, contact_id, conversation_id, title)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [userId, conv.contact_id, id, `Inbox Chat — ${conv.contact_name}`],
        );
        sessionId = created.id as string;
      }
    }

    // Persist user message
    await db.query(
      `INSERT INTO advisor_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [sessionId, question.trim()],
    );

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    let answer = '';
    // Advisor Companion Plan Phase 2/3 (docs/ADVISOR_COMPANION_PLAN.md
    // §5.2/§5.3/§9) — conversation-scoped turns carry assistantState/
    // memorySuggestion/analysis (Phase 2), and a drafted send now becomes
    // a persisted advisor_action_requests row (Phase 3) instead of just
    // riding along in the chat response.
    let assistantState: Record<string, unknown> | null = null;
    let memorySuggestion: Record<string, unknown> | null = null;
    let analysis: Record<string, unknown> | null = null;
    let proposedAction: { actionType: string; payload: Record<string, unknown>; riskLevel: string; autoSend?: boolean } | null = null;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, question, session_id: sessionId }),
      });
      if (res.ok) {
        const data = await res.json() as {
          answer?: string
          assistantState?: Record<string, unknown>
          memorySuggestion?: Record<string, unknown> | null
          analysis?: Record<string, unknown> | null
          proposedAction?: { actionType: string; payload: Record<string, unknown>; riskLevel: string; autoSend?: boolean } | null
        };
        answer = data.answer ?? 'I was unable to generate a response.';
        assistantState = data.assistantState ?? null;
        memorySuggestion = data.memorySuggestion ?? null;
        analysis = data.analysis ?? null;
        proposedAction = data.proposedAction ?? null;
      } else {
        answer = 'The AI service returned an error. Please try again.';
      }
    } catch {
      answer = 'Unable to reach the intelligence service. Please check that it is running.';
    }

    // Persist assistant response
    const { rows: [assistantMsg] } = await db.query(
      `INSERT INTO advisor_messages (session_id, role, content, metadata)
       VALUES ($1, 'assistant', $2, $3::jsonb)
       RETURNING id, role, content, metadata, created_at`,
      [sessionId, answer, JSON.stringify(assistantState ? { assistantState, memorySuggestion, analysis } : {})],
    );

    // Bump session counters
    await db.query(
      `UPDATE advisor_sessions
       SET message_count = message_count + 2, updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );

    // §4.3/§5.3 — store the action before execution; never execute
    // directly from a chat response. Platform Polish Phase 2 §4.3 is the
    // one narrow exception: a reply already judged in-scope + not
    // high-risk under an active scoped-automation grant (autoSend) skips
    // straight to executing, the same override reply_gen.py's background
    // pipeline already earns from the identical grant/check.
    let actionRequest: Record<string, unknown> | null = null;
    if (proposedAction) {
      const autoSend = proposedAction.autoSend === true && proposedAction.actionType === 'send_whatsapp_message';
      const { rows: [created] } = await db.query(
        `INSERT INTO advisor_action_requests (user_id, session_id, message_id, action_type, payload, risk_level, status, approved_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         RETURNING id, action_type, status, payload, risk_level, created_at`,
        [
          userId, sessionId, assistantMsg.id, proposedAction.actionType, JSON.stringify(proposedAction.payload), proposedAction.riskLevel,
          autoSend ? 'approved' : 'proposed', autoSend ? new Date() : null,
        ],
      );

      if (autoSend) {
        try {
          const payload = created.payload as { conversationId: string; text: string };
          const { message } = await sendWhatsAppMessage(userId, payload.conversationId, payload.text);
          const { rows: [executed] } = await db.query(
            `UPDATE advisor_action_requests SET status = 'completed', executed_at = NOW(), result = $1::jsonb WHERE id = $2 RETURNING *`,
            [JSON.stringify({ sent: true, messageId: message.id, autoSent: true }), created.id],
          );
          actionRequest = actionRequestApiShape(executed);
        } catch {
          const { rows: [failed] } = await db.query(
            `UPDATE advisor_action_requests SET status = 'failed', result = $1::jsonb WHERE id = $2 RETURNING *`,
            [JSON.stringify({ error: 'Auto-send failed' }), created.id],
          );
          actionRequest = actionRequestApiShape(failed);
        }
      } else {
        actionRequest = actionRequestApiShape(created);
      }

      // So reloaded chat history can still find/render the approval card
      // (or, for an auto-sent reply, its completed state).
      await db.query(
        `UPDATE advisor_messages SET metadata = metadata || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ actionRequestId: created.id }), assistantMsg.id],
      );
    }

    return reply.send({ answer, sessionId, message: assistantMsg, assistantState, memorySuggestion, analysis, actionRequest });
  });

  // ── Archive / unarchive ───────────────────────────────────────────────────
  fastify.patch('/api/conversations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { is_archived?: boolean };

    if (typeof body?.is_archived !== 'boolean') {
      return reply.code(400).send({ error: 'is_archived (boolean) required' });
    }

    const result = await db.query(
      `UPDATE conversations SET is_archived = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [body.is_archived, id, userId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Conversation not found' });
    return reply.send({ ok: true });
  });

  // ── Mark conversation as read ──────────────────────────────────────────────
  fastify.post('/api/conversations/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const result = await db.query(
      `UPDATE conversations SET unread_count = 0, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Conversation not found' });
    await publishInboxEvent(userId, 'conversation:read', { conversationId: id, unreadCount: 0 });
    return reply.send({ ok: true });
  });

  // ── POST /api/conversations/:id/media ──────────────────────────────────────
  fastify.post('/api/conversations/:id/media', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id: conversationId } = request.params as { id: string };

    // Verify conversation belongs to user
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.whatsapp_chat_id, co.whatsapp_jid, c.contact_id
       FROM conversations c
       JOIN contacts co ON co.id = c.contact_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [conversationId, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    // Ensure multipart
    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'Request must be multipart' });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file provided' });
    }

    const { filename, file, mimetype } = data;
    
    // Determine target media directory
    const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media';
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');
    const { pipeline } = await import('stream');
    const { promisify } = await import('util');
    const pump = promisify(pipeline);

    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

    // Save with unique prefix to avoid collisions
    const fileId = crypto.randomUUID();
    const ext = path.extname(filename);
    const safeName = `${fileId}${ext}`;
    const targetPath = path.join(MEDIA_DIR, safeName);

    await pump(file, fs.createWriteStream(targetPath));

    // Determine message type from mime
    let msgType = 'document';
    if (mimetype.startsWith('image/')) msgType = 'image';
    else if (mimetype.startsWith('audio/')) msgType = 'audio';
    else if (mimetype.startsWith('video/')) msgType = 'video';

    const caption = (data.fields?.caption as any)?.value || '';

    // Insert message into DB
    const now = new Date();
    const tempWaId = `direct-media-${crypto.randomUUID()}`;
    const mediaUrl = `/api/media/${safeName}`;

    const { rows: [msg] } = await db.query(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp, media_url, media_mime_type)
       VALUES ($1, $2, 'user', $3, $4, $5, $6, $7)
       RETURNING id`,
      [conversationId, tempWaId, msgType, caption || filename, now, mediaUrl, mimetype],
    );

    // Update conversation state
    await db.query(
      `UPDATE conversations
       SET last_message_at = $1, last_message_preview = $2, updated_at = NOW()
       WHERE id = $3`,
      [now, `[Attachment] ${filename}`, conversationId],
    );

    // Enqueue sending via Baileys SEND_REPLY
    await addToQueue(QUEUE_NAMES.SEND_REPLY, {
      userId,
      messageId: msg.id,
      suggestedReplyId: null,
      recipientJid: conv.whatsapp_jid,
      text: caption,
      mediaPath: targetPath,
      mediaMimeType: mimetype,
      mediaFileName: filename,
    });

    // Emit live Socket.io events so UI updates instantly
    const message = {
      id: msg.id,
      senderType: 'user',
      messageType: msgType,
      body: caption || filename,
      timestamp: now.toISOString(),
      pendingSuggestions: 0,
      mediaUrl,
      mediaMimeType: mimetype,
      transcription: null,
    };

    const conversation = await getInboxConversation(userId, conversationId);
    if (conversation) {
      await publishInboxEvent(userId, 'conversation:upsert', { conversation });
    }
    await publishInboxEvent(userId, 'message:new', {
      messageId: msg.id,
      conversationId,
      contactId: conv.contact_id,
      senderType: 'user',
      messageType: msgType,
      body: caption || filename,
      mediaUrl,
      mediaMimeType: mimetype,
      transcription: null,
      timestamp: now.toISOString(),
    });

    return reply.send({ message, conversation });
  });

  // ── POST /api/conversations/simulate-test-message ───────────────────────

  fastify.post('/api/conversations/simulate-test-message', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const scope = await getEffectiveScope(userId);

    const now = new Date();
    const testPhone = '+260970001234';
    const testJid = '260970001234@s.whatsapp.net';

    // 1. Find or create test contact
    let { rows: [contact] } = await db.query<{ id: string }>(
      `SELECT id FROM contacts WHERE (user_id = $1 OR ($2::uuid IS NOT NULL AND organization_id = $2::uuid)) AND whatsapp_jid = $3 LIMIT 1`,
      [userId, scope.organizationId, testJid],
    );

    if (!contact) {
      const { rows: [newContact] } = await db.query<{ id: string }>(
        `INSERT INTO contacts (user_id, organization_id, whatsapp_jid, phone_number, display_name, custom_name, importance_tier)
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         RETURNING id`,
        [userId, scope.organizationId, testJid, testPhone, 'Acme Solar Client (Test Customer)', 'Acme Solar Client (Test Customer)'],
      );
      contact = newContact;

      // Seed initial relationship record
      await db.query(
        `INSERT INTO relationships (user_id, contact_id, relationship_type, health_score, importance_tier)
         VALUES ($1, $2, 'client', 85, 1)
         ON CONFLICT DO NOTHING`,
        [userId, contact.id],
      );
    }

    // 2. Find or create conversation
    let { rows: [conv] } = await db.query<{ id: string }>(
      `SELECT id FROM conversations WHERE contact_id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND organization_id = $3::uuid)) LIMIT 1`,
      [contact.id, userId, scope.organizationId],
    );

    const sampleBody = "Hi Zuri team! I'm interested in your commercial solar installation packages. Can you send a quote?";

    if (!conv) {
      const { rows: [newConv] } = await db.query<{ id: string }>(
        `INSERT INTO conversations (user_id, organization_id, contact_id, whatsapp_jid, unread_count, last_message_at, last_message_preview)
         VALUES ($1, $2, $3, $4, 1, $5, $6)
         RETURNING id`,
        [
          userId,
          scope.organizationId,
          contact.id,
          testJid,
          now,
          sampleBody,
        ],
      );
      conv = newConv;
    } else {
      await db.query(
        `UPDATE conversations
         SET unread_count = unread_count + 1, last_message_at = $1, last_message_preview = $2, is_archived = false
         WHERE id = $3`,
        [
          now,
          sampleBody,
          conv.id,
        ],
      );
    }

    // 3. Insert incoming test message
    const testMsgId = `test-msg-${crypto.randomUUID()}`;

    const { rows: [msg] } = await db.query<{ id: string }>(
      `INSERT INTO messages (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
       VALUES ($1, $2, 'contact', 'text', $3, $4)
       RETURNING id`,
      [conv.id, testMsgId, sampleBody, now],
    );

    // 4. Insert immediate AI reply suggestions for instantaneous testing
    const sug1 = "Hi! Thank you for contacting us! Yes, we offer comprehensive commercial solar packages including 10kVA and 20kVA systems. Would you like me to prepare an official quotation or arrange a free site inspection?";
    const sug2 = "Good day! We would be delighted to assist with your commercial solar installation. Our standard turnaround is 3–5 days with a full 5-year warranty. Should I issue a quotation draft now?";

    await db.query(
      `INSERT INTO suggested_replies (conversation_id, message_id, suggested_text, tone, reasoning, is_used)
       VALUES ($1, $2, $3, 'friendly', 'Direct response confirming commercial solar packages & offering quote.', false),
              ($1, $2, $4, 'professional', 'Professional response emphasizing 3-5 day turnaround & warranty.', false)`,
      [conv.id, msg.id, sug1, sug2],
    );

    // 5. Emit real-time Socket.io events
    const conversation = await getInboxConversation(userId, conv.id);
    if (conversation) {
      await publishInboxEvent(userId, 'conversation:upsert', { conversation });
    }
    await publishInboxEvent(userId, 'message:new', {
      messageId: msg.id,
      conversationId: conv.id,
      contactId: contact.id,
      senderType: 'contact',
      messageType: 'text',
      body: sampleBody,
      timestamp: now.toISOString(),
    });

    return reply.send({ ok: true, conversationId: conv.id, messageId: msg.id });
  });

  // ── POST /api/conversations/messages/:id/transcribe ─────────────────────────────
  fastify.post('/api/conversations/messages/:id/transcribe', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const transcription = await transcribeAudioMessage(db, id);
      return reply.send({ transcription });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to transcribe audio' });
    }
  });

  // ── PATCH /api/conversations/messages/:id/star ───────────────────────────────
  fastify.patch('/api/conversations/messages/:id/star', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rows } = await db.query(
      `UPDATE messages SET is_starred = NOT COALESCE(is_starred, false) WHERE id = $1 RETURNING id, is_starred, conversation_id`,
      [id]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Message not found' });
    return reply.send({ id: rows[0].id, isStarred: rows[0].is_starred, conversationId: rows[0].conversation_id });
  });

  // ── PATCH /api/conversations/messages/:id/pin ────────────────────────────────
  fastify.patch('/api/conversations/messages/:id/pin', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rows } = await db.query(
      `UPDATE messages 
       SET is_pinned = NOT COALESCE(is_pinned, false), 
           pinned_at = CASE WHEN COALESCE(is_pinned, false) THEN NULL ELSE NOW() END 
       WHERE id = $1 
       RETURNING id, is_pinned, pinned_at, conversation_id`,
      [id]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Message not found' });
    return reply.send({
      id: rows[0].id,
      isPinned: rows[0].is_pinned,
      pinnedAt: rows[0].pinned_at,
      conversationId: rows[0].conversation_id
    });
  });

  // ── PATCH /api/conversations/:id/pin ──────────────────────────────────────────
  fastify.patch('/api/conversations/:id/pin', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rows } = await db.query(
      `UPDATE conversations 
       SET is_pinned = NOT COALESCE(is_pinned, false), 
           pinned_at = CASE WHEN COALESCE(is_pinned, false) THEN NULL ELSE NOW() END 
       WHERE id = $1 
       RETURNING id, is_pinned, pinned_at`,
      [id]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Conversation not found' });
    return reply.send({ id: rows[0].id, isPinned: rows[0].is_pinned, pinnedAt: rows[0].pinned_at });
  });

  // ── GET /api/conversations/starred ───────────────────────────────────────────
  fastify.get('/api/conversations/starred', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      `SELECT
         m.id,
         m.conversation_id,
         m.body,
         m.message_type,
         m.whatsapp_timestamp,
         m.sender_type,
         m.media_url,
         m.transcription,
         co.id AS contact_id,
         COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
         co.avatar_url
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN contacts co ON co.id = c.contact_id
       WHERE c.user_id = $1 AND m.is_starred = true AND m.is_deleted = false
       ORDER BY m.whatsapp_timestamp DESC
       LIMIT 100`,
      [userId]
    );
    return reply.send({ starredMessages: rows });
  });

  // ── POST /api/conversations/:id/presence ───────────────────────────────────────
  fastify.post('/api/conversations/:id/presence', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { presence } = z.object({
      presence: z.enum(['composing', 'recording', 'paused', 'available']),
    }).parse(request.body);

    const { rows } = await db.query(
      `SELECT co.whatsapp_jid FROM conversations c JOIN contacts co ON co.id = c.contact_id WHERE c.id = $1`,
      [id]
    );
    if (rows.length === 0 || !rows[0].whatsapp_jid) {
      return reply.send({ updated: false });
    }

    try {
      await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/${userId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presence, jid: rows[0].whatsapp_jid }),
      });
      return reply.send({ updated: true });
    } catch (err) {
      return reply.send({ updated: false });
    }
  });

  // ── DELETE /api/conversations/notes/:noteId ───────────────────────────────────
  fastify.delete('/api/conversations/notes/:noteId', { preHandler: authenticate }, async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    await db.query(`DELETE FROM conversation_internal_notes WHERE id = $1`, [noteId]);
    return reply.send({ deleted: true, noteId });
  });
}
