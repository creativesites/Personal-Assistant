import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { MessageHandler } from './message-handler';
import { config } from '../config';

interface SessionEntry {
  client: Client;
  instanceId: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private handler: MessageHandler;

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly redisUrl: string
  ) {
    this.handler = new MessageHandler(db, redis, redisUrl);
  }

  async startSession(userId: string, _phoneNumber?: string): Promise<void> {
    if (this.sessions.has(userId)) {
      throw new Error('Session already active for this user');
    }

    const instanceId = await this.upsertInstance(userId, 'connecting');
    console.log(`[session] startSession userId=${userId} instanceId=${instanceId}`);

    const chromiumArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ];

    const puppeteerOptions: Record<string, unknown> = {
      headless: true,
      args: chromiumArgs,
    };

    if (config.CHROMIUM_EXECUTABLE_PATH) {
      puppeteerOptions.executablePath = config.CHROMIUM_EXECUTABLE_PATH;
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: '/app/db/sessions',
      }),
      puppeteer: puppeteerOptions as Parameters<typeof Client>[0]['puppeteer'],
    });

    // Register in map immediately so disconnect() can reach the client
    this.sessions.set(userId, { client, instanceId });

    client.on('qr', async (qr: string) => {
      console.log(`[session] QR event fired userId=${userId}`);
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        await this.db.query(
          `UPDATE whatsapp_instances
           SET qr_code = $1, qr_expires_at = NOW() + INTERVAL '3 minutes',
               status = 'qr_pending', updated_at = NOW()
           WHERE id = $2`,
          [qrDataUrl, instanceId]
        );
        console.log(`[session] QR saved to DB userId=${userId}`);
        await this.redis.publish(`whatsapp:qr:${userId}`, qrDataUrl);
      } catch (err) {
        console.error(`[session] QR save failed userId=${userId}:`, err);
      }
    });

    client.on('authenticated', () => {
      console.log(`[session] authenticated userId=${userId}`);
    });

    client.on('ready', async () => {
      console.log(`[session] ready userId=${userId}`);
      const info = client.info as unknown as Record<string, unknown>;
      const wid = info?.wid as Record<string, string> | undefined;
      const hostNumber = wid?.user || '';
      try {
        await this.db.query(
          `UPDATE whatsapp_instances
           SET status = 'connected', phone_number = $1, last_connected_at = NOW(),
               qr_code = NULL, qr_expires_at = NULL, updated_at = NOW()
           WHERE id = $2`,
          [hostNumber, instanceId]
        );
        await this.redis.publish(
          `whatsapp:connected:${userId}`,
          JSON.stringify({ userId, instanceId, phoneNumber: hostNumber })
        );
      } catch (err) {
        console.error(`[session] ready DB update failed userId=${userId}:`, err);
      }
    });

    client.on('auth_failure', async (msg: string) => {
      console.error(`[session] auth_failure userId=${userId}: ${msg}`);
      this.sessions.delete(userId);
      await this.db.query(
        `UPDATE whatsapp_instances SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      ).catch((err: unknown) => console.error(`[session] DB update failed:`, err));
    });

    client.on('disconnected', async (reason: string) => {
      console.log(`[session] disconnected userId=${userId} reason=${reason}`);
      this.sessions.delete(userId);
      await this.db.query(
        `UPDATE whatsapp_instances SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      ).catch((err: unknown) => console.error(`[session] DB update failed:`, err));
      await this.redis.publish(`whatsapp:disconnected:${userId}`, userId).catch(() => {});
    });

    client.on('message', async (message: unknown) => {
      try {
        await this.handler.handleMessage(userId, message as Record<string, unknown>);
      } catch (err) {
        console.error(`[session] handleMessage failed userId=${userId}:`, err);
      }
    });

    console.log(`[session] calling initialize() userId=${userId}`);
    client.initialize().catch(async (err: Error) => {
      console.error(`[session] initialize() failed userId=${userId}:`, err.message);
      this.sessions.delete(userId);
      await this.db.query(
        `UPDATE whatsapp_instances SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      ).catch((dbErr: unknown) => console.error(`[session] DB update failed:`, dbErr));
    });
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) return;

    try {
      await entry.client.destroy();
    } catch {
      // ignore destroy errors
    }

    this.sessions.delete(userId);

    await this.db.query(
      `UPDATE whatsapp_instances SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
      [entry.instanceId]
    );

    await this.redis.publish(`whatsapp:disconnected:${userId}`, userId).catch(() => {});
  }

  async restoreAll(): Promise<void> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM whatsapp_instances WHERE status = 'connected'`
    );

    for (const { user_id } of rows) {
      this.startSession(user_id).catch((err: Error) => {
        console.error(`Failed to restore session for ${user_id}:`, err.message);
      });
    }
  }

  private async upsertInstance(userId: string, status: string): Promise<string> {
    // ORDER BY created_at DESC must match the status-API query so we read/write the same row
    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM whatsapp_instances WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (existing) {
      await this.db.query(
        `UPDATE whatsapp_instances
         SET status = $1, qr_code = NULL, qr_expires_at = NULL,
             link_code = NULL, link_code_expires_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [status, existing.id]
      );
      return existing.id;
    }

    const { rows: [created] } = await this.db.query<{ id: string }>(
      `INSERT INTO whatsapp_instances (user_id, status) VALUES ($1, $2) RETURNING id`,
      [userId, status]
    );
    return created.id;
  }

  async sendMessage(userId: string, jid: string, text: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) throw new Error(`No active session for user ${userId}`);
    await entry.client.sendMessage(jid, text);
  }

  status(userId: string): 'connected' | 'disconnected' {
    return this.sessions.has(userId) ? 'connected' : 'disconnected';
  }

  activeCount(): number {
    return this.sessions.size;
  }
}
