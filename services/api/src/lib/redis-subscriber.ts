import Redis from 'ioredis';
import type { Server } from 'socket.io';
import { config } from '../config';

// Separate connection — ioredis enters subscriber mode after subscribe/psubscribe
// and cannot issue regular commands in that state
export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

const WA_EVENTS = [
  'whatsapp:qr',
  'whatsapp:link_code',
  'whatsapp:connected',
  'whatsapp:disconnected',
  'whatsapp:error',
  'message:new',
] as const;

export function startRedisSubscriber(io: Server): void {
  redisSub.psubscribe('whatsapp:*', 'message:new:*', (err) => {
    if (err) console.error('Redis psubscribe error:', err);
  });

  redisSub.on('pmessage', (_pattern: string, channel: string, payload: string) => {
    // channel format: "event_type:userId"  e.g. "whatsapp:qr:abc-123"
    const parts = channel.split(':');
    if (parts.length < 3) return;

    const userId = parts[parts.length - 1];
    // event = everything except the last segment
    const eventType = parts.slice(0, parts.length - 1).join(':') as typeof WA_EVENTS[number];

    io.to(`user:${userId}`).emit(eventType, payload);
  });

  redisSub.on('error', (err) => console.error('Redis subscriber error:', err));
}
