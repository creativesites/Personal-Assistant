import type { Pool } from 'pg';
import type Redis from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
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
  // Prevent repeated sync triggers from rapid phone_chats events.
  // Maps userId → timestamp of last trigger. Cleared on service restart.
  private readonly syncTriggerCooldown = new Map<string, number>();

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly redisUrl: string,
    private readonly createTransport: TransportFactory,
  ) {
    this.handler = new MessageHandler(db, redis, redisUrl);
  }

  async startSession(userId: string, phoneNumber?: string, forceNewQR = false): Promise<void> {
    const existing = this.sessions.get(userId);
    if (existing) {
      if (existing.transport.getStatus() === 'connected') {
        throw new Error('Session already active for this user');
      }
      // Stuck in reconnect loop — stop and replace with a fresh session
      await existing.transport.stop();
      this.sessions.delete(userId);
    }

    const instanceId = await this.upsertInstance(userId, 'connecting');
    const transport = this.createTransport(userId, phoneNumber, forceNewQR);
    this.sessions.set(userId, { transport, instanceId });

    transport.on('link_code', async (code: string) => {
      try {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await this.db.query(
          `UPDATE whatsapp_instances
           SET status = 'link_code_pending', link_code = $1, link_code_expires_at = $2, updated_at = NOW()
           WHERE id = $3`,
          [code, expiresAt, instanceId],
        );
        await this.redis.publish(`whatsapp:link_code:${userId}`, code).catch(() => {});
      } catch (err) {
        console.error(`[session] link_code write failed userId=${userId}:`, err);
      }
    });

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

        // On reconnect (no phone_chats event): trigger sync if never done before.
        // phone_chats-based triggers handle the normal first-connect case via checkAndTriggerSync.
        const { rows: [anyJob] } = await this.db.query<{ id: string }>(
          `SELECT id FROM sync_jobs WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        if (!anyJob) {
          const COOLDOWN_MS = 5 * 60 * 1000;
          const lastTrigger = this.syncTriggerCooldown.get(userId) ?? 0;
          if (Date.now() - lastTrigger >= COOLDOWN_MS) {
            console.log(`[session-manager] no sync job found for ${userId} on connect — triggering`);
            this.syncTriggerCooldown.set(userId, Date.now());
            await this.redis.publish(`history:sync:trigger:${userId}`, JSON.stringify({ userId }));
          }
        }
      } catch (err) {
        console.error(`[session] connected DB update failed userId=${userId}:`, err);
      }
    });

    transport.on('phone_chats', async (chats: any[]) => {
      try {
        console.log(`[session-manager] received phone_chats event for ${userId}: ${chats.length} chats`);
        await this.checkAndTriggerSync(userId, chats);
      } catch (err) {
        console.error(`[session-manager] error in phone_chats handler for ${userId}:`, err);
      }
    });

    transport.on('disconnected', async (reason: TransportDisconnectReason) => {
      this.sessions.delete(userId);
      try {
        await this.redis.del(`wa:qr:${userId}`);
        let dbStatus = 'error';
        if (reason === 'logged_out') dbStatus = 'logged_out';
        else if (reason === 'replaced') dbStatus = 'disconnected';
        else if (reason === 'timeout') dbStatus = 'disconnected';

        await this.db.query(
          `UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2`,
          [dbStatus, instanceId],
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

    transport.on('historical_batch', async (msgs: NormalisedMessage[]) => {
      const PROGRESS_EVERY = 50;
      // How many of the most-recent messages per conversation to queue for AI analysis.
      // All messages are written to DB; only the last N are sent for profiling.
      const ANALYSE_RECENT_PER_CHAT = 30;

      console.log(`[session] historical batch: ${msgs.length} messages for ${userId}`);

      // ── Step 1: write all messages to DB, track unique conversations ─────────
      // Map<conversationId, contactId> — last write wins (newest message's contactId)
      const convMap = new Map<string, string>();

      for (let i = 0; i < msgs.length; i++) {
        try {
          const result = await this.handler.writeHistoricalMessage(userId, msgs[i]);
          if (result) {
            convMap.set(result.conversationId, result.contactId);
            await this.handler.publishConversationUpsert(userId, result.conversationId);
          }
        } catch (err) {
          console.error(`[session] historical write failed userId=${userId}:`, err);
        }

        if ((i + 1) % PROGRESS_EVERY === 0 || i === msgs.length - 1) {
          await this.redis.publish(
            `history:progress:${userId}`,
            JSON.stringify({
              status: 'running',
              phase: 'importing',
              processedMessages: i + 1,
              totalMessages: msgs.length,
              processed: i + 1,
              total: msgs.length,
            }),
          ).catch(() => { /* ignore */ });
        }
      }

      // ── Step 2: queue ONE analysis job per conversation ──────────────────────
      // The intelligence service fetches the last ANALYSE_RECENT_PER_CHAT messages
      // itself; we just tell it which conversation to process.
      const intelligenceUrl = process.env['INTELLIGENCE_SERVICE_URL'] ?? 'http://localhost:8000';
      const internalSecret = process.env['INTERNAL_API_SECRET'] ?? '';

      let analysed = 0;
      for (const [conversationId, contactId] of convMap) {
        try {
          await this.redis.publish(
            `history:progress:${userId}`,
            JSON.stringify({
              status: 'running',
              phase: 'analysing',
              conversationId,
              processedConversations: analysed,
              totalConversations: convMap.size,
              processedMessages: msgs.length,
              totalMessages: msgs.length,
            }),
          ).catch(() => { /* ignore */ });
          await fetch(`${intelligenceUrl}/internal/conversations/${conversationId}/analyse-history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': internalSecret,
            },
            body: JSON.stringify({ userId, contactId, recentCount: ANALYSE_RECENT_PER_CHAT }),
          });
          analysed++;
          await this.handler.publishConversationUpsert(userId, conversationId);
        } catch (err) {
          console.error(`[session] historical analyse failed conv=${conversationId}:`, err);
        }
      }

      await this.redis.publish(
        `history:progress:${userId}`,
        JSON.stringify({
          status: 'completed',
          phase: 'complete',
          processedConversations: analysed,
          totalConversations: convMap.size,
          processedMessages: msgs.length,
          totalMessages: msgs.length,
        }),
      ).catch(() => { /* ignore */ });

      console.log(
        `[session] historical sync complete for ${userId}: ` +
        `${msgs.length} messages written, ${analysed}/${convMap.size} conversations queued for analysis`,
      );
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

  async stopAll(): Promise<void> {
    console.log(`[session-manager] stopping all active sessions (${this.sessions.size})...`);
    const promises: Promise<void>[] = [];
    for (const [userId, entry] of this.sessions.entries()) {
      promises.push(
        entry.transport.stop().catch((err) => {
          console.error(`[session-manager] failed to stop transport for ${userId}:`, err);
        })
      );
    }
    await Promise.all(promises);
    this.sessions.clear();
    console.log(`[session-manager] all sessions stopped.`);
  }

  async sendMessage(userId: string, jid: string, text: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) throw new Error(`No active session for user ${userId}`);
    await entry.transport.sendText(jid, text);
  }

  async requestLinkCode(userId: string, phoneNumber: string): Promise<string> {
    const entry = this.sessions.get(userId);
    if (!entry) throw new Error(`No active session for user ${userId}`);

    const code = await entry.transport.requestLinkCode(phoneNumber);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute window

    await this.db.query(
      `UPDATE whatsapp_instances
       SET status = 'link_code_pending', link_code = $1, link_code_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [code, expiresAt, entry.instanceId],
    );
    await this.redis.publish(`whatsapp:link_code:${userId}`, code).catch(() => { /* ignore */ });
    return code;
  }

  async resetStaleStates(): Promise<void> {
    const result = await this.db.query(
      `UPDATE whatsapp_instances
       SET status = 'disconnected', qr_code = NULL, link_code = NULL,
           link_code_expires_at = NULL, updated_at = NOW()
       WHERE status IN ('connecting', 'qr_pending', 'link_code_pending')`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[session-manager] reset ${result.rowCount} stale session(s) to disconnected`);
    }
  }

  async restoreAll(): Promise<void> {
    // Restore every user that was ever connected and hasn't explicitly logged out.
    // Baileys will reuse the saved auth files — no QR scan needed.
    const { rows } = await this.db.query<{ user_id: string, id: string }>(
      `SELECT DISTINCT ON (user_id) user_id, id
       FROM whatsapp_instances
       WHERE status = 'connected'
       ORDER BY user_id, last_connected_at DESC NULLS LAST`,
    );

    console.log(`[session-manager] found ${rows.length} sessions to restore`);

    for (const { user_id, id } of rows) {
      if (this.sessions.has(user_id)) continue;

      // Verify files exist on disk before restoring
      const authPath = path.join(config.SESSIONS_DIR, user_id);
      const credsPath = path.join(authPath, 'creds.json');
      let hasCreds = false;
      try {
        const stats = await fs.stat(credsPath);
        hasCreds = stats.isFile() && stats.size > 0;
      } catch {
        hasCreds = false;
      }

      if (!hasCreds) {
        console.warn(`[session-manager] credentials not found on disk for user ${user_id}, marking status as disconnected`);
        await this.db.query(
          `UPDATE whatsapp_instances SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
          [id],
        );
        continue;
      }

      try {
        console.log(`[session-manager] restoring session for user ${user_id}...`);
        await this.startSession(user_id);
        // Small delay to serialize startup and prevent DB/CPU spikes
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (err: any) {
        console.error(`[session-manager] restore failed for ${user_id}:`, err.message);
      }
    }
  }

  status(userId: string): 'connected' | 'disconnected' {
    const entry = this.sessions.get(userId);
    if (!entry) return 'disconnected';
    return entry.transport.getStatus() === 'connected' ? 'connected' : 'disconnected';
  }

  activeCount(): number {
    return this.sessions.size;
  }

  async checkAndTriggerSync(userId: string, phoneChats: { id: string }[]): Promise<void> {
    try {
      // Debounce: don't trigger more than once per 5 minutes per user in this process.
      // phone_chats fires many times as Baileys delivers multiple history batches.
      const COOLDOWN_MS = 5 * 60 * 1000;
      const lastTrigger = this.syncTriggerCooldown.get(userId) ?? 0;
      if (Date.now() - lastTrigger < COOLDOWN_MS) {
        console.log(`[session-manager] sync trigger debounced for ${userId} (last trigger <5m ago)`);
        return;
      }

      const phoneChatCount = phoneChats.length;

      // Get DB chats count
      const { rows: [dbChats] } = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM conversations WHERE user_id = $1`,
        [userId],
      );
      const dbChatCount = parseInt(dbChats.count, 10);

      // Check for any active or running sync job (pending, running, etc. — not completed/failed)
      const { rows: [activeJob] } = await this.db.query<{ id: string }>(
        `SELECT id FROM sync_jobs WHERE user_id = $1 AND status NOT IN ('completed', 'failed') LIMIT 1`,
        [userId],
      );

      // Check if they ever completed a sync job
      const { rows: [completedJob] } = await this.db.query<{ status: string }>(
        `SELECT status FROM sync_jobs WHERE user_id = $1 AND status = 'completed' LIMIT 1`,
        [userId],
      );

      console.log(`[session-manager] sync check for ${userId}: phone=${phoneChatCount} db=${dbChatCount} activeJob=${!!activeJob} everCompleted=${!!completedJob}`);

      if (activeJob) {
        console.log(`[session-manager] sync already in progress for ${userId}, skipping trigger`);
        return;
      }

      // Trigger if: never synced, OR DB has meaningfully fewer chats than phone
      const needsSync = !completedJob || dbChatCount < phoneChatCount;

      if (needsSync) {
        console.log(`[session-manager] triggering history sync for ${userId}`);
        this.syncTriggerCooldown.set(userId, Date.now());
        await this.redis.publish(`history:sync:trigger:${userId}`, JSON.stringify({ userId }));
      }
    } catch (err) {
      console.error(`[session-manager] checkAndTriggerSync failed for ${userId}:`, err);
    }
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
