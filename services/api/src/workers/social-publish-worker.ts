import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'
import { publishToPlatform } from '../lib/social-publish'

const POLL_INTERVAL_MS = 60_000

type DuePost = {
  id: string
  caption: string
  image_url: string | null
  platform: string
  platform_account_id: string | null
  access_token: string | null
}

// Plain poll-every-minute loop, not a BullMQ repeatable job — this codebase
// deliberately avoids BullMQ `repeat` (see services/intelligence/app/workers/
// daily_worker.py) in favor of a simple sleep-then-check loop, so this
// mirrors that same house style on the Node side.
export function startSocialPublishWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false

  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await processDuePosts(log)
    } catch (err) {
      log.error({ err }, 'social_publish_worker_tick_failed')
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

async function processDuePosts(log: FastifyBaseLogger): Promise<void> {
  const { rows: due } = await db.query<{ id: string }>(
    `SELECT id FROM social_posts WHERE status = 'scheduled' AND scheduled_at <= NOW()`,
  )
  if (due.length === 0) return

  for (const { id } of due) {
    await publishOne(id, log)
  }
}

async function publishOne(id: string, log: FastifyBaseLogger): Promise<void> {
  // Claim the post first so a slow publish call can't be picked up by the
  // next tick and sent twice.
  const { rowCount } = await db.query(
    `UPDATE social_posts SET status = 'sending', updated_at = NOW() WHERE id = $1 AND status = 'scheduled'`,
    [id],
  )
  if (!rowCount) return

  const { rows: [post] } = await db.query<DuePost>(
    `SELECT sp.id, sp.caption, sp.image_url, sa.platform, sa.platform_account_id, sa.access_token
     FROM social_posts sp
     JOIN social_accounts sa ON sa.id = sp.social_account_id
     WHERE sp.id = $1`,
    [id],
  )
  if (!post) return

  const result = await publishToPlatform(
    { platform: post.platform, platform_account_id: post.platform_account_id, access_token: post.access_token },
    { caption: post.caption, image_url: post.image_url },
  )

  if (result.ok) {
    await db.query(
      `UPDATE social_posts SET status = 'sent', sent_at = NOW(), platform_post_id = $1, updated_at = NOW() WHERE id = $2`,
      [result.platformPostId, id],
    )
    log.info({ postId: id, platformPostId: result.platformPostId }, 'social_post_published')
  } else {
    await db.query(
      `UPDATE social_posts SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [result.error, id],
    )
    log.warn({ postId: id, error: result.error }, 'social_post_publish_failed')
  }
}
