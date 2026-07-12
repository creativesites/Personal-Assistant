import Redis from 'ioredis';
import type { Server } from 'socket.io';
import { config } from '../config';
import { startHistorySync } from './history-sync';

// Separate connection — ioredis enters subscriber mode after subscribe/psubscribe
// and cannot issue regular commands in that state
export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export function startRedisSubscriber(io: Server): void {
  redisSub.psubscribe(
    'whatsapp:*',
    'message:new:*',
    'conversation:*',
    'suggestion:ready:*',
    'history:progress:*',
    'history:sync:trigger:*',
    (err) => {
      if (err) console.error('Redis psubscribe error:', err);
    },
  );

  redisSub.on('pmessage', async (_pattern: string, channel: string, payload: string) => {
    // Handle history sync trigger separately — it's internal, not a Socket.io broadcast
    if (channel.startsWith('history:sync:trigger:')) {
      const userId = channel.replace('history:sync:trigger:', '');
      console.log(`[redis-subscriber] caught history:sync:trigger for user ${userId}, triggering startHistorySync`);
      try {
        const jobId = await startHistorySync(userId);
        console.log(`[redis-subscriber] history sync started for user ${userId}, jobId=${jobId}`);
      } catch (err) {
        console.error(`[redis-subscriber] failed to start history sync for user ${userId}:`, err);
      }
      return;
    }

    // channel format: "event_type:userId"  e.g. "whatsapp:qr:abc-123"
    const parts = channel.split(':');
    if (parts.length < 3) return;

    const userId = parts[parts.length - 1];
    // event = everything except the last segment
    const eventType = parts.slice(0, parts.length - 1).join(':');

    io.to(`user:${userId}`).emit(eventType, payload);
  });

  redisSub.on('error', (err) => console.error('Redis subscriber error:', err));
}
