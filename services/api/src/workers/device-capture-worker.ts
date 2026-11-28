/**
 * Settles phone captures (mobile plan G5): every minute, captures that have
 * waited out WAIT_MS are matched one last time and otherwise created; every
 * five minutes, device-created rows that Baileys has since delivered are
 * retired. See lib/device-captures.ts.
 */
import type { FastifyBaseLogger } from 'fastify'
import { pendingDue, reconcile, retireDuplicates } from '../lib/device-captures'

const TICK_MS = 60_000
const RETIRE_EVERY = 5

export function startDeviceCaptureWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false
  let ticks = 0
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      const due = await pendingDue()
      const counts: Record<string, number> = {}
      for (const c of due) {
        if (stopped) break
        const r = await reconcile(c, true)
        counts[r.status] = (counts[r.status] ?? 0) + 1
      }
      if (due.length) log.info({ counts }, 'device_captures_settled')
      if (++ticks % RETIRE_EVERY === 0) {
        const retired = await retireDuplicates()
        if (retired) log.info({ retired }, 'device_captures_retired')
      }
    } catch (err) {
      log.error({ err }, 'device_capture_worker_failed')
    } finally {
      running = false
    }
  }
  const interval = setInterval(tick, TICK_MS)
  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
    },
  }
}
