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

export function startReplyConsumer(
  sessionManager: SessionManager,
  db: Pool,
  redisUrl: string
): Worker {
  return new Worker<SendReplyJob>(
    QUEUE_NAMES.SEND_REPLY,
    async (job) => {
      const { userId, recipientJid, text, suggestedReplyId } = job.data;

      await sessionManager.sendMessage(userId, recipientJid, text);

      if (suggestedReplyId) {
        await db.query(
          `UPDATE suggested_replies
           SET status = 'sent', sent_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [suggestedReplyId]
        );
      }
    },
    { connection: parseRedisUrl(redisUrl) }
  );
}
