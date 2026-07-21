import { db } from './db';
import { queues } from './queue';
import { redis } from './redis';
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

  // Count what we have to process (excluding groups for high accuracy)
  const { rows: [counts] } = await db.query<{ convs: string; msgs: string }>(
    `SELECT
       COUNT(DISTINCT c.id) AS convs,
       COUNT(m.id) AS msgs
     FROM conversations c
     JOIN contacts co ON co.id = c.contact_id
     LEFT JOIN messages m ON m.conversation_id = c.id AND m.body IS NOT NULL
     WHERE c.user_id = $1 AND co.is_group = false`,
    [userId],
  );

  const { rows: [job] } = await db.query<{ id: string }>(
    `INSERT INTO sync_jobs (user_id, status, sync_phase, total_conversations, total_messages, started_at)
     VALUES ($1, 'running', 'indexing', $2, $3, NOW())
     RETURNING id`,
    [userId, parseInt(counts.convs, 10) || 0, parseInt(counts.msgs, 10) || 0],
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
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';

  // Loop sequentially over each conversation that has NOT yet been processed
  while (true) {
    if (cancelSignals.get(syncJobId)) {
      break;
    }

    // Fetch the next conversation to process (immune to reordering because we filter out processed_conversation_ids)
    const { rows: [conv] } = await db.query<{
      id: string; whatsapp_chat_id: string; contact_id: string; last_message_at: string | null
    }>(
      `SELECT c.id, c.whatsapp_chat_id, c.contact_id, c.last_message_at
       FROM conversations c
       JOIN contacts co ON co.id = c.contact_id
       JOIN sync_jobs sj ON sj.id = $1
       WHERE c.user_id = $2 
         AND co.is_group = false
         AND NOT (c.id = ANY(COALESCE(sj.processed_conversation_ids, '{}'::uuid[])))
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 1`,
      [syncJobId, userId],
    );

    // If no more conversations to process, we are finished!
    if (!conv) {
      break;
    }

    // Get current progress stats for accurate tracking
    const { rows: [jobState] } = await db.query<{
      processed_conversations: number;
      processed_messages: number;
      total_conversations: number;
    }>(
      `SELECT processed_conversations, processed_messages, total_conversations FROM sync_jobs WHERE id = $1`,
      [syncJobId],
    );

    const processedConversations = jobState?.processed_conversations || 0;
    const processedMessages = jobState?.processed_messages || 0;
    const totalConversations = jobState?.total_conversations || 0;

    // Get contact name for display
    const { rows: [contact] } = await db.query<{ name: string }>(
      `SELECT COALESCE(custom_name, display_name, phone_number, 'Unknown') AS name
       FROM contacts WHERE id = $1`,
      [conv.contact_id],
    );
    const chatName = contact?.name ?? 'Unknown';

    // Phase 1: Downloading
    await db.query(
      `UPDATE sync_jobs SET 
         current_conversation_id = $1,
         current_chat_name = $2,
         sync_phase = 'downloading',
         updated_at = NOW()
       WHERE id = $3`,
      [conv.id, chatName, syncJobId],
    );

    await redis.publish(
      `history:progress:${userId}`,
      JSON.stringify({
        jobId: syncJobId,
        status: 'running',
        phase: 'downloading',
        currentChatName: chatName,
        processedConversations,
        totalConversations,
        processedMessages,
        processed: processedConversations,
        total: totalConversations,
      }),
    ).catch(() => { /* ignore */ });

    // Fetch messages for this conversation up to 1,000 limit
    const { rows: messages } = await db.query<{ id: string }>(
      `SELECT id FROM messages
       WHERE conversation_id = $1 AND body IS NOT NULL
       ORDER BY whatsapp_timestamp ASC
       LIMIT 1000`,
      [conv.id],
    );

    if (messages.length > 0) {
      // Phase 2: Analysing
      await db.query(
        `UPDATE sync_jobs SET 
           sync_phase = 'analysing',
           updated_at = NOW()
         WHERE id = $1`,
        [syncJobId],
      );

      await redis.publish(
        `history:progress:${userId}`,
        JSON.stringify({
          jobId: syncJobId,
          status: 'running',
          phase: 'analysing',
          currentChatName: chatName,
          processedConversations,
          totalConversations,
          processedMessages,
          processed: processedConversations,
          total: totalConversations,
        }),
      ).catch(() => { /* ignore */ });

      // Run synchronous analysis call directly to Python intelligence service
      try {
        const res = await fetch(`${intelligenceUrl}/internal/conversations/${conv.id}/analyse-history-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            contact_id: conv.contact_id,
            recent_count: 1000,
          }),
        });

        if (!res.ok) {
          console.error(`[history-sync] intelligence analysis failed for conv ${conv.id}: ${res.statusText}`);
          // We can log and continue or retry, but let's log and continue to avoid blocking the whole sync on one weird chat
        }
      } catch (err) {
        console.error(`[history-sync] error calling intelligence analysis for conv ${conv.id}:`, err);
      }
    }

    // Fetch snapshot of created stats since start of sync to keep dashboards updated
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

    const contactsCreated = parseInt(fresh.new_contacts, 10) || 0;
    const leadsGenerated = parseInt(fresh.new_leads, 10) || 0;
    const insightsExtracted = parseInt(fresh.new_insights, 10) || 0;

    // Append current conversation to the processed list in a single transaction
    await db.query(
      `UPDATE sync_jobs SET
         processed_conversations = processed_conversations + 1,
         processed_messages = processed_messages + $1,
         processed_conversation_ids = array_append(COALESCE(processed_conversation_ids, '{}'::uuid[]), $2),
         contacts_created = $3,
         leads_generated = $4,
         insights_extracted = $5,
         updated_at = NOW()
       WHERE id = $6`,
      [messages.length, conv.id, contactsCreated, leadsGenerated, insightsExtracted, syncJobId],
    );
  }

  // Check if job was cancelled
  const isCancelled = !!cancelSignals.get(syncJobId);
  cancelSignals.delete(syncJobId);

  const { rows: [finalJobState] } = await db.query<{
    processed_conversations: number;
    processed_messages: number;
    contacts_created: number;
    leads_generated: number;
    insights_extracted: number;
  }>(
    `SELECT processed_conversations, processed_messages, contacts_created, leads_generated, insights_extracted 
     FROM sync_jobs WHERE id = $1`,
    [syncJobId],
  );

  const finalConvs = finalJobState?.processed_conversations || 0;
  const finalMsgs = finalJobState?.processed_messages || 0;
  const finalContacts = finalJobState?.contacts_created || 0;
  const finalLeads = finalJobState?.leads_generated || 0;
  const finalInsights = finalJobState?.insights_extracted || 0;

  await db.query(
    `UPDATE sync_jobs SET
       status = $1,
       sync_phase = $2,
       current_conversation_id = NULL,
       current_chat_name = NULL,
       completed_at = NOW(),
       updated_at = NOW()
     WHERE id = $3`,
    [
      isCancelled ? 'cancelled' : 'completed',
      isCancelled ? 'downloading' : 'complete', // revert phase back to downloading or complete
      syncJobId,
    ],
  );

  await redis.publish(
    `history:progress:${userId}`,
    JSON.stringify({
      jobId: syncJobId,
      status: isCancelled ? 'cancelled' : 'completed',
      phase: isCancelled ? 'cancelled' : 'complete',
      currentChatName: null,
      processedConversations: finalConvs,
      processedMessages: finalMsgs,
      contactsCreated: finalContacts,
      leadsGenerated: finalLeads,
      insightsExtracted: finalInsights,
    }),
  ).catch(() => { /* ignore */ });
}

export function cancelHistorySync(syncJobId: string): void {
  cancelSignals.set(syncJobId, true);
}

export async function resumeHistorySync(userId: string): Promise<string> {
  const { rows: [job] } = await db.query<{
    id: string; processed_conversations: number; processed_messages: number
  }>(
    `SELECT id, processed_conversations, processed_messages
     FROM sync_jobs
     WHERE user_id = $1
       AND (
         status IN ('failed', 'cancelled')
         OR (status = 'running' AND updated_at < NOW() - INTERVAL '5 minutes')
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (!job) throw new Error('No resumable sync job found');

  cancelSignals.delete(job.id);

  await db.query(
    `UPDATE sync_jobs SET status = 'running', completed_at = NULL, error_message = NULL, updated_at = NOW() WHERE id = $1`,
    [job.id],
  );

  runSync({ id: job.id, userId }).catch((err) => {
    console.error(`[history-sync] fatal error resuming for user ${userId}:`, err);
    db.query(
      `UPDATE sync_jobs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [String(err), job.id],
    ).catch(() => { /* ignore */ });
  });

  return job.id;
}
