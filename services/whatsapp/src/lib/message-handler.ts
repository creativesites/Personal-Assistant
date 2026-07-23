import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, MessageSenderType } from '@zuri/types';
import type { NormalisedMessage } from '../transport/types';

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}

const MEDIA_PREVIEW: Record<string, string> = {
  image: '📷 Photo',
  audio: '🎵 Voice message',
  video: '🎬 Video',
  document: '📄 Document',
  sticker: '🎨 Sticker',
  location: '📍 Location',
  contact_card: '👤 Contact',
};

function derivePriority(row: {
  sla_minutes: number | null;
  latest_intent: string | null;
  latest_urgency: string | null;
  latest_sentiment: string | null;
  lead_score: number | null;
  requires_response: boolean | null;
}): string | null {
  const score = row.lead_score ?? 0;
  const intent = (row.latest_intent ?? '').toLowerCase();
  const urgency = row.latest_urgency;
  const sentiment = row.latest_sentiment;
  const sla = row.sla_minutes ?? 0;

  if (intent.includes('buy') || intent.includes('order') || intent.includes('purchase') || intent.includes('price')) {
    return score > 70 ? 'ready_to_buy' : 'hot_lead';
  }
  if (sentiment === 'negative') return 'dissatisfied';
  if (urgency === 'urgent' || urgency === 'high') return 'needs_followup';
  if (score > 80) return 'loyal';
  if (row.requires_response && sla > 60) return 'waiting';
  if (score > 65) return 'hot_lead';
  return null;
}

export class MessageHandler {
  private readonly incomingQueue: Queue;

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    redisUrl: string,
  ) {
    this.incomingQueue = new Queue(QUEUE_NAMES.MESSAGES_INCOMING, {
      connection: parseRedisUrl(redisUrl),
    });
  }

  async handleMessage(userId: string, msg: NormalisedMessage, isHistorical = false): Promise<void> {
    if (msg.jid === 'status@broadcast' || msg.jid.endsWith('@broadcast')) {
      return;
    }

    const senderType = msg.fromMe ? MessageSenderType.USER : MessageSenderType.CONTACT;
    const timestamp = new Date(msg.timestampMs);

    const contactId = await this.upsertContact(userId, msg.jid, msg.fromMe ? null : msg.displayName);

    const previewText =
      msg.body?.slice(0, 200) ??
      MEDIA_PREVIEW[msg.messageType] ??
      null;

    const conversationId = await this.upsertConversation(
      userId, contactId, msg.jid, previewText, timestamp,
    );

    const quotedMessageId = msg.quotedWaMessageId
      ? await this.resolveQuotedMessageId(conversationId, msg.quotedWaMessageId)
      : null;

    const messageId = await this.insertMessage(
      conversationId, msg.waMessageId, senderType, msg.messageType, msg.body,
      timestamp, msg.mediaUrl ?? null, msg.mediaMimeType ?? null, quotedMessageId,
      msg.groupSenderName ?? null, msg.groupSenderJid ?? null,
    );

    if (!messageId) return;

    if (!isHistorical && senderType === MessageSenderType.CONTACT) {
      await this.db.query(
        `UPDATE conversations
         SET unread_count = unread_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [conversationId],
      );
    }

    await this.incomingQueue.add(
      QUEUE_NAMES.MESSAGES_INCOMING,
      {
        userId, conversationId, messageId, contactId, senderType,
        messageType: msg.messageType, body: msg.body ?? undefined,
        whatsappTimestamp: timestamp.toISOString(), isHistorical,
      },
      {
        jobId: `msg_${messageId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    );

    if (!isHistorical) {
      const conversation = await this.getInboxConversation(userId, conversationId);
      if (conversation) {
        await this.redis.publish(
          `conversation:upsert:${userId}`,
          JSON.stringify({ conversation }),
        ).catch(() => { /* ignore */ });
      }

      await this.redis.publish(
        `message:new:${userId}`,
        JSON.stringify({
          messageId, conversationId, contactId,
          senderType, messageType: msg.messageType, body: msg.body,
          mediaUrl: msg.mediaUrl, mediaMimeType: msg.mediaMimeType,
          transcription: null,
          quotedMessageId,
          senderDisplayName: msg.groupSenderName ?? null,
          timestamp: timestamp.toISOString(),
        }),
      );
    }
  }

  /**
   * Write a historical message to the DB only — no queue push, no real-time pub/sub.
   * Returns the conversation and contact IDs so the caller can batch-queue
   * one analysis job per conversation after all messages are written.
   * Returns null if the message was a duplicate (already in DB).
   */
  async writeHistoricalMessage(
    userId: string,
    msg: NormalisedMessage,
  ): Promise<{ conversationId: string; contactId: string; isGroup: boolean } | null> {
    if (msg.jid === 'status@broadcast' || msg.jid.endsWith('@broadcast')) {
      return null;
    }

    const senderType = msg.fromMe ? MessageSenderType.USER : MessageSenderType.CONTACT;
    const timestamp = new Date(msg.timestampMs);
    const isGroup = msg.jid.endsWith('@g.us');

    const contactId = await this.upsertContact(userId, msg.jid, msg.fromMe ? null : msg.displayName);

    const previewText =
      msg.body?.slice(0, 200) ??
      MEDIA_PREVIEW[msg.messageType] ??
      null;

    const conversationId = await this.upsertConversation(
      userId, contactId, msg.jid, previewText, timestamp,
    );

    const quotedMessageId = msg.quotedWaMessageId
      ? await this.resolveQuotedMessageId(conversationId, msg.quotedWaMessageId)
      : null;

    const messageId = await this.insertMessage(
      conversationId, msg.waMessageId, senderType, msg.messageType, msg.body,
      timestamp, msg.mediaUrl ?? null, msg.mediaMimeType ?? null, quotedMessageId,
      msg.groupSenderName ?? null, msg.groupSenderJid ?? null,
    );

    if (!messageId) return null; // duplicate

    return { conversationId, contactId, isGroup };
  }

  /**
   * Update group contact display names from WhatsApp chat metadata (the
   * `chats` array delivered alongside `messaging-history.set`). Group
   * messages are attributed to a single per-group contact row whose name
   * would otherwise freeze on whoever happened to send the first message —
   * this keeps it in sync with the real group subject instead.
   */
  async updateGroupNames(userId: string, chats: { id: string; name?: string | null }[]): Promise<void> {
    for (const chat of chats) {
      if (!chat.id?.endsWith('@g.us') || !chat.name) continue;
      try {
        await this.db.query(
          `UPDATE contacts SET display_name = $1, updated_at = NOW()
           WHERE user_id = $2 AND whatsapp_jid = $3 AND is_group = true`,
          [chat.name, userId, chat.id],
        );
      } catch (err) {
        console.error(`[message-handler] failed to update group name for ${chat.id}:`, err);
      }
    }
  }

  async publishConversationUpsert(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.getInboxConversation(userId, conversationId);
    if (!conversation) return;
    await this.redis.publish(
      `conversation:upsert:${userId}`,
      JSON.stringify({ conversation }),
    ).catch(() => { /* ignore */ });
  }

  private async getInboxConversation(userId: string, conversationId: string): Promise<Record<string, unknown> | null> {
    const { rows: [r] } = await this.db.query<any>(
      `WITH latest_contact_msg AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
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
        WHERE ci.user_id = $1 AND ci.is_active = true
          AND (ci.insight_key ILIKE '%lead%' OR ci.insight_key ILIKE '%score%' OR ci.insight_key ILIKE '%intent%')
        GROUP BY ci.contact_id
      )
      SELECT
        c.id,
        c.last_message_at,
        c.last_message_preview,
        c.unread_count,
        co.id AS contact_id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
        co.avatar_url,
        co.phone_number,
        co.is_group,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.importance_tier, 3) AS importance_tier,
        COALESCE(ls.lead_score, 0) AS lead_score,
        lcm.sla_minutes,
        lcm.intent AS latest_intent,
        lcm.response_urgency AS latest_urgency,
        lcm.sentiment AS latest_sentiment,
        lcm.requires_response
      FROM conversations c
      JOIN contacts co ON co.id = c.contact_id
      LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
      LEFT JOIN lead_scores ls ON ls.contact_id = co.id
      LEFT JOIN latest_contact_msg lcm ON lcm.conversation_id = c.id
      WHERE c.user_id = $1 AND c.id = $2 AND c.is_archived = false`,
      [userId, conversationId],
    );

    if (!r) return null;

    const priorityRow = {
      sla_minutes: r.sla_minutes ? parseFloat(r.sla_minutes) : null,
      latest_intent: r.latest_intent,
      latest_urgency: r.latest_urgency,
      latest_sentiment: r.latest_sentiment,
      lead_score: r.lead_score ? parseFloat(r.lead_score) : null,
      requires_response: r.requires_response,
    };

    return {
      id: r.id,
      lastMessageAt: r.last_message_at,
      lastMessagePreview: r.last_message_preview,
      unreadCount: r.unread_count,
      contact: {
        id: r.contact_id,
        name: r.contact_name,
        avatarUrl: r.avatar_url,
        phone: r.phone_number,
        isGroup: r.is_group,
      },
      relationshipType: r.relationship_type,
      healthScore: r.health_score,
      importanceTier: r.importance_tier,
      leadScore: Math.min(100, Math.round(priorityRow.lead_score ?? 0)),
      slaMinutes: priorityRow.sla_minutes ? Math.round(priorityRow.sla_minutes) : null,
      sentiment: r.latest_sentiment ?? null,
      aiPriority: derivePriority(priorityRow),
    };
  }

  private async resolveQuotedMessageId(
    conversationId: string,
    quotedWaMessageId: string,
  ): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = $1 AND whatsapp_message_id = $2 LIMIT 1`,
      [conversationId, quotedWaMessageId],
    );
    return rows[0]?.id ?? null;
  }

  private async upsertContact(
    userId: string,
    jid: string,
    displayName: string | null,
  ): Promise<string> {
    const isGroup = jid.endsWith('@g.us');
    const phoneNumber = isGroup ? null : jid.split('@')[0];

    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM contacts WHERE user_id = $1 AND whatsapp_jid = $2`,
      [userId, jid],
    );

    if (existing) {
      await this.db.query(
        `UPDATE contacts
         SET display_name = COALESCE(display_name, $1),
             last_message_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [displayName, existing.id],
      );
      return existing.id;
    }

    const { rows: [contact] } = await this.db.query<{ id: string }>(
      `INSERT INTO contacts (user_id, whatsapp_jid, phone_number, display_name, is_group, last_message_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [userId, jid, phoneNumber, displayName, isGroup],
    );

    await this.db.query(
      `INSERT INTO relationships (user_id, contact_id, last_interaction_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, contact_id) DO NOTHING`,
      [userId, contact.id],
    );

    return contact.id;
  }

  private async upsertConversation(
    userId: string,
    contactId: string,
    chatId: string,
    lastPreview: string | null,
    timestamp: Date,
  ): Promise<string> {
    const preview = lastPreview?.slice(0, 500) ?? null;

    // Use ON CONFLICT to avoid race conditions when concurrent historical batches
    // process messages from the same chat simultaneously.
    const { rows: [conv] } = await this.db.query<{ id: string }>(
      `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
         last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
         last_message_preview = CASE
           WHEN conversations.last_message_at IS NULL OR EXCLUDED.last_message_at >= conversations.last_message_at
           THEN EXCLUDED.last_message_preview
           ELSE conversations.last_message_preview
         END,
         updated_at = NOW()
       RETURNING id`,
      [userId, contactId, chatId, timestamp, preview],
    );
    return conv.id;
  }

  private async insertMessage(
    conversationId: string,
    waMessageId: string,
    senderType: MessageSenderType,
    messageType: import('@zuri/types').MessageType,
    body: string | null,
    timestamp: Date,
    mediaUrl: string | null,
    mediaMimeType: string | null,
    quotedMessageId: string | null,
    senderDisplayName: string | null,
    senderJid: string | null,
  ): Promise<string | null> {
    const { rows: [row] } = await this.db.query<{ id: string }>(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body,
          media_url, media_mime_type, quoted_message_id, whatsapp_timestamp,
          sender_display_name, sender_jid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (conversation_id, whatsapp_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, waMessageId, senderType, messageType, body,
       mediaUrl, mediaMimeType, quotedMessageId, timestamp,
       senderDisplayName, senderJid],
    );
    return row?.id ?? null;
  }
}
