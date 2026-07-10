import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const

const connectBody = z.object({
  platform: z.enum(PLATFORMS),
  accountName: z.string().min(1).max(255),
})

type SocialAccountRow = {
  id: string
  platform: string
  account_name: string | null
  status: string
  created_at: string
}

function toApiShape(a: SocialAccountRow) {
  return {
    id: a.id,
    platform: a.platform,
    accountName: a.account_name,
    status: a.status,
    createdAt: a.created_at,
  }
}

export async function socialAccountsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/social-accounts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<SocialAccountRow>(
        `SELECT id, platform, account_name, status, created_at
         FROM social_accounts
         WHERE user_id = $1 AND status = 'connected'
         ORDER BY created_at DESC`,
        [userId],
      )

      return reply.send({ accounts: rows.map(toApiShape) })
    },
  )

  // No Meta/TikTok developer app is configured yet (FACEBOOK_APP_ID etc. are
  // absent from every .env.example in this repo), so a real OAuth
  // authorize-redirect-callback dance can't be wired or tested end to end.
  // This creates a "connected" row directly so the rest of the pipeline
  // (picking an account when scheduling a post, the publish worker) is real
  // and testable today. Swap this for a real OAuth callback handler once
  // Meta app credentials exist — see docs/ZURI_MARKETING_EXPANSION.md §7/§12.
  fastify.post(
    '/api/social-accounts',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = connectBody.parse(request.body)

      const { rows: [account] } = await db.query<SocialAccountRow>(
        `INSERT INTO social_accounts (user_id, platform, account_name, status)
         VALUES ($1, $2, $3, 'connected')
         RETURNING id, platform, account_name, status, created_at`,
        [userId, body.platform, body.accountName],
      )

      return reply.code(201).send({ account: toApiShape(account) })
    },
  )

  fastify.delete(
    '/api/social-accounts/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE social_accounts SET status = 'revoked', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Account not found' })

      return reply.send({ ok: true })
    },
  )
}
