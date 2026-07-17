import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'

const POLL_INTERVAL_MS = 60_000

// Plain poll-every-minute loop, matching recurring-documents-worker.ts's
// house style — deliberately not a Python daily_worker.py addition, see
// docs/PRICING_PAYMENTS_PLAN.md §8/§10 item 6. A lazy per-row 24h rollover
// (checking each subscription's own credits_reset_at) rather than a single
// "everyone at midnight" job, sidestepping the BullMQ-Python repeatable-job
// bug and the multi-replica double-fire risk daily_worker.py's own
// comments flag for this exact category of job.
export function startSubscriptionLifecycleWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false

  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await resetDueCredits(log)
      await expireEndedSubscriptions(log)
    } catch (err) {
      log.error({ err }, 'subscription_lifecycle_worker_tick_failed')
    } finally {
      running = false
    }
  }

  const interval = setInterval(tick, POLL_INTERVAL_MS)
  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
    },
  }
}

async function resetDueCredits(log: FastifyBaseLogger): Promise<void> {
  // Membership Platform Phase 1 — while status='trialing', regrant 999999
  // on every counter regardless of the underlying plan's own per-day caps
  // ("all Premium features for 7 days"); auth.ts's signup insert grants
  // this once immediately, this keeps regranting it every 24h until the
  // trial itself ends (expireEndedSubscriptions below), at which point the
  // row naturally falls back to whatever plan_id it's on (free, if never
  // upgraded). Also resets documents_remaining_today, the 4th counter
  // added this phase alongside messages/ai_replies/nudges.
  const { rowCount } = await db.query(
    `UPDATE subscriptions s SET
       messages_remaining_today = CASE WHEN s.status = 'trialing' THEN 999999 ELSE p.messages_per_day END,
       ai_replies_remaining_today = CASE WHEN s.status = 'trialing' THEN 999999 ELSE p.ai_replies_per_day END,
       nudges_remaining_today = CASE WHEN s.status = 'trialing' THEN 999999 ELSE p.proactive_nudges_per_day END,
       documents_remaining_today = CASE WHEN s.status = 'trialing' THEN 999999 ELSE p.documents_per_day END,
       credits_reset_at = NOW() + INTERVAL '24 hours'
     FROM subscription_plans p
     WHERE s.plan_id = p.id AND s.credits_reset_at <= NOW() AND s.status IN ('active', 'trialing')`,
  )
  if (rowCount) log.info({ count: rowCount }, 'subscription_credits_reset')
}

async function expireEndedSubscriptions(log: FastifyBaseLogger): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
     WHERE status IN ('active', 'trialing') AND current_period_end IS NOT NULL AND current_period_end < NOW()`,
  )
  if (rowCount) log.info({ count: rowCount }, 'subscriptions_expired')
}
