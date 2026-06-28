import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { MessageHandler } from './message-handler';
import type {
  WhatsAppTransport,
  TransportFactory,
  NormalisedMessage,
  TransportDisconnectReason,
} from '../transport/types';

const QR_TTL_SECONDS = 180;

interface SessionEntry {
  transport: WhatsAppTransport;
  instanceId: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly handler: MessageHandler;

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly redisUrl: string,
    private readonly createTransport: TransportFactory,
  ) {
    this.handler = new MessageHandler(db, redis, redisUrl);
  }

  async startSession(userId: string): Promise<void> {
    if (this.sessions.has(userId)) {
      throw new Error('Session already active for this user');
    }

    const instanceId = await this.upsertInstance(userId, 'connecting');
    const transport = this.createTransport(userId);
    this.sessions.set(userId, { transport, instanceId });

    transport.on('qr', async (dataUrl: string) => {
      try {
        await this.redis.setex(`wa:qr:${userId}`, QR_TTL_SECONDS, dataUrl);
        await this.db.query(
          `UPDATE whatsapp_instances
           SET status = 'qr_pending', qr_code = NULL, updated_at = NOW()
           WHERE id = $1`,
          [instanceId],
        );
        await this.redis.publish(`whatsapp:qr:${userId}`, dataUrl);
      } catch (err) {
        console.error(`[session] QR write failed userId=${userId}:`, err);
      }
    });

    transport.on('connected', async (phoneNumber: string) => {
      try {
        await this.redis.del(`wa:qr:${userId}`);
        await this.db.query(
          `UPDATE whatsapp_instances
           SET status = 'connected', phone_number = $1, last_connected_at = NOW(),
               qr_code = NULL, qr_expires_at = NULL, updated_at = NOW()
           WHERE id = $2`,
          [phoneNumber, instanceId],
        );
        await this.redis.publish(
          `whatsapp:connected:${userId}`,
          JSON.stringify({ userId, instanceId, phoneNumber }),
        );
      } catch (err) {
        console.error(`[session] connected DB update failed userId=${userId}:`, err);
      }
    });

    transport.on('disconnected', async (reason: TransportDisconnectReason) => {
      this.sessions.delete(userId);
      try {
        await this.redis.del(`wa:qr:${userId}`);
        await this.db.query(
          `UPDATE whatsapp_instances
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [reason === 'unknown' ? 'error' : 'disconnected', instanceId],
        );
        await this.redis.publish(`whatsapp:disconnected:${userId}`, userId);
      } catch (err) {
        console.error(`[session] disconnected DB update failed userId=${userId}:`, err);
      }
    });

    transport.on('message', async (msg: NormalisedMessage) => {
      try {
        await this.handler.handleMessage(userId, msg);
      } catch (err) {
        console.error(`[session] handleMessage failed userId=${userId}:`, err);
      }
    });

    await transport.start();
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) return;

    await entry.transport.stop();
    this.sessions.delete(userId);

    await this.redis.del(`wa:qr:${userId}`).catch(() => { /* ignore */ });
    await this.db.query(
      `UPDATE whatsapp_instances SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
      [entry.instanceId],
    );
    await this.redis.publish(`whatsapp:disconnected:${userId}`, userId).catch(() => { /* ignore */ });
  }

  async sendMessage(userId: string, jid: string, text: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) throw new Error(`No active session for user ${userId}`);
    await entry.transport.sendText(jid, text);
  }

  async restoreAll(): Promise<void> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM whatsapp_instances WHERE status = 'connected'`,
    );
    for (const { user_id } of rows) {
      this.startSession(user_id).catch((err: Error) => {
        console.error(`[session] restore failed for ${user_id}:`, err.message);
      });
    }
  }

  status(userId: string): 'connected' | 'disconnected' {
    return this.sessions.has(userId) ? 'connected' : 'disconnected';
  }

  activeCount(): number {
    return this.sessions.size;
  }

  private async upsertInstance(userId: string, status: string): Promise<string> {
    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM whatsapp_instances WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (existing) {
      await this.db.query(
        `UPDATE whatsapp_instances
         SET status = $1, qr_code = NULL, qr_expires_at = NULL,
             link_code = NULL, link_code_expires_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [status, existing.id],
      );
      return existing.id;
    }

    const { rows: [created] } = await this.db.query<{ id: string }>(
      `INSERT INTO whatsapp_instances (user_id, status) VALUES ($1, $2) RETURNING id`,
      [userId, status],
    );
    return created.id;
  }
}
