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

  async handleMessage(userId: string, msg: NormalisedMessage): Promise<void> {
    const senderType = msg.fromMe ? MessageSenderType.USER : MessageSenderType.CONTACT;
    const timestamp = new Date(msg.timestampMs);

    const contactId = await this.upsertContact(userId, msg.jid, msg.displayName);
    const conversationId = await this.upsertConversation(
      userId, contactId, msg.jid, msg.body, timestamp,
    );
    const messageId = await this.insertMessage(
      conversationId, msg.waMessageId, senderType, msg.messageType, msg.body, timestamp,
    );

    if (!messageId) return; // duplicate

    await this.incomingQueue.add(
      QUEUE_NAMES.MESSAGES_INCOMING,
      {
        userId,
        conversationId,
        messageId,
        contactId,
        senderType,
        messageType: msg.messageType,
        body: msg.body ?? undefined,
        whatsappTimestamp: timestamp.toISOString(),
      },
      { removeOnComplete: { count: 100 } },
    );

    await this.redis.publish(
      `message:new:${userId}`,
      JSON.stringify({
        messageId, conversationId, contactId,
        senderType, messageType: msg.messageType, body: msg.body, timestamp,
      }),
    );
  }

  private async upsertContact(
    userId: string,
    jid: string,
    displayName: string | null,
  ): Promise<string> {
    const phoneNumber = jid.split('@')[0];
    const isGroup = jid.endsWith('@g.us');

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

    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM conversations WHERE user_id = $1 AND whatsapp_chat_id = $2`,
      [userId, chatId],
    );

    if (existing) {
      await this.db.query(
        `UPDATE conversations
         SET last_message_at = $1, last_message_preview = $2, updated_at = NOW()
         WHERE id = $3`,
        [timestamp, preview, existing.id],
      );
      return existing.id;
    }

    const { rows: [conv] } = await this.db.query<{ id: string }>(
      `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
       VALUES ($1, $2, $3, $4, $5)
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
  ): Promise<string | null> {
    const { rows: [row] } = await this.db.query<{ id: string }>(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id, whatsapp_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, waMessageId, senderType, messageType, body, timestamp],
    );
    return row?.id ?? null;
  }
}
