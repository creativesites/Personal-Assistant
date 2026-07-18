import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'
import { config } from '../config'

const gate = [authenticate, requireFeature('job_search')]

// Job Search OS's Core Discovery Loop (docs/CV_STUDIO_PLAN.md §15) already
// runs once a day for every opted-in user via a fixed 05:00 UTC cron
// (job_discovery.py's JobDiscoveryService.run_for_all_users, wired in
// daily_worker.py/main.py). This adds a user-initiated "Fetch Jobs Now"
// button on top of that — capped at 3 *successful* manual runs per day per
// user, so a user isn't stuck waiting for the next cron tick but also can't
// spend unbounded AI/search-tool budget by mashing the button. A run that
// errors (search planner failure, intelligence service unreachable) doesn't
// count against the cap, since it found nothing and cost the user nothing.
const DAILY_MANUAL_RUN_CAP = 3

async function countTodaysSuccessfulRuns(userId: string): Promise<number> {
  const { rows: [row] } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM career_job_discovery_manual_runs
     WHERE user_id = $1 AND success = TRUE AND created_at >= date_trunc('day', NOW())`,
    [userId],
  )
  return parseInt(row.count, 10)
}

export async function careerJobDiscoveryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/job-discovery/status', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const usedToday = await countTodaysSuccessfulRuns(userId)
    return reply.send({
      cap: DAILY_MANUAL_RUN_CAP,
      usedToday,
      remaining: Math.max(0, DAILY_MANUAL_RUN_CAP - usedToday),
    })
  })

  fastify.post('/api/career/job-discovery/run', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const usedToday = await countTodaysSuccessfulRuns(userId)
    if (usedToday >= DAILY_MANUAL_RUN_CAP) {
      return reply.code(429).send({
        error: `You've used all ${DAILY_MANUAL_RUN_CAP} manual job searches for today. Try again tomorrow, or wait for tonight's automatic search.`,
        cap: DAILY_MANUAL_RUN_CAP,
        usedToday,
        remaining: 0,
      })
    }

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
    // Kick off a background scrape so the pool is as fresh as possible before
    // the discovery run scores it — fire-and-forget, don't wait for it.
    fetch(`${intelligenceUrl}/internal/career/job-scraper/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {})  // never block on scrape failure

    try {
      const res = await fetch(`${intelligenceUrl}/internal/career/job-discovery/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) {
        const errText = await res.text()
        await db.query(
          `INSERT INTO career_job_discovery_manual_runs (user_id, success, error_message)
           VALUES ($1, FALSE, $2)`,
          [userId, errText.slice(0, 500) || `Intelligence service returned ${res.status}`],
        )
        return reply.code(502).send({ error: 'Job search failed. Please try again shortly.' })
      }

      const data = await res.json() as { opportunitiesFound: number }
      await db.query(
        `INSERT INTO career_job_discovery_manual_runs (user_id, success, opportunities_found)
         VALUES ($1, TRUE, $2)`,
        [userId, data.opportunitiesFound ?? 0],
      )
      const remaining = Math.max(0, DAILY_MANUAL_RUN_CAP - (usedToday + 1))
      return reply.send({ opportunitiesFound: data.opportunitiesFound ?? 0, remaining, cap: DAILY_MANUAL_RUN_CAP })
    } catch (err) {
      await db.query(
        `INSERT INTO career_job_discovery_manual_runs (user_id, success, error_message)
         VALUES ($1, FALSE, $2)`,
        [userId, err instanceof Error ? err.message.slice(0, 500) : 'Unknown error'],
      )
      return reply.code(502).send({ error: 'Job search failed. Please try again shortly.' })
    }
  })

  // Browseable pool of scraped jobs — not personalised, just the raw pool
  // filtered/sorted for the current user's preferred roles/industries.
  fastify.get('/api/career/scraped-jobs', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const query = request.query as { source?: string; search?: string; limit?: string; offset?: string }
    const limit = Math.min(50, parseInt(query.limit ?? '20', 10))
    const offset = parseInt(query.offset ?? '0', 10)

    // Fetch user's target roles/industries to surface relevant jobs first
    const { rows: [profile] } = await db.query<{ target_roles: string[]; target_industries: string[] }>(
      'SELECT target_roles, target_industries FROM career_profiles WHERE user_id = $1',
      [userId],
    )
    const terms = [
      ...(profile?.target_roles ?? []),
      ...(profile?.target_industries ?? []),
    ].map(t => t.toLowerCase())

    const params: unknown[] = [new Date(Date.now())]
    const conditions: string[] = ['sj.expires_at > $1']

    if (query.source) {
      params.push(query.source)
      conditions.push(`sj.source = $${params.length}`)
    }
    if (query.search) {
      params.push(`%${query.search}%`)
      const idx = params.length
      conditions.push(`(sj.title ILIKE $${idx} OR sj.company ILIKE $${idx} OR sj.description ILIKE $${idx})`)
    }

    const where = conditions.join(' AND ')

    // Sort: jobs that match the user's target roles/industries float to top
    const relevanceExpr = terms.length > 0
      ? `CASE WHEN ${terms.map((_, i) => {
          params.push(`%${terms[i]}%`)
          const idx = params.length
          return `(sj.title ILIKE $${idx} OR sj.location ILIKE $${idx})`
        }).join(' OR ')} THEN 0 ELSE 1 END`
      : '0'

    params.push(limit, offset)
    const limitIdx = params.length - 1
    const offsetIdx = params.length

    const { rows: jobs } = await db.query(
      `SELECT sj.id, sj.source, sj.source_url, sj.title, sj.company, sj.location,
              sj.job_type, sj.salary_range, sj.skills, sj.posted_at, sj.scraped_at
       FROM scraped_jobs sj
       WHERE ${where}
       ORDER BY ${relevanceExpr}, sj.scraped_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    )

    const { rows: [{ count }] } = await db.query<{ count: string }>(
      `SELECT COUNT(*) FROM scraped_jobs WHERE ${where}`,
      params.slice(0, params.length - 2),
    )

    return reply.send({ jobs, total: parseInt(count, 10), limit, offset })
  })

  // Scraper health — pool size + last run per source
  fastify.get('/api/career/scraper-status', { preHandler: gate }, async (request, reply) => {
    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
    try {
      const res = await fetch(`${intelligenceUrl}/internal/career/job-scraper/status`)
      if (!res.ok) return reply.code(502).send({ error: 'Could not reach intelligence service' })
      const data = await res.json()
      return reply.send(data)
    } catch {
      return reply.code(502).send({ error: 'Could not reach intelligence service' })
    }
  })
}
