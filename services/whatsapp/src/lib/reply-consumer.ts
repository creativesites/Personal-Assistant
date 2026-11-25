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

      // Automatic replies wait (seconds to minutes) before sending. Drop one
      // if, since the message it answers, the user has replied themselves or
      // a newer message in the chat already has its own automatic reply
      // queued — that newer reply was drafted with this message in context,
      // and sending both would double-reply, possibly out of order.
      // An automatic reply the user cancelled (or already handled) in the Zuri
      // panel must not go out; an edited one sends the edited text.
      let outgoingText = text;
      if (AUTOMATIC_JOBS.has(job.name) && suggestedReplyId) {
        const { rows: [sr] } = await db.query<{ status: string; edited_text: string | null }>(
          `SELECT status::text AS status, edited_text FROM suggested_replies WHERE id = $1`,
          [suggestedReplyId],
        );
        if (sr && sr.status !== 'approved') {
          console.log(`[reply-consumer] skipped ${job.name}: suggestion ${suggestedReplyId} is ${sr.status}`);
          return;
        }
        if (sr?.edited_text) outgoingText = sr.edited_text;
      }

      if (AUTOMATIC_JOBS.has(job.name) && job.data.messageId) {
        const { rows: [row] } = await db.query<{ answered: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM messages src
             JOIN messages later ON later.conversation_id = src.conversation_id
             WHERE src.id = $1
               AND later.whatsapp_timestamp > src.whatsapp_timestamp
               AND later.created_at > NOW() - INTERVAL '1 day'
               AND (
                 later.sender_type = 'user'
                 OR EXISTS (
                   SELECT 1 FROM suggested_replies sr
                   WHERE sr.message_id = later.id AND sr.status IN ('approved', 'sent')
                 )
               )
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
          console.log(`[reply-consumer] skipped ${job.name} for message ${job.data.messageId}: superseded by a later reply`);
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
          outgoingText,
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
