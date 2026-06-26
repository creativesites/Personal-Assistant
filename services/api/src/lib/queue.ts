import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@zuri/types';
import { config } from '../config';

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}

const connection = parseRedisUrl(config.REDIS_URL);

export const queues = {
  messagesIncoming: new Queue(QUEUE_NAMES.MESSAGES_INCOMING, { connection }),
  analysisMessage: new Queue(QUEUE_NAMES.ANALYSIS_MESSAGE, { connection }),
  analysisContactProfile: new Queue(QUEUE_NAMES.ANALYSIS_CONTACT_PROFILE, { connection }),
  proactiveGenerateDaily: new Queue(QUEUE_NAMES.PROACTIVE_GENERATE_DAILY, { connection }),
  sendReply: new Queue(QUEUE_NAMES.SEND_REPLY, { connection }),
};
