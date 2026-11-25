import type { Pool } from 'pg';
import { MediaStore } from './media-store';
import type Redis from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
import { MessageHandler } from './message-handler';
import { HistorySyncPipeline } from './history-sync-pipeline';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@zuri/types';
import type {
  WhatsAppTransport,
  TransportFactory,
  NormalisedMessage,
  HistorySetPayload,
  HistoryContact,
  MessageMutation,
  CatalogProductInput,
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
  private readonly historyPipeline: HistorySyncPipeline;
  private readonly reconQueue: Queue;
  readonly media: MediaStore;

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly redisUrl: string,
    private readonly createTransport: TransportFactory,
  ) {
    this.media = new MediaStore(db, (userId) => this.getTransport(userId));
    this.handler = new MessageHandler(db, redis, redisUrl, this.media);
    this.historyPipeline = new HistorySyncPipeline(
      db,
      redis,
      process.env['INTELLIGENCE_SERVICE_URL'] ?? 'http://localhost:8000',
      process.env['INTERNAL_API_SECRET'] ?? '',
    );
    this.historyPipeline.setMutationApplier((userId, m) => this.handler.applyMutation(userId, m, false));
    this.reconQueue = new Queue(QUEUE_NAMES.RECONCILIATION_VERIFY_CHAT, {
      connection: {
        host: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port || '6379', 10),
        password: new URL(redisUrl).password || undefined,
        db: new URL(redisUrl).pathname.length > 1 ? parseInt(new URL(redisUrl).pathname.slice(1), 10) : 0,
      }
    });
  }

  async startSession(userId: string, phoneNumber?: string, forceNewQR = false): Promise<void> {
    const existing = this.sessions.get(userId);
    if (existing) {
      if (existing.transport.getStatus() === 'connected' && !forceNewQR) {
        return;
      }
      // Stop existing transport before recreating or replacing
      await existing.transport.stop().catch(() => {});
      this.sessions.delete(userId);
    }

    const instanceId = await this.upsertInstance(userId, 'connecting');
    const transport = this.createTransport(userId, phoneNumber, forceNewQR);
    this.sessions.set(userId, { transport, instanceId });

    transport.on('link_code', async (code: string) => {
      try {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await this.redis.setex(`wa:link_code:${userId}`, 300, code).catch(() => {});
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
               disconnected_at = NULL, disconnect_alert_sent_at = NULL,
               qr_code = NULL, qr_expires_at = NULL, updated_at = NOW()
           WHERE id = $2`,
          [phoneNumber, instanceId],
        );
        await this.redis.publish(
          `whatsapp:connected:${userId}`,
          JSON.stringify({ userId, instanceId, phoneNumber }),
        );

        await this.db.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'whatsapp_connected', 'WhatsApp Connected', 'Your WhatsApp account has been successfully connected to Zuri.')`,
          [userId],
        ).catch(err => console.error('[session] failed to insert connect notification:', err));

        await this.redis.publish(
          `notification:new:${userId}`,
          JSON.stringify({
            type: 'whatsapp_connected',
            title: 'WhatsApp Connected',
            body: 'Your WhatsApp account has been successfully connected to Zuri.',
          })
        ).catch(() => {});

        // On any reconnect, automatically verify the top 20 most recent chats to recover messages
        // that were missed while the worker or socket was offline.
        try {
          const { rows: activeChats } = await this.db.query<{ id: string, contact_id: string }>(
            `SELECT id, contact_id FROM conversations 
             WHERE user_id = $1 AND is_archived = false 
             ORDER BY last_message_at DESC NULLS LAST LIMIT 20`,
            [userId]
          );
          for (const chat of activeChats) {
            await this.reconQueue.add(
              QUEUE_NAMES.RECONCILIATION_VERIFY_CHAT,
              { userId, conversationId: chat.id, contactId: chat.contact_id },
              // BullMQ rejects ':' in custom job IDs ("Custom Id cannot contain :"),
              // which silently broke reconnect message recovery.
              { jobId: `recon-${chat.id}`, removeOnComplete: true, removeOnFail: false }
            );
          }
        } catch (err) {
          console.error(`[session-manager] failed to enqueue recon jobs on connect for ${userId}:`, err);
        }
      } catch (err) {
        console.error(`[session] connected DB update failed userId=${userId}:`, err);
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
          `UPDATE whatsapp_instances 
           SET status = $1, disconnected_at = COALESCE(disconnected_at, NOW()), updated_at = NOW() 
           WHERE id = $2`,
          [dbStatus, instanceId],
        );
        await this.redis.publish(`whatsapp:disconnected:${userId}`, userId);

        await this.db.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'whatsapp_disconnected', 'WhatsApp Disconnected', 'Your WhatsApp account was disconnected. Please scan the QR code to reconnect.')`,
          [userId],
        ).catch(err => console.error('[session] failed to insert disconnect notification:', err));

        await this.redis.publish(
          `notification:new:${userId}`,
          JSON.stringify({
            type: 'whatsapp_disconnected',
            title: 'WhatsApp Disconnected',
            body: 'Your WhatsApp account was disconnected. Please scan the QR code to reconnect.',
          })
        ).catch(() => {});
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

    // Reactions, deletes-for-everyone and edits of earlier messages.
    transport.on('message_mutation', async (m: MessageMutation) => {
      try {
        await this.handler.applyMutation(userId, m);
      } catch (err) {
        console.error(`[session] applyMutation failed userId=${userId} kind=${m.kind}:`, err);
      }
    });

    transport.on('presence_update', async (data: { jid: string; participantJid: string; presence: string; lastSeen?: number }) => {
      try {
        if (data.presence === 'available' || data.presence === 'composing' || data.presence === 'recording') {
          await this.db.query(
            `UPDATE contacts SET last_seen_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND whatsapp_jid = $2`,
            [userId, data.jid],
          );
        } else if (data.lastSeen) {
          const lastSeenDate = new Date(data.lastSeen * 1000);
          await this.db.query(
            `UPDATE contacts SET last_seen_at = $1, updated_at = NOW() WHERE user_id = $2 AND whatsapp_jid = $3`,
            [lastSeenDate, userId, data.jid],
          );
        }

        await this.redis.publish(
          `presence:update:${userId}`,
          JSON.stringify({
            jid: data.jid,
            participantJid: data.participantJid,
            presence: data.presence,
            lastSeenAt: data.lastSeen ? new Date(data.lastSeen * 1000).toISOString() : new Date().toISOString(),
          }),
        ).catch(() => { /* ignore */ });
      } catch (err) {
        console.error(`[session] presence_update failed userId=${userId}:`, err);
      }
    });

    transport.on('message_status_update', async (data: { waMessageId: string; jid: string; status: number }) => {
      try {
        let deliveryStatus = 'sent';
        if (data.status === 3) deliveryStatus = 'delivered';
        else if (data.status === 4 || data.status === 5) deliveryStatus = 'read';

        const { rows } = await this.db.query(
          `UPDATE messages m
           SET delivery_status = $1
           FROM conversations c
           WHERE m.conversation_id = c.id
             AND c.user_id = $2
             AND m.whatsapp_message_id = $3
           RETURNING m.id, m.conversation_id`,
          [deliveryStatus, userId, data.waMessageId],
        );

        if (rows[0]) {
          await this.redis.publish(
            `message:status:update:${userId}`,
            JSON.stringify({
              messageId: rows[0].id,
              conversationId: rows[0].conversation_id,
              deliveryStatus,
            }),
          ).catch(() => { /* ignore */ });
        }
      } catch (err) {
        console.error(`[session] message_status_update failed userId=${userId}:`, err);
      }
    });

    // History sync: every batch goes to the per-user pipeline, which
    // serialises batches, bulk-writes them and runs AI analysis once the
    // import settles. See lib/history-sync-pipeline.ts.
    transport.on('history_set', (payload: HistorySetPayload) => {
      this.historyPipeline.ingest(userId, payload);
    });
    transport.on('contact_hints', (hints: HistoryContact[]) => {
      this.historyPipeline.applyContactHints(userId, hints);
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

  private async ensureActiveSession(userId: string): Promise<SessionEntry> {
    let entry = this.sessions.get(userId);
    if (entry && entry.transport.getStatus() === 'connected') {
      return entry;
    }

    // Check if saved credentials exist on disk for auto-restoration
    const authPath = path.join(config.SESSIONS_DIR, userId);
    const credsPath = path.join(authPath, 'creds.json');
    let hasCreds = false;
    try {
      const stats = await fs.stat(credsPath);
      hasCreds = stats.isFile() && stats.size > 0;
    } catch {
      hasCreds = false;
    }

    if (!hasCreds) {
      if (entry) {
        await entry.transport.stop().catch(() => {});
        this.sessions.delete(userId);
      }
      throw new Error(`No active WhatsApp session or saved credentials for user ${userId}. Please reconnect via QR code.`);
    }

    console.log(`[session-manager] auto-restoring session for user ${userId}...`);

    if (entry) {
      await entry.transport.stop().catch(() => {});
      this.sessions.delete(userId);
    }

    await this.startSession(userId, undefined, false);

    // Wait up to 10 seconds for the session to connect
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const current = this.sessions.get(userId);
      if (current && current.transport.getStatus() === 'connected') {
        return current;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    entry = this.sessions.get(userId);
    if (!entry || entry.transport.getStatus() !== 'connected') {
      throw new Error(`WhatsApp session auto-restore timed out for user ${userId}. Please click Reconnect.`);
    }

    return entry;
  }

  async sendMessage(
    userId: string,
    jid: string,
    text: string,
    options?: { quotedWaMessageId?: string; quotedBody?: string }
  ): Promise<string | undefined> {
    const entry = await this.ensureActiveSession(userId);
    return entry.transport.sendText(jid, text, options);
  }

  async sendReaction(
    userId: string,
    jid: string,
    emoji: string,
    targetWaMessageId: string,
    fromMe: boolean
  ): Promise<void> {
    const entry = await this.ensureActiveSession(userId);
    await entry.transport.sendReaction(jid, emoji, targetWaMessageId, fromMe);
  }

  async deleteMessage(
    userId: string,
    jid: string,
    waMessageId: string,
    fromMe: boolean
  ): Promise<void> {
    const entry = await this.ensureActiveSession(userId);
    await entry.transport.deleteMessage(jid, waMessageId, fromMe);
  }

  async fetchProfilePicture(userId: string, jid: string): Promise<string | null> {
    const entry = await this.ensureActiveSession(userId);
    return await entry.transport.fetchProfilePictureUrl(jid);
  }

  async postStatus(
    userId: string,
    mediaType: 'text' | 'image' | 'video',
    content: string,
    options?: { caption?: string; backgroundColor?: string }
  ): Promise<void> {
    const entry = await this.ensureActiveSession(userId);
    await entry.transport.postStatus(mediaType, content, options);
  }

  async sendPresenceUpdate(
    userId: string,
    presence: 'composing' | 'recording' | 'paused' | 'available',
    toJid: string
  ): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry || entry.transport.getStatus() !== 'connected') return; // Silent return if session not online
    await entry.transport.sendPresenceUpdate(presence, toJid);
  }

  async sendDocument(
    userId: string,
    jid: string,
    filePath: string,
    mimetype: string,
    fileName: string,
    caption?: string,
  ): Promise<string | undefined> {
    const entry = await this.ensureActiveSession(userId);
    return entry.transport.sendDocument(jid, filePath, mimetype, fileName, caption);
  }

  async listCatalogProducts(userId: string, limit?: number, cursor?: string): Promise<{ products: unknown[]; nextPageCursor?: string }> {
    const entry = await this.ensureActiveSession(userId);
    return await entry.transport.listCatalogProducts(limit, cursor);
  }

  async createCatalogProduct(userId: string, product: CatalogProductInput): Promise<unknown> {
    const entry = await this.ensureActiveSession(userId);
    return await entry.transport.createCatalogProduct(product);
  }

  async requestLinkCode(userId: string, phoneNumber: string): Promise<string> {
    const entry = await this.ensureActiveSession(userId);

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

  getTransport(userId: string): WhatsAppTransport | undefined {
    return this.sessions.get(userId)?.transport;
  }

  activeCount(): number {
    return this.sessions.size;
  }

  async handleHistoricalMessage(userId: string, msg: NormalisedMessage): Promise<void> {
    await this.handler.handleMessage(userId, msg, true);
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
