import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { queues } from '../lib/queue'
import { authenticate } from '../plugins/authenticate'
import { authenticateAdmin } from '../plugins/authenticateAdmin'
import { startHistorySync, cancelHistorySync } from '../lib/history-sync'

const patchUserBody = z.object({
  suspend: z.boolean().optional(),
  plan: z.enum(['free', 'pro', 'business']).optional(),
  isAdmin: z.boolean().optional(),
})

const patchFeaturesBody = z.object({
  flags: z.record(z.boolean()),
})

type AdminUserRow = {
  id: string
  email: string
  full_name: string | null
  mode: string
  is_admin: boolean
  onboarding_completed: boolean
  suspended: boolean
  created_at: string
  last_active_at: string | null
  plan: string
  wa_status: string | null
  wa_phone: string | null
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Setup (public check, authenticated claim) ────────────────────────────

  fastify.get('/api/admin/setup-status', async (_request, reply) => {
    const { rows: [row] } = await db.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM users WHERE is_admin = true',
    )
    return reply.send({ hasAdmin: parseInt(row.count, 10) > 0 })
  })

  fastify.post(
    '/api/admin/setup',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId, isAdmin } = request.user as { userId: string; isAdmin?: boolean }

      if (isAdmin) {
        return reply.code(409).send({ error: 'You are already an admin' })
      }

      const { rows: [existing] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM users WHERE is_admin = true',
      )
      if (parseInt(existing.count, 10) > 0) {
        return reply.code(409).send({ error: 'An admin account already exists' })
      }

      await db.query(
        'UPDATE users SET is_admin = true, updated_at = NOW() WHERE id = $1',
        [userId],
      )

      // Return a new token with isAdmin: true
      const newToken = fastify.jwt.sign({ userId, isAdmin: true }, { expiresIn: '30d' })
      return reply.send({ ok: true, token: newToken })
    },
  )

  // ─── System stats ─────────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/stats',
    { preHandler: authenticateAdmin },
    async (_request, reply) => {
      const { rows: [stats] } = await db.query<{
        total_users: string
        new_today: string
        active_sessions: string
        error_sessions: string
        total_messages_today: string
        total_messages: string
        pro_users: string
        business_users: string
      }>(`
        SELECT
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '1 day') AS new_today,
          (SELECT COUNT(*) FROM whatsapp_instances WHERE status = 'connected') AS active_sessions,
          (SELECT COUNT(*) FROM whatsapp_instances WHERE status IN ('error', 'disconnected')) AS error_sessions,
          (SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '1 day') AS total_messages_today,
          (SELECT COUNT(*) FROM messages) AS total_messages,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'pro' AND status IN ('active', 'trialing')) AS pro_users,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'business' AND status IN ('active', 'trialing')) AS business_users
      `)

      let queueDepth = 0
      let queueFailed = 0
      try {
        const counts = await Promise.all(
          Object.values(queues).map(async (q) => {
            const [waiting, failed] = await Promise.all([q.getWaitingCount(), q.getFailedCount()])
            return { waiting, failed }
          }),
        )
        queueDepth = counts.reduce((s, c) => s + c.waiting, 0)
        queueFailed = counts.reduce((s, c) => s + c.failed, 0)
      } catch {
        // Redis might not be available in all environments
      }

      return reply.send({
        users: {
          total: parseInt(stats.total_users, 10),
          newToday: parseInt(stats.new_today, 10),
          pro: parseInt(stats.pro_users, 10),
          business: parseInt(stats.business_users, 10),
        },
        sessions: {
          active: parseInt(stats.active_sessions, 10),
          errors: parseInt(stats.error_sessions, 10),
        },
        messages: {
          today: parseInt(stats.total_messages_today, 10),
          total: parseInt(stats.total_messages, 10),
        },
        queues: { depth: queueDepth, failed: queueFailed },
      })
    },
  )

  // ─── User management ──────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/users',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const query = (request.query as Record<string, string>)
      const page = Math.max(1, parseInt(query.page ?? '1', 10))
      const pageSize = 20
      const search = query.search ?? ''
      const offset = (page - 1) * pageSize

      const searchClause = search
        ? `WHERE u.email ILIKE $3 OR u.full_name ILIKE $3`
        : ''
      const searchParam = search ? `%${search}%` : undefined
      const params: (string | number)[] = [pageSize, offset, ...(searchParam ? [searchParam] : [])]

      const { rows: users } = await db.query<AdminUserRow>(
        `SELECT
           u.id, u.email, u.full_name, COALESCE(u.mode, 'business') AS mode,
           u.is_admin, u.onboarding_completed,
           COALESCE(u.suspended, false) AS suspended,
           u.created_at, u.updated_at AS last_active_at,
           COALESCE(s.plan, 'free') AS plan,
           wi.status AS wa_status, wi.phone_number AS wa_phone
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active', 'trialing')
         LEFT JOIN whatsapp_instances wi ON wi.user_id = u.id
         ${searchClause}
         ORDER BY u.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      )

      const { rows: [{ count }] } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users u ${searchClause}`,
        searchParam ? [searchParam] : [],
      )

      return reply.send({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.full_name,
          mode: u.mode,
          isAdmin: u.is_admin,
          onboardingCompleted: u.onboarding_completed,
          suspended: u.suspended,
          createdAt: u.created_at,
          plan: u.plan,
          whatsapp: { status: u.wa_status ?? 'none', phone: u.wa_phone },
        })),
        total: parseInt(count, 10),
        page,
        pageSize,
      })
    },
  )

  fastify.get(
    '/api/admin/users/:id',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const { rows: [user] } = await db.query<AdminUserRow & { timezone: string }>(
        `SELECT
           u.id, u.email, u.full_name, COALESCE(u.mode, 'business') AS mode,
           u.is_admin, u.onboarding_completed,
           COALESCE(u.suspended, false) AS suspended,
           u.created_at, u.timezone,
           COALESCE(s.plan, 'free') AS plan,
           wi.status AS wa_status, wi.phone_number AS wa_phone,
           wi.last_connected_at, wi.reconnect_count
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active', 'trialing')
         LEFT JOIN whatsapp_instances wi ON wi.user_id = u.id
         WHERE u.id = $1`,
        [id],
      )

      if (!user) return reply.code(404).send({ error: 'User not found' })

      const { rows: [msgStats] } = await db.query<{
        contacts: string; messages: string; suggestions: string
      }>(
        `SELECT
           (SELECT COUNT(*) FROM contacts WHERE user_id = $1) AS contacts,
           (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = $1) AS messages,
           (SELECT COUNT(*) FROM reply_suggestions rs JOIN conversations c ON rs.conversation_id = c.id WHERE c.user_id = $1) AS suggestions`,
        [id],
      )

      const { rows: auditLogs } = await db.query<{
        action: string; details: unknown; created_at: string
      }>(
        `SELECT action, details, created_at FROM admin_audit_log
         WHERE target_type = 'user' AND target_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [id],
      )

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          mode: user.mode,
          timezone: (user as any).timezone,
          isAdmin: user.is_admin,
          onboardingCompleted: user.onboarding_completed,
          suspended: user.suspended,
          createdAt: user.created_at,
          plan: user.plan,
          whatsapp: {
            status: user.wa_status ?? 'none',
            phone: user.wa_phone,
            lastConnectedAt: (user as any).last_connected_at,
            reconnectCount: (user as any).reconnect_count ?? 0,
          },
          stats: {
            contacts: parseInt(msgStats.contacts, 10),
            messages: parseInt(msgStats.messages, 10),
            suggestions: parseInt(msgStats.suggestions, 10),
          },
        },
        auditLog: auditLogs,
      })
    },
  )

  fastify.patch(
    '/api/admin/users/:id',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const adminUser = request.user as { userId: string }

      let body: z.infer<typeof patchUserBody>
      try {
        body = patchUserBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (body.suspend !== undefined) {
        updates.push(`suspended = $${idx++}`)
        values.push(body.suspend)
      }
      if (body.isAdmin !== undefined) {
        updates.push(`is_admin = $${idx++}`)
        values.push(body.isAdmin)
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()')
        values.push(id)
        await db.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
          values,
        )
      }

      if (body.plan !== undefined) {
        await db.query(
          `INSERT INTO subscriptions (user_id, plan, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT (user_id) DO UPDATE SET plan = $2, updated_at = NOW()`,
          [id, body.plan],
        )
      }

      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'user.update', 'user', $2, $3)`,
        [adminUser.userId, id, JSON.stringify(body)],
      )

      return reply.send({ ok: true })
    },
  )

  // ─── WhatsApp sessions ────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/sessions',
    { preHandler: authenticateAdmin },
    async (_request, reply) => {
      const { rows } = await db.query<{
        user_id: string; email: string; full_name: string | null
        status: string; phone_number: string | null
        last_connected_at: string | null; reconnect_count: number | null
        qr_expires_at: string | null; created_at: string
      }>(
        `SELECT wi.user_id, u.email, u.full_name,
           wi.status, wi.phone_number, wi.last_connected_at,
           wi.reconnect_count, wi.qr_expires_at, wi.created_at
         FROM whatsapp_instances wi
         JOIN users u ON u.id = wi.user_id
         ORDER BY wi.last_connected_at DESC NULLS LAST`,
      )

      return reply.send({
        sessions: rows.map((r) => ({
          userId: r.user_id,
          email: r.email,
          name: r.full_name,
          status: r.status,
          phone: r.phone_number,
          lastConnectedAt: r.last_connected_at,
          reconnectCount: r.reconnect_count ?? 0,
          qrExpiresAt: r.qr_expires_at,
          createdAt: r.created_at,
        })),
      })
    },
  )

  fastify.delete(
    '/api/admin/sessions/:userId',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const adminUser = request.user as { userId: string }

      await db.query(
        `UPDATE whatsapp_instances
         SET status = 'disconnected', session_data = null, updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      )

      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
         VALUES ($1, 'session.kill', 'user', $2, '{}')`,
        [adminUser.userId, userId],
      )

      return reply.send({ ok: true })
    },
  )

  // ─── Queue monitor ────────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/queues',
    { preHandler: authenticateAdmin },
    async (_request, reply) => {
      const queueStats: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {}

      for (const [name, queue] of Object.entries(queues)) {
        try {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ])
          queueStats[name] = { waiting, active, completed, failed, delayed }
        } catch {
          queueStats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
        }
      }

      return reply.send({ queues: queueStats })
    },
  )

  // ─── Feature flags ────────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/features',
    { preHandler: authenticateAdmin },
    async (_request, reply) => {
      const { rows: [row] } = await db.query<{ value: Record<string, boolean> }>(
        "SELECT value FROM system_config WHERE key = 'feature_flags'",
      )
      return reply.send({ flags: row?.value ?? {} })
    },
  )

  fastify.put(
    '/api/admin/features',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const adminUser = request.user as { userId: string }

      let body: z.infer<typeof patchFeaturesBody>
      try {
        body = patchFeaturesBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      await db.query(
        `INSERT INTO system_config (key, value, updated_by, updated_at)
         VALUES ('feature_flags', $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
        [JSON.stringify(body.flags), adminUser.userId],
      )

      await db.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, details)
         VALUES ($1, 'features.update', 'system', $2)`,
        [adminUser.userId, JSON.stringify(body.flags)],
      )

      return reply.send({ ok: true })
    },
  )

  // ─── History sync ─────────────────────────────────────────────────────────

  fastify.post(
    '/api/admin/history-sync/start',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const syncJobId = await startHistorySync(userId);
      return reply.send({ ok: true, syncJobId });
    },
  );

  fastify.get(
    '/api/admin/history-sync/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { rows: [job] } = await db.query<{
        id: string; status: string;
        total_conversations: number; processed_conversations: number;
        total_messages: number; processed_messages: number;
        contacts_created: number; leads_generated: number; insights_extracted: number;
        current_chat_name: string | null; error_message: string | null;
        started_at: string | null; completed_at: string | null;
      }>(
        `SELECT id, status, total_conversations, processed_conversations,
                total_messages, processed_messages,
                contacts_created, leads_generated, insights_extracted,
                current_chat_name, error_message, started_at, completed_at
         FROM sync_jobs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );

      if (!job) return reply.send({ status: 'never_run' });

      const pct = job.total_conversations > 0
        ? Math.round((job.processed_conversations / job.total_conversations) * 100)
        : 0;

      return reply.send({
        id: job.id,
        status: job.status,
        progress: {
          conversations: { done: job.processed_conversations, total: job.total_conversations },
          messages: { done: job.processed_messages, total: job.total_messages },
          percent: pct,
        },
        stats: {
          contactsCreated: job.contacts_created,
          leadsGenerated: job.leads_generated,
          insightsExtracted: job.insights_extracted,
        },
        currentChatName: job.current_chat_name,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      });
    },
  );

  fastify.post(
    '/api/admin/history-sync/cancel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { rows: [job] } = await db.query<{ id: string }>(
        `SELECT id FROM sync_jobs WHERE user_id = $1 AND status = 'running' LIMIT 1`,
        [userId],
      );
      if (!job) return reply.code(404).send({ error: 'No running sync' });
      cancelHistorySync(job.id);
      await db.query(
        `UPDATE sync_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [job.id],
      );
      return reply.send({ ok: true });
    },
  );

  // ─── Audit log ────────────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/logs',
    { preHandler: authenticateAdmin },
    async (request, reply) => {
      const query = (request.query as Record<string, string>)
      const limit = Math.min(100, parseInt(query.limit ?? '50', 10))

      const { rows } = await db.query<{
        id: string; action: string; target_type: string | null; target_id: string | null
        details: unknown; created_at: string
        admin_email: string; admin_name: string | null
      }>(
        `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
           u.email AS admin_email, u.full_name AS admin_name
         FROM admin_audit_log al
         JOIN users u ON u.id = al.admin_user_id
         ORDER BY al.created_at DESC
         LIMIT $1`,
        [limit],
      )

      return reply.send({
        logs: rows.map((r) => ({
          id: r.id,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          details: r.details,
          createdAt: r.created_at,
          admin: { email: r.admin_email, name: r.admin_name },
        })),
      })
    },
  )

  // ─── Billing overview ─────────────────────────────────────────────────────

  fastify.get(
    '/api/admin/billing',
    { preHandler: authenticateAdmin },
    async (_request, reply) => {
      const { rows: [stats] } = await db.query<{
        free_count: string; pro_count: string; business_count: string
        mrr_estimate: string; cancelled_this_month: string
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE plan = 'free') AS free_count,
          COUNT(*) FILTER (WHERE plan = 'pro' AND status IN ('active', 'trialing')) AS pro_count,
          COUNT(*) FILTER (WHERE plan = 'business' AND status IN ('active', 'trialing')) AS business_count,
          (COUNT(*) FILTER (WHERE plan = 'pro' AND status = 'active') * 29 +
           COUNT(*) FILTER (WHERE plan = 'business' AND status = 'active') * 99) AS mrr_estimate,
          COUNT(*) FILTER (WHERE cancel_at_period_end = true) AS cancelled_this_month
        FROM subscriptions
      `)

      const { rows: recentSubs } = await db.query<{
        user_id: string; user_email: string; user_name: string | null
        plan: string; created_at: string
      }>(
        `SELECT s.user_id, u.email AS user_email, u.full_name AS user_name,
           s.plan, s.created_at
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.plan != 'free'
         ORDER BY s.created_at DESC LIMIT 20`,
      )

      const { rows: [{ total_users }] } = await db.query<{ total_users: string }>(
        'SELECT COUNT(*) AS total_users FROM users',
      )

      const freeCount = parseInt(stats.free_count, 10)
      const proCount = parseInt(stats.pro_count, 10)
      const businessCount = parseInt(stats.business_count, 10)
      const mrr = parseInt(stats.mrr_estimate, 10) || 0

      return reply.send({
        plans: [
          { plan: 'free', count: freeCount, mrr: 0 },
          { plan: 'pro', count: proCount, mrr: proCount * 29 },
          { plan: 'business', count: businessCount, mrr: businessCount * 99 },
        ],
        totalMrr: mrr,
        totalUsers: parseInt(total_users, 10),
        recentSubscriptions: recentSubs.map((s) => ({
          userId: s.user_id,
          email: s.user_email,
          name: s.user_name,
          plan: s.plan,
          createdAt: s.created_at,
        })),
      })
    },
  )
}
