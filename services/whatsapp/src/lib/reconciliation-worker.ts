import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@zuri/types';
import type { ReconciliationVerifyChatJob } from '@zuri/types';
import type { Pool } from 'pg';
import type { SessionManager } from './session-manager';

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}

export function startReconciliationWorker(
  sessionManager: SessionManager,
  db: Pool,
  redisUrl: string
): Worker {
  return new Worker<ReconciliationVerifyChatJob>(
    QUEUE_NAMES.RECONCILIATION_VERIFY_CHAT,
    async (job) => {
      const { userId, contactId, conversationId } = job.data;
      
      const transport = sessionManager.getTransport(userId);
      if (!transport || transport.getStatus() !== 'connected') {
        console.log(`[reconciliation] Skipped ${conversationId} - WA not connected`);
        return;
      }

      const { rows: [contact] } = await db.query<{ phone_number: string, is_group: boolean }>(
        `SELECT phone_number, is_group FROM contacts WHERE id = $1`,
        [contactId]
      );
      if (!contact) return;

      const jid = contact.is_group 
        ? contact.phone_number 
        : (contact.phone_number.includes('@') ? contact.phone_number : `${contact.phone_number}@s.whatsapp.net`);

      console.log(`[reconciliation] Verifying chat ${conversationId} for user ${userId}`);

      // Fetch up to 200 latest messages from WhatsApp
      const recentMsgs = await transport.fetchRecentMessages(jid, 200);
      if (recentMsgs.length === 0) return;

      const { rows: existingMsgs } = await db.query<{ whatsapp_message_id: string }>(
        `SELECT whatsapp_message_id FROM messages WHERE conversation_id = $1`,
        [conversationId]
      );
      const existingIds = new Set(existingMsgs.map(m => m.whatsapp_message_id));

      const missingMsgs = recentMsgs.filter(m => !existingIds.has(m.waMessageId));
      
      if (missingMsgs.length === 0) {
        console.log(`[reconciliation] Chat ${conversationId} is in sync.`);
        return;
      }

      console.log(`[reconciliation] Found ${missingMsgs.length} missing messages in chat ${conversationId}. Repairing...`);

      // Insert and enqueue silently via handleHistoricalMessage
      for (const msg of missingMsgs) {
        await sessionManager.handleHistoricalMessage(userId, msg);
      }

      // Update metadata (last_message_at)
      const { rows: [latestDb] } = await db.query<{ whatsapp_timestamp: Date }>(
        `SELECT whatsapp_timestamp FROM messages WHERE conversation_id = $1 ORDER BY whatsapp_timestamp DESC LIMIT 1`,
        [conversationId]
      );

      if (latestDb) {
        await db.query(
          `UPDATE conversations SET last_message_at = $1, updated_at = NOW() WHERE id = $2`,
          [latestDb.whatsapp_timestamp, conversationId]
        );
      }
      
      // Calculate how many were incoming so we can bump unread count safely
      const missingIncoming = missingMsgs.filter(m => !m.fromMe).length;
      if (missingIncoming > 0) {
        await db.query(
          `UPDATE conversations SET unread_count = unread_count + $1, updated_at = NOW() WHERE id = $2`,
          [missingIncoming, conversationId]
        );
      }

      console.log(`[reconciliation] Repaired ${missingMsgs.length} messages for chat ${conversationId}`);
    },
    { connection: parseRedisUrl(redisUrl), concurrency: 5 } // Allow parallel processing
  );
}
