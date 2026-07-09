import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from './db'

// Shared gate for every Zuri Marketing route (products, content generation,
// social accounts/posts) — none of it is reachable until an account is
// rolled into beta. See docs/ZURI_MARKETING_EXPANSION.md §12.3.
export async function requireMarketingAccess(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = request.user as { userId: string }
  const { rows: [user] } = await db.query<{ marketing_access: string }>(
    `SELECT COALESCE(marketing_access, 'none') AS marketing_access FROM users WHERE id = $1`,
    [userId],
  )
  if (!user || !['beta', 'enabled'].includes(user.marketing_access)) {
    return reply.code(403).send({ error: 'Zuri Marketing is not enabled for this account yet' })
  }
}
