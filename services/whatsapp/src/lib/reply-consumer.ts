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

const AUTOMATIC_JOBS = new Set(['auto_send', 'agent_send', 'agent_auto_send', 'compose_auto_send']);

/** A human pause between consecutive messages of one reply (typing time). */
function typingPause(text: string): Promise<void> {
  const ms = Math.min(6000, 1200 + text.length * 35 + Math.random() * 800);
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
        parts,
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

      // Multi-part reply (reply engine v2). An edit replaces it with one message.
      let sentWaId: string | undefined;
      if (parts?.length && outgoingText === text) {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i > 0) await typingPause(part.text);
          sentWaId = await sessionManager.sendMessage(
            userId,
            recipientJid,
            part.text,
            part.quotedWaMessageId ? { quotedWaMessageId: part.quotedWaMessageId, quotedBody: part.quotedBody } : undefined,
          );
        }
      } else if (reactionEmoji !== undefined && reactionTargetWaMessageId) {
        await sessionManager.sendReaction(userId, recipientJid, reactionEmoji, reactionTargetWaMessageId, reactionFromMe ?? false);
      } else if (deleteWaMessageId) {
        await sessionManager.deleteMessage(userId, recipientJid, deleteWaMessageId, deleteFromMe ?? false);
      } else if (mediaPath && mediaMimeType && mediaFileName) {
        sentWaId = await sessionManager.sendDocument(userId, recipientJid, mediaPath, mediaMimeType, mediaFileName, text || undefined);
      } else {
        sentWaId = await sessionManager.sendMessage(
          userId,
          recipientJid,
          outgoingText,
          quotedWaMessageId ? { quotedWaMessageId, quotedBody } : undefined
        );
      }

      // A message the app inserted before sending carries a temporary id
      // ("direct-…"); swap in WhatsApp's real id so delivered/read receipts
      // (matched by id) update it instead of leaving it at "sent" forever.
      if (sentWaId && job.data.messageId) {
        await db.query(
          `UPDATE messages SET whatsapp_message_id = $2
           WHERE id = $1 AND sender_type = 'user' AND whatsapp_message_id LIKE 'direct-%'`,
          [job.data.messageId, sentWaId],
        ).catch((err) => console.warn('[reply-consumer] could not record sent id:', (err as Error).message));
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
