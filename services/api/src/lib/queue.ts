import { Queue, type JobsOptions } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '@zuri/types';
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
  reconciliationVerifyChat: new Queue(QUEUE_NAMES.RECONCILIATION_VERIFY_CHAT, { connection }),
};

const queueByName = new Map<string, Queue>(
  Object.values(queues).map((q) => [q.name, q]),
);

export async function addToQueue(name: QueueName, data: any, opts?: JobsOptions): Promise<void> {
  const queue = queueByName.get(name);
  if (!queue) throw new Error(`Unknown queue: ${name}`);

  const defaultJobId = data?.messageId
    ? `msg_${data.messageId}`
    : data?.id
    ? `${name}_${data.id}`
    : undefined;

  const combinedOpts: JobsOptions = {
    jobId: opts?.jobId ?? defaultJobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    ...opts,
  };

  await queue.add(name, data, combinedOpts);
}
