import type { Message } from '@open-wa/wa-automate';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, MessageSenderType, MessageType } from '@zuri/types';

const WA_TYPE_MAP: Record<string, MessageType> = {
  chat: MessageType.TEXT,
  image: MessageType.IMAGE,
  audio: MessageType.AUDIO,
  ptt: MessageType.AUDIO,       // push-to-talk voice note
  video: MessageType.VIDEO,
  document: MessageType.DOCUMENT,
  sticker: MessageType.STICKER,
  location: MessageType.LOCATION,
  vcard: MessageType.CONTACT_CARD,
  multi_vcard: MessageType.CONTACT_CARD,
  revoked: MessageType.DELETED,
};

function mapType(waType: string): MessageType {
  return WA_TYPE_MAP[waType] ?? MessageType.TEXT;
}

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
  private incomingQueue: Queue;

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    redisUrl: string
  ) {
    this.incomingQueue = new Queue(QUEUE_NAMES.MESSAGES_INCOMING, {
      connection: parseRedisUrl(redisUrl),
    });
  }

  async handleMessage(userId: string, message: Message): Promise<void> {
    const senderType = message.fromMe ? MessageSenderType.USER : MessageSenderType.CONTACT;
    const contactJid = message.fromMe ? String(message.to) : String(message.from);
    const messageType = mapType(message.type as string);
    const body = (message.body || (message as Record<string, unknown>).caption as string) || null;
    const timestamp = new Date((message.t as number) * 1000);
    const waMessageId = String(message.id);

    const contactId = await this.upsertContact(userId, contactJid, message);
    const conversationId = await this.upsertConversation(
      userId, contactId, contactJid, body, timestamp
    );

    const messageId = await this.insertMessage(
      conversationId, waMessageId, senderType, messageType, body, timestamp
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
        messageType,
        body: body ?? undefined,
        whatsappTimestamp: timestamp.toISOString(),
      },
      { removeOnComplete: { count: 100 } }
    );

    await this.redis.publish(
      `message:new:${userId}`,
      JSON.stringify({ messageId, conversationId, contactId, senderType, messageType, body, timestamp })
    );
  }

  private async upsertContact(userId: string, jid: string, message: Message): Promise<string> {
    const phoneNumber = jid.split('@')[0];
    const isGroup = jid.endsWith('@g.us');
    const msg = message as Record<string, unknown>;
    const displayName =
      (msg.notifyName as string) ||
      ((msg.sender as Record<string, string> | undefined)?.formattedName) ||
      null;

    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM contacts WHERE user_id = $1 AND whatsapp_jid = $2`,
      [userId, jid]
    );

    if (existing) {
      await this.db.query(
        `UPDATE contacts
         SET display_name = COALESCE(display_name, $1),
             last_message_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [displayName, existing.id]
      );
      return existing.id;
    }

    const { rows: [contact] } = await this.db.query<{ id: string }>(
      `INSERT INTO contacts (user_id, whatsapp_jid, phone_number, display_name, is_group, last_message_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [userId, jid, phoneNumber, displayName, isGroup]
    );

    // Auto-create relationship entry for new contacts
    await this.db.query(
      `INSERT INTO relationships (user_id, contact_id, last_interaction_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, contact_id) DO NOTHING`,
      [userId, contact.id]
    );

    return contact.id;
  }

  private async upsertConversation(
    userId: string,
    contactId: string,
    chatId: string,
    lastPreview: string | null,
    timestamp: Date
  ): Promise<string> {
    const preview = lastPreview?.slice(0, 500) ?? null;

    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM conversations WHERE user_id = $1 AND whatsapp_chat_id = $2`,
      [userId, chatId]
    );

    if (existing) {
      await this.db.query(
        `UPDATE conversations
         SET last_message_at = $1, last_message_preview = $2, updated_at = NOW()
         WHERE id = $3`,
        [timestamp, preview, existing.id]
      );
      return existing.id;
    }

    const { rows: [conv] } = await this.db.query<{ id: string }>(
      `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, contactId, chatId, timestamp, preview]
    );
    return conv.id;
  }

  private async insertMessage(
    conversationId: string,
    waMessageId: string,
    senderType: MessageSenderType,
    messageType: MessageType,
    body: string | null,
    timestamp: Date
  ): Promise<string | null> {
    const { rows: [row] } = await this.db.query<{ id: string }>(
      `INSERT INTO messages (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id, whatsapp_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, waMessageId, senderType, messageType, body, timestamp]
    );
    return row?.id ?? null;
  }
}
