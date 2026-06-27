import { create, Client, ev } from '@open-wa/wa-automate';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { MessageHandler } from './message-handler';
import { config } from '../config';

interface SessionEntry {
  client: Client;
  instanceId: string;
}

type EvHandler = (...args: unknown[]) => void;

interface SessionListeners {
  qr: EvHandler;
  linkCode: EvHandler;
  sessionData: EvHandler;
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

  async startSession(userId: string, phoneNumber?: string): Promise<void> {
    if (this.sessions.has(userId)) {
      throw new Error('Session already active for this user');
    }

    const instanceId = await this.upsertInstance(userId, 'connecting');

    const listeners: SessionListeners = {
      qr: async (qrcode: unknown) => {
        const qr = qrcode as string;
        await this.db.query(
          `UPDATE whatsapp_instances
           SET qr_code = $1, qr_expires_at = NOW() + INTERVAL '3 minutes',
               status = 'qr_pending', updated_at = NOW()
           WHERE id = $2`,
          [qr, instanceId]
        );
        await this.redis.publish(`whatsapp:qr:${userId}`, qr);
      },
      linkCode: async (code: unknown) => {
        const lc = code as string;
        await this.db.query(
          `UPDATE whatsapp_instances
           SET link_code = $1, link_code_expires_at = NOW() + INTERVAL '3 minutes',
               status = 'link_code_pending', updated_at = NOW()
           WHERE id = $2`,
          [lc, instanceId]
        );
        await this.redis.publish(`whatsapp:link_code:${userId}`, lc);
      },
      sessionData: async (data: unknown) => {
        await this.db.query(
          `UPDATE whatsapp_instances SET session_data = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(data), instanceId]
        );
      },
    };

    ev.on(`qr.${userId}` as string, listeners.qr);
    ev.on(`linkCode.${userId}` as string, listeners.linkCode);
    ev.on(`sessionData.${userId}` as string, listeners.sessionData);

    // Fire-and-forget: create() blocks until QR is scanned
    this.connectAsync(userId, instanceId, phoneNumber, listeners).catch(async (err: Error) => {
      this.cleanupListeners(userId, listeners);
      await this.db.query(
        `UPDATE whatsapp_instances SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      );
      await this.redis.publish(`whatsapp:error:${userId}`, err.message);
    });
  }

  private async connectAsync(
    userId: string,
    instanceId: string,
    phoneNumber: string | undefined,
    listeners: SessionListeners
  ): Promise<void> {
    const { rows: [instance] } = await this.db.query<{ session_data: string | null }>(
      `SELECT session_data FROM whatsapp_instances WHERE id = $1`,
      [instanceId]
    );

    const chromiumArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

    const createConfig: Record<string, unknown> = {
      sessionId: userId,
      headless: true,
      skipSessionSave: true,
      killProcessOnBrowserClose: true,
      throwErrorOnTosBlock: false,
      chromiumArgs,
    };

    if (config.CHROMIUM_EXECUTABLE_PATH) {
      createConfig.executablePath = config.CHROMIUM_EXECUTABLE_PATH;
    }

    if (phoneNumber) {
      createConfig.linkCode = phoneNumber;
    }

    if (instance?.session_data) {
      try {
        createConfig.sessionData = JSON.parse(instance.session_data);
      } catch {
        // stale or invalid session data — start fresh
      }
    }

    const client = await create(createConfig as Parameters<typeof create>[0]);

    // QR/linkCode no longer needed after auth
    this.cleanupListeners(userId, { qr: listeners.qr, linkCode: listeners.linkCode });

    this.sessions.set(userId, { client, instanceId });

    const hostNumber = await client.getHostNumber();
    await this.db.query(
      `UPDATE whatsapp_instances
       SET status = 'connected', phone_number = $1, last_connected_at = NOW(),
           qr_code = NULL, updated_at = NOW()
       WHERE id = $2`,
      [hostNumber, instanceId]
    );

    await this.redis.publish(
      `whatsapp:connected:${userId}`,
      JSON.stringify({ userId, instanceId, phoneNumber: hostNumber })
    );

    client.onMessage(async (message) => {
      await this.handler.handleMessage(userId, message);
    });

    client.onStateChanged(async (state) => {
      if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
        await this.disconnect(userId);
      }
    });
  }

  private cleanupListeners(
    userId: string,
    listeners: Partial<SessionListeners>
  ): void {
    if (listeners.qr) ev.off(`qr.${userId}` as string, listeners.qr);
    if (listeners.linkCode) ev.off(`linkCode.${userId}` as string, listeners.linkCode);
    if (listeners.sessionData) ev.off(`sessionData.${userId}` as string, listeners.sessionData);
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) return;

    try {
      await entry.client.kill();
    } catch {
      // ignore kill errors
    }

    this.sessions.delete(userId);

    await this.db.query(
      `UPDATE whatsapp_instances SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
      [entry.instanceId]
    );

    await this.redis.publish(`whatsapp:disconnected:${userId}`, userId);
  }

  async restoreAll(): Promise<void> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM whatsapp_instances WHERE status = 'connected' AND session_data IS NOT NULL`
    );

    for (const { user_id } of rows) {
      this.startSession(user_id).catch((err: Error) => {
        console.error(`Failed to restore session for ${user_id}:`, err.message);
      });
    }
  }

  private async upsertInstance(userId: string, status: string): Promise<string> {
    const { rows: [existing] } = await this.db.query<{ id: string }>(
      `SELECT id FROM whatsapp_instances WHERE user_id = $1`,
      [userId]
    );

    if (existing) {
      await this.db.query(
        `UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2`,
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
    await entry.client.sendText(jid as Parameters<typeof entry.client.sendText>[0], text);
  }

  status(userId: string): 'connected' | 'disconnected' {
    return this.sessions.has(userId) ? 'connected' : 'disconnected';
  }

  activeCount(): number {
    return this.sessions.size;
  }
}
