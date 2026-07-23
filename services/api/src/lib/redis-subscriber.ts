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
    'suggestion:ready:*',
    'suggestion:failed:*',
    'byok:error:*',
    'history:progress:*',
    'history:sync:trigger:*',
    'presence:update:*',
    'message:status:update:*',
    'notification:new:*',
    // docs/AUTO_REPLY_AGENTS_PLAN.md §5 — Settings, the Inbox widget, and the
    // agent detail page all edit the same Default Assistant row; this keeps
    // them in sync without a manual refresh.
    'agent:default-updated:*',
    // Business OS Phase E (docs/BUSINESS_OS_PLAN.md §15) — a detected
    // multi-action bundle proposal, pushed live to the Inbox.
    'bundle:ready:*',
    // Advisor Companion Plan Phase 4 (docs/ADVISOR_COMPANION_PLAN.md
    // §5.4/§9) — a watched conversation got a reply; reply_received fires
    // immediately, narration_ready follows once the narration + suggested
    // replies are generated.
    'advisor.reply_received:*',
    'advisor.narration_ready:*',
    // Zuri Reality Engine (docs/REALITY_ENGINE_PLAN.md §7) — a nudge got
    // auto-resolved because reality caught up with it (a reply was sent,
    // an invoice was created); lets the Proactive dock drop the row live.
    'reality.resolved:*',
    // Career OS Living Companion redesign — job_discovery.py's restructured
    // per-pass loop publishes live progress here as a run proceeds, same
    // dual DB-row + Redis pattern history:progress:* already established.
    'career.job_discovery.progress:*',
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

    // channel format: "event_type:userId"  e.g. "whatsapp:qr:abc-123" (a
    // multi-segment event type) or "reality.resolved:abc-123" (a single
    // dotted segment — only one colon). Either shape needs at least 2 parts
    // once split; a 2-part channel like the latter was previously dropped
    // here entirely (guard required 3), which silently broke every
    // single-colon channel (reality.resolved, advisor.reply_received,
    // advisor.narration_ready, career.job_discovery.progress) despite each
    // being documented as already wired end-to-end.
    const parts = channel.split(':');
    if (parts.length < 2) return;

    const userId = parts[parts.length - 1];
    // event = everything except the last segment
    const eventType = parts.slice(0, parts.length - 1).join(':');

    io.to(`user:${userId}`).emit(eventType, payload);
  });

  redisSub.on('error', (err) => console.error('Redis subscriber error:', err));
}
