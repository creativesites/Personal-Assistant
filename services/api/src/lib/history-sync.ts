import { db } from './db';
import { queues } from './queue';
import { QUEUE_NAMES, MessageSenderType, MessageType } from '@zuri/types';

interface SyncJob {
  id: string;
  userId: string;
}

// In-memory cancel signals (keyed by syncJobId)
const cancelSignals = new Map<string, boolean>();

export async function startHistorySync(userId: string): Promise<string> {
  // Cancel any running sync for this user
  const { rows: running } = await db.query<{ id: string }>(
    `SELECT id FROM sync_jobs WHERE user_id = $1 AND status = 'running'`,
    [userId],
  );
  for (const row of running) {
    cancelSignals.set(row.id, true);
    await db.query(
      `UPDATE sync_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [row.id],
    );
  }

  // Count what we have to process
  const { rows: [counts] } = await db.query<{ convs: string; msgs: string }>(
    `SELECT
       COUNT(DISTINCT c.id) AS convs,
       COUNT(m.id) AS msgs
     FROM conversations c
     JOIN messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1 AND m.body IS NOT NULL`,
    [userId],
  );

  const { rows: [job] } = await db.query<{ id: string }>(
    `INSERT INTO sync_jobs (user_id, status, total_conversations, total_messages, started_at)
     VALUES ($1, 'running', $2, $3, NOW())
     RETURNING id`,
    [userId, parseInt(counts.convs, 10), parseInt(counts.msgs, 10)],
  );

  const syncJobId = job.id;

  // Run async in background — don't await
  runSync({ id: syncJobId, userId }).catch((err) => {
    console.error(`[history-sync] fatal error for user ${userId}:`, err);
    db.query(
      `UPDATE sync_jobs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [String(err), syncJobId],
    ).catch(() => { /* ignore */ });
  });

  return syncJobId;
}

async function runSync(job: SyncJob): Promise<void> {
  const { id: syncJobId, userId } = job;

  const { rows: conversations } = await db.query<{
    id: string; whatsapp_chat_id: string; contact_id: string; last_message_at: string | null
  }>(
    `SELECT c.id, c.whatsapp_chat_id, c.contact_id, c.last_message_at
     FROM conversations c
     WHERE c.user_id = $1
     ORDER BY c.last_message_at DESC NULLS LAST`,
    [userId],
  );

  let processedConversations = 0;
  let processedMessages = 0;
  let contactsCreated = 0;
  let leadsGenerated = 0;
  let insightsExtracted = 0;

  for (const conv of conversations) {
    if (cancelSignals.get(syncJobId)) break;

    // Get contact name for progress display
    const { rows: [contact] } = await db.query<{
      name: string; customer_status: string | null; lead_score: number | null
    }>(
      `SELECT COALESCE(custom_name, display_name, phone_number, 'Unknown') AS name,
              customer_status, lead_score
       FROM contacts WHERE id = $1`,
      [conv.contact_id],
    );

    if (contact) {
      await db.query(
        `UPDATE sync_jobs SET current_chat_name = $1, updated_at = NOW() WHERE id = $2`,
        [contact.name, syncJobId],
      );
    }

    // Fetch messages for this conversation not yet in queue
    const { rows: messages } = await db.query<{
      id: string; sender_type: string; message_type: string; body: string | null;
      whatsapp_timestamp: string;
    }>(
      `SELECT id, sender_type, message_type, body, whatsapp_timestamp
       FROM messages
       WHERE conversation_id = $1 AND body IS NOT NULL
       ORDER BY whatsapp_timestamp ASC`,
      [conv.id],
    );

    for (const msg of messages) {
      if (cancelSignals.get(syncJobId)) break;

      await queues.messagesIncoming.add(
        QUEUE_NAMES.MESSAGES_INCOMING,
        {
          userId,
          conversationId: conv.id,
          messageId: msg.id,
          contactId: conv.contact_id,
          senderType: msg.sender_type as MessageSenderType,
          messageType: msg.message_type as MessageType,
          body: msg.body ?? undefined,
          whatsappTimestamp: msg.whatsapp_timestamp,
          isHistorical: true,
        },
        { removeOnComplete: { count: 500 } },
      );

      processedMessages++;
    }

    processedConversations++;

    // Snapshot counts from DB periodically (avoid per-message DB writes)
    if (processedConversations % 5 === 0) {
      // Count newly-created contacts and leads since sync started
      const { rows: [fresh] } = await db.query<{
        new_contacts: string; new_leads: string; new_insights: string
      }>(
        `SELECT
           (SELECT COUNT(*) FROM contacts
            WHERE user_id = $1 AND created_at >= (SELECT started_at FROM sync_jobs WHERE id = $2)) AS new_contacts,
           (SELECT COUNT(*) FROM contacts
            WHERE user_id = $1 AND lead_score > 0
              AND created_at >= (SELECT started_at FROM sync_jobs WHERE id = $2)) AS new_leads,
           (SELECT COUNT(*) FROM contact_insights
            WHERE user_id = $1 AND created_at >= (SELECT started_at FROM sync_jobs WHERE id = $2)) AS new_insights`,
        [userId, syncJobId],
      );
      contactsCreated = parseInt(fresh.new_contacts, 10);
      leadsGenerated = parseInt(fresh.new_leads, 10);
      insightsExtracted = parseInt(fresh.new_insights, 10);

      await db.query(
        `UPDATE sync_jobs SET
           processed_conversations = $1,
           processed_messages = $2,
           contacts_created = $3,
           leads_generated = $4,
           insights_extracted = $5,
           updated_at = NOW()
         WHERE id = $6`,
        [processedConversations, processedMessages, contactsCreated, leadsGenerated, insightsExtracted, syncJobId],
      );
    }
  }

  cancelSignals.delete(syncJobId);

  const wasCancelled = conversations.length > 0 &&
    processedConversations < conversations.length;

  await db.query(
    `UPDATE sync_jobs SET
       status = $1,
       processed_conversations = $2,
       processed_messages = $3,
       contacts_created = $4,
       leads_generated = $5,
       insights_extracted = $6,
       current_chat_name = NULL,
       completed_at = NOW(),
       updated_at = NOW()
     WHERE id = $7`,
    [
      wasCancelled ? 'cancelled' : 'completed',
      processedConversations,
      processedMessages,
      contactsCreated,
      leadsGenerated,
      insightsExtracted,
      syncJobId,
    ],
  );
}

export function cancelHistorySync(syncJobId: string): void {
  cancelSignals.set(syncJobId, true);
}
