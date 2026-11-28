/**
 * Daily keep-warm nudges (Networking). Runs once a day at 06:00 Lusaka
 * (04:00 UTC), checked every 10 minutes so a restart doesn't skip a day.
 */
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'
import { ownersWithWarmLists, runNudgesFor } from '../lib/network-nudges'

const CHECK_MS = 10 * 60_000
const RUN_HOUR_UTC = 4

export function startNetworkNudgeWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false
  const tick = async () => {
    if (running || stopped || new Date().getUTCHours() < RUN_HOUR_UTC) return
    running = true
    try {
      for (const ownerId of await ownersWithWarmLists()) {
        if (stopped) break
        // Once per owner per day: claim today's run first.
        const { rows: [claimed] } = await db.query(
          `INSERT INTO network_runs (user_id, run_date) VALUES ($1, CURRENT_DATE)
           ON CONFLICT DO NOTHING RETURNING user_id`, [ownerId])
        if (!claimed) continue
        const made = await runNudgesFor(ownerId)
        await db.query(`UPDATE network_runs SET made = $2 WHERE user_id = $1 AND run_date = CURRENT_DATE`, [ownerId, made])
        log.info({ ownerId, made }, 'network_nudges_run')
      }
    } catch (err) {
      log.error({ err }, 'network_nudge_worker_failed')
    } finally {
      running = false
    }
  }
  const interval = setInterval(tick, CHECK_MS)
  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
    },
  }
}
