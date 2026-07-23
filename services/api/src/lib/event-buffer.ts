import { redis } from './redis';

export interface BufferedEvent {
  seq: number;
  event: string;
  payload: unknown;
  timestamp: string;
}

const BUFFER_TTL_SECONDS = 300; // 5 minutes
const MAX_BUFFER_SIZE = 500;

export async function bufferInboxEvent(
  userId: string,
  event: string,
  payload: unknown,
): Promise<BufferedEvent> {
  const seqKey = `events:seq:${userId}`;
  const bufferKey = `events:buffer:${userId}`;

  const seq = await redis.incr(seqKey);
  const timestamp = new Date().toISOString();

  const bufferedEvent: BufferedEvent = {
    seq,
    event,
    payload,
    timestamp,
  };

  const serialized = JSON.stringify(bufferedEvent);

  const pipeline = redis.pipeline();
  pipeline.zadd(bufferKey, seq, serialized);
  pipeline.expire(bufferKey, BUFFER_TTL_SECONDS);
  pipeline.zremrangebyrank(bufferKey, 0, -(MAX_BUFFER_SIZE + 1));
  pipeline.expire(seqKey, BUFFER_TTL_SECONDS * 2);

  await pipeline.exec().catch((err) => {
    console.error(`[event-buffer] failed to buffer event for user ${userId}:`, err);
  });

  return bufferedEvent;
}

export async function getMissedEvents(
  userId: string,
  lastSeenSeq: number,
): Promise<{ missed: BufferedEvent[]; latestSeq: number }> {
  const seqKey = `events:seq:${userId}`;
  const bufferKey = `events:buffer:${userId}`;

  const currentSeqRaw = await redis.get(seqKey);
  const latestSeq = currentSeqRaw ? parseInt(currentSeqRaw, 10) : 0;

  if (lastSeenSeq === undefined || lastSeenSeq === null || lastSeenSeq < 0) {
    return { missed: [], latestSeq };
  }

  const rawItems = await redis.zrangebyscore(bufferKey, `(${lastSeenSeq}`, '+inf');

  const missed: BufferedEvent[] = [];
  for (const item of rawItems) {
    try {
      const parsed = JSON.parse(item) as BufferedEvent;
      missed.push(parsed);
    } catch {
      // ignore corrupt item
    }
  }

  return { missed, latestSeq };
}
