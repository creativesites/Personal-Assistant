import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@zuri/types';
import type { SendReplyJob } from '@zuri/types';
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

const AUTOMATIC_JOBS = new Set(['auto_send', 'agent_send', 'agent_auto_send']);

export function startReplyConsumer(
  sessionManager: SessionManager,
  db: Pool,
  redisUrl: string
): Worker {
  return new Worker<SendReplyJob>(
    QUEUE_NAMES.SEND_REPLY,
    async (job) => {
      const {
        userId,
        recipientJid,
        text,
        suggestedReplyId,
        mediaPath,
        mediaMimeType,
        mediaFileName,
        quotedWaMessageId,
        quotedBody,
        reactionEmoji,
        reactionTargetWaMessageId,
        reactionFromMe,
        deleteWaMessageId,
        deleteFromMe,
      } = job.data;

      // Automatic replies wait a few seconds before sending. If the user has
      // answered the chat themselves since the message being replied to,
      // drop the automatic reply instead of double-replying.
      if (AUTOMATIC_JOBS.has(job.name) && job.data.messageId) {
        const { rows: [row] } = await db.query<{ answered: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM messages src
             JOIN messages later ON later.conversation_id = src.conversation_id
             WHERE src.id = $1
               AND later.sender_type = 'user'
               AND later.whatsapp_timestamp > src.whatsapp_timestamp
               AND later.created_at > NOW() - INTERVAL '1 day'
           ) AS answered`,
          [job.data.messageId],
        );
        if (row?.answered) {
          if (suggestedReplyId) {
            await db.query(
              `UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW() WHERE id = $1`,
              [suggestedReplyId],
            );
          }
          console.log(`[reply-consumer] skipped ${job.name} for message ${job.data.messageId}: user already replied`);
          return;
        }
      }

      if (reactionEmoji !== undefined && reactionTargetWaMessageId) {
        await sessionManager.sendReaction(userId, recipientJid, reactionEmoji, reactionTargetWaMessageId, reactionFromMe ?? false);
      } else if (deleteWaMessageId) {
        await sessionManager.deleteMessage(userId, recipientJid, deleteWaMessageId, deleteFromMe ?? false);
      } else if (mediaPath && mediaMimeType && mediaFileName) {
        await sessionManager.sendDocument(userId, recipientJid, mediaPath, mediaMimeType, mediaFileName, text || undefined);
      } else {
        await sessionManager.sendMessage(
          userId,
          recipientJid,
          text,
          quotedWaMessageId ? { quotedWaMessageId, quotedBody } : undefined
        );
      }

      if (suggestedReplyId) {
        await db.query(
          `UPDATE suggested_replies
           SET status = CASE WHEN edited_text IS NOT NULL THEN 'edited_and_sent' ELSE 'sent' END,
               sent_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [suggestedReplyId]
        );
      }
    },
    { connection: parseRedisUrl(redisUrl) }
  );
}
