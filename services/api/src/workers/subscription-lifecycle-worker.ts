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
      await sendExpiryReminders(log)
      await endExpiredTrials(log)
      await enterGracePeriod(log)
      await sendGracePeriodLastDayWarning(log)
      await enterReadOnly(log)
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

type LifecycleRow = { id: string; user_id: string; plan_name: string }

async function insertNotification(userId: string, title: string, body: string): Promise<void> {
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'billing', $2, $3)`,
    [userId, title, body],
  )
}

async function insertLifecycleEvent(userId: string, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await db.query(
    `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3::jsonb)`,
    [userId, eventType, JSON.stringify(metadata)],
  )
}

// "Never surprise the user" — 7/3/1-day reminders before current_period_end
// for anything still active/trialing. Deduped per (user, threshold, exact
// period-end timestamp) via subscription_events so a plan change that shifts
// current_period_end naturally re-arms the reminders instead of skipping them.
async function sendExpiryReminders(log: FastifyBaseLogger): Promise<void> {
  const { rows } = await db.query<{ id: string; user_id: string; current_period_end: string; plan_name: string }>(
    `SELECT s.id, s.user_id, s.current_period_end, p.name AS plan_name
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.status IN ('active', 'trialing')
       AND s.current_period_end IS NOT NULL
       AND s.current_period_end > NOW()
       AND s.current_period_end <= NOW() + INTERVAL '7 days'`,
  )
  let sent = 0
  for (const row of rows) {
    const daysLeft = Math.ceil((new Date(row.current_period_end).getTime() - Date.now()) / 86_400_000)
    if (![7, 3, 1].includes(daysLeft)) continue

    const eventType = `expiry_reminder_${daysLeft}d`
    const { rows: [existing] } = await db.query(
      `SELECT 1 FROM subscription_events WHERE user_id = $1 AND event_type = $2 AND metadata->>'periodEnd' = $3`,
      [row.user_id, eventType, row.current_period_end],
    )
    if (existing) continue

    await insertLifecycleEvent(row.user_id, eventType, { periodEnd: row.current_period_end })
    await insertNotification(
      row.user_id,
      `Your ${row.plan_name} plan expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
      'Renew now so you never lose access to your Premium features.',
    )
    sent++
  }
  if (sent) log.info({ count: sent }, 'subscription_expiry_reminders_sent')
}

// trialing -> active, once the 7-day trial's current_period_end has passed.
// A still-'trialing' row is by definition still on the 'free' plan_id (the
// moment admin-payments.ts approves an upgrade mid-trial it sets both
// status='active' and the new plan_id directly) — so this is reverting to
// the real Free tier, not a lapsed paid subscription. Free never needs a
// grace period or read-only mode; it's already the permanent floor.
async function endExpiredTrials(log: FastifyBaseLogger): Promise<void> {
  const { rows } = await db.query<LifecycleRow>(
    `UPDATE subscriptions s SET
       status = 'active', current_period_end = NULL, current_period_start = NULL, updated_at = NOW()
     FROM subscription_plans p
     WHERE s.plan_id = p.id AND s.status = 'trialing'
       AND s.current_period_end IS NOT NULL AND s.current_period_end < NOW()
     RETURNING s.id, s.user_id, p.name AS plan_name`,
  )
  for (const row of rows) {
    await insertLifecycleEvent(row.user_id, 'trial_ended')
    await insertNotification(
      row.user_id,
      'Your 7-day trial has ended',
      "You're now on the Free plan. Upgrade any time to unlock unlimited AI replies, documents, and more.",
    )
  }
  if (rows.length) log.info({ count: rows.length }, 'trials_ended')
}

// active -> grace_period, once a paid plan's current_period_end has passed.
// Full feature access continues through grace_period — only entering
// read_only (below) triggers the Entitlement Engine's mutation guard.
async function enterGracePeriod(log: FastifyBaseLogger): Promise<void> {
  const { rows } = await db.query<LifecycleRow>(
    `UPDATE subscriptions s SET
       status = 'grace_period',
       grace_period_ends_at = s.current_period_end + (p.grace_period_days || ' days')::interval,
       updated_at = NOW()
     FROM subscription_plans p
     WHERE s.plan_id = p.id AND s.status = 'active' AND p.key != 'free'
       AND s.current_period_end IS NOT NULL AND s.current_period_end < NOW()
     RETURNING s.id, s.user_id, p.name AS plan_name`,
  )
  for (const row of rows) {
    await insertLifecycleEvent(row.user_id, 'entered_grace_period')
    await insertNotification(
      row.user_id,
      `Your ${row.plan_name} plan has expired`,
      "You're in a grace period — everything still works. Renew now, or your account switches to read-only once it ends.",
    )
  }
  if (rows.length) log.info({ count: rows.length }, 'subscriptions_entered_grace_period')
}

// One warning on the last day of the grace period — deduped by a 2-day
// event-recency window rather than an exact-timestamp match, since
// grace_period_ends_at doesn't move once set (unlike current_period_end,
// which a plan change can shift).
async function sendGracePeriodLastDayWarning(log: FastifyBaseLogger): Promise<void> {
  const { rows } = await db.query<{ user_id: string; plan_name: string }>(
    `SELECT s.user_id, p.name AS plan_name
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.status = 'grace_period' AND s.grace_period_ends_at IS NOT NULL
       AND s.grace_period_ends_at > NOW() AND s.grace_period_ends_at <= NOW() + INTERVAL '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM subscription_events e
         WHERE e.user_id = s.user_id AND e.event_type = 'grace_period_last_day_warning'
           AND e.created_at > NOW() - INTERVAL '2 days'
       )`,
  )
  for (const row of rows) {
    await insertLifecycleEvent(row.user_id, 'grace_period_last_day_warning')
    await insertNotification(
      row.user_id,
      'Last day to renew before read-only mode',
      `Your ${row.plan_name} grace period ends today. Renew now to keep creating and generating — your data is always safe either way.`,
    )
  }
  if (rows.length) log.info({ count: rows.length }, 'subscription_grace_period_last_day_warnings_sent')
}

// grace_period -> read_only, once grace_period_ends_at has passed. This is
// the one transition the Entitlement Engine's global mutation guard
// (services/api/src/lib/entitlements.ts) actually checks — nothing is ever
// deleted, and every view/search/export endpoint keeps working.
async function enterReadOnly(log: FastifyBaseLogger): Promise<void> {
  const { rows } = await db.query<LifecycleRow>(
    `UPDATE subscriptions s SET status = 'read_only', updated_at = NOW()
     FROM subscription_plans p
     WHERE s.plan_id = p.id AND s.status = 'grace_period'
       AND s.grace_period_ends_at IS NOT NULL AND s.grace_period_ends_at < NOW()
     RETURNING s.id, s.user_id, p.name AS plan_name`,
  )
  for (const row of rows) {
    await insertLifecycleEvent(row.user_id, 'entered_read_only')
    await insertNotification(
      row.user_id,
      'Your account is now in read-only mode',
      "Your data is completely safe — view, search, and export still work. Renew to resume creating and generating.",
    )
  }
  if (rows.length) log.info({ count: rows.length }, 'subscriptions_entered_read_only')
}
