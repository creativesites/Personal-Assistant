import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../lib/db';
import { config } from '../config';
import { authenticate } from '../plugins/authenticate';
import { MARKETING_ACCESS_OPEN_FOR_TESTING } from '../lib/marketing-access';
import { getEffectivePlanFamily } from '../lib/entitlements';

// See lib/marketing-access.ts — testing-phase override, independent of the DB value.
function resolveMarketingAccess(dbValue: string | null | undefined): string {
  return MARKETING_ACCESS_OPEN_FOR_TESTING ? 'enabled' : (dbValue ?? 'none')
}

const clerkSyncBody = z.object({
  clerkUserId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(255),
});

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateMeBody = z.object({
  mode: z.enum(['business', 'personal', 'hybrid']).optional(),
  timezone: z.string().max(100).optional(),
  // Self-service can only join/leave the waitlist — 'beta'/'enabled' is an
  // admin-granted entitlement, not something a user can set on themselves.
  marketingAccess: z.enum(['none', 'waitlisted']).optional(),
});

type UserRow = {
  id: string
  email: string
  full_name: string
  mode: string
  marketing_access: string
  is_admin: boolean
  onboarding_completed: boolean
  timezone?: string
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Called by the Next.js web app after Clerk authentication.
  // Finds or creates a Zuri user and returns a Zuri JWT.
  fastify.post('/api/auth/clerk-sync', async (request, reply) => {
    const secret = (request.headers['x-internal-secret'] as string) ?? ''
    if (config.INTERNAL_API_SECRET && secret !== config.INTERNAL_API_SECRET) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    let body: { clerkUserId: string; email: string; name: string }
    try {
      body = clerkSyncBody.parse(request.body)
    } catch (err: any) {
      fastify.log.error({ err }, 'clerk-sync: invalid request body')
      return reply.code(400).send({ error: 'Invalid request body', detail: err.message })
    }

    const { clerkUserId, email, name } = body

    try {
      let { rows: [user] } = await db.query<UserRow>(
        'SELECT id, email, full_name, COALESCE(mode, \'business\') AS mode, COALESCE(marketing_access, \'none\') AS marketing_access, is_admin, onboarding_completed FROM users WHERE clerk_user_id = $1',
        [clerkUserId],
      )

      if (!user) {
        const { rows: [existing] } = await db.query<UserRow>(
          'SELECT id, email, full_name, COALESCE(mode, \'business\') AS mode, COALESCE(marketing_access, \'none\') AS marketing_access, is_admin, onboarding_completed FROM users WHERE email = $1',
          [email],
        )

        if (existing) {
          await db.query('UPDATE users SET clerk_user_id = $1, updated_at = NOW() WHERE id = $2', [clerkUserId, existing.id])
          user = existing
        } else {
          const { rows: [created] } = await db.query<UserRow>(
            `INSERT INTO users (email, full_name, clerk_user_id)
             VALUES ($1, $2, $3)
             RETURNING id, email, full_name, COALESCE(mode, 'hybrid') AS mode, COALESCE(marketing_access, 'none') AS marketing_access, is_admin, onboarding_completed`,
            [email, name || 'User', clerkUserId],
          )
          await Promise.all([
            // Membership Platform Phase 1 (docs/MEMBERSHIP_PLATFORM_PLAN.md
            // §3) — a 7-day trial on the 'free' plan row, with
            // current_period_end actually set (previously only
            // trial_ends_at was written, so the lifecycle worker's
            // `current_period_end < NOW()` check never fired and trials
            // never expired). The four daily counters are granted at
            // 999999 directly here rather than from the free plan's real
            // small caps — "all Premium features for 7 days" — the
            // lifecycle worker's daily reset (Phase 4) knows to keep
            // regranting 999999 while status='trialing' and only falls
            // back to the free plan's real caps once the trial ends.
            db.query(
              `INSERT INTO subscriptions (
                 user_id, plan, status, trial_ends_at, current_period_start, current_period_end,
                 plan_id, billing_period, messages_remaining_today, ai_replies_remaining_today,
                 nudges_remaining_today, documents_remaining_today, credits_reset_at
               )
               SELECT $1, 'pro', 'trialing', NOW() + INTERVAL '7 days', NOW(), NOW() + INTERVAL '7 days',
                 p.id, p.billing_period, 999999, 999999, 999999, 999999,
                 NOW() + INTERVAL '24 hours'
               FROM subscription_plans p WHERE p.key = 'free'
               ON CONFLICT (user_id) DO NOTHING`,
              [created.id],
            ),
            db.query(
              `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, 'trial_started', '{}'::jsonb)`,
              [created.id],
            ),
            db.query('INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [created.id]),
            db.query(
              `INSERT INTO calendars (user_id, name, is_default) VALUES ($1, 'My Calendar', true) ON CONFLICT DO NOTHING`,
              [created.id],
            ),
            // Default Assistant agent (docs/AUTO_REPLY_AGENTS_PLAN.md §2) —
            // every user has exactly one auto-reply agent from day one; the
            // Settings/Inbox auto-reply controls edit this row directly.
            db.query(
              `INSERT INTO agents
                 (user_id, name, agent_type, description, trust_level, is_active,
                  role_title, avatar_emoji, tone, is_default)
               VALUES ($1, 'Assistant', 'custom',
                 'Your default AI assistant — drafts replies for every contact not assigned to a specialised agent.',
                 'suggest', true, 'Personal Assistant', '🤝', 'friendly', true)`,
              [created.id],
            ),
          ])
          user = created
        }
      }

      const token = fastify.jwt.sign(
        { userId: user.id, isAdmin: user.is_admin ?? false },
        { expiresIn: '30d' },
      )

      // Membership Platform Phase 6 — planFamily on the session payload so
      // the frontend can gate (FeatureGate) without a round-trip per page.
      const planFamily = await getEffectivePlanFamily(user.id)

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          mode: user.mode ?? 'hybrid',
          marketingAccess: resolveMarketingAccess(user.marketing_access),
          isAdmin: user.is_admin ?? false,
          onboardingCompleted: user.onboarding_completed,
          planFamily,
        },
      })
    } catch (err: any) {
      fastify.log.error({ err, clerkUserId, email }, 'clerk-sync: database error')
      return reply.code(500).send({
        error: 'Sync failed',
        detail: err.message,
        code: err.code,
      })
    }
  })

  fastify.post('/api/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body);

    const { rows: [existing] } = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [body.email]
    );

    if (existing) {
      return reply.code(409).send({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const { rows: [user] } = await db.query<{ id: string; email: string; full_name: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name`,
      [body.email, passwordHash, body.fullName]
    );

    await Promise.all([
      db.query(
        `INSERT INTO subscriptions (
           user_id, plan, status, trial_ends_at, current_period_start, current_period_end,
           plan_id, billing_period, messages_remaining_today, ai_replies_remaining_today,
           nudges_remaining_today, documents_remaining_today, credits_reset_at
         )
         SELECT $1, 'pro', 'trialing', NOW() + INTERVAL '7 days', NOW(), NOW() + INTERVAL '7 days',
           p.id, p.billing_period, 999999, 999999, 999999, 999999,
           NOW() + INTERVAL '24 hours'
         FROM subscription_plans p WHERE p.key = 'free'`,
        [user.id],
      ),
      db.query(
        `INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, 'trial_started', '{}'::jsonb)`,
        [user.id],
      ),
      db.query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [user.id]),
      db.query(
        `INSERT INTO calendars (user_id, name, is_default) VALUES ($1, 'My Calendar', true)`,
        [user.id],
      ),
      db.query(
        `INSERT INTO agents
           (user_id, name, agent_type, description, trust_level, is_active,
            role_title, avatar_emoji, tone, is_default)
         VALUES ($1, 'Assistant', 'custom',
           'Your default AI assistant — drafts replies for every contact not assigned to a specialised agent.',
           'suggest', true, 'Personal Assistant', '🤝', 'friendly', true)`,
        [user.id],
      ),
    ]);

    const token = fastify.jwt.sign({ userId: user.id }, { expiresIn: '30d' });

    return reply.code(201).send({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);

    const { rows: [user] } = await db.query<{
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
    }>(
      'SELECT id, email, password_hash, full_name FROM users WHERE email = $1',
      [body.email]
    );

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ userId: user.id }, { expiresIn: '30d' });

    return reply.send({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
  });

  fastify.post(
    '/api/auth/onboarding-complete',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      await db.query(
        'UPDATE users SET onboarding_completed = true, updated_at = NOW() WHERE id = $1',
        [userId],
      );
      return reply.send({ ok: true });
    },
  );

  fastify.get(
    '/api/auth/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [user] } = await db.query<{
        id: string;
        email: string;
        full_name: string;
        timezone: string;
        mode: string;
        marketing_access: string;
        onboarding_completed: boolean;
      }>(
        `SELECT id, email, full_name, timezone, COALESCE(mode, 'hybrid') AS mode,
                COALESCE(marketing_access, 'none') AS marketing_access, onboarding_completed
         FROM users WHERE id = $1`,
        [userId]
      );

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          timezone: user.timezone,
          mode: user.mode,
          marketingAccess: resolveMarketingAccess(user.marketing_access),
          onboardingCompleted: user.onboarding_completed,
        },
      });
    }
  );

  fastify.patch(
    '/api/users/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof updateMeBody>
      try {
        body = updateMeBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message })
      }

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (body.mode !== undefined) {
        updates.push(`mode = $${idx++}`)
        values.push(body.mode)
      }
      if (body.timezone !== undefined) {
        updates.push(`timezone = $${idx++}`)
        values.push(body.timezone)
      }
      if (body.marketingAccess !== undefined) {
        updates.push(`marketing_access = $${idx++}`)
        values.push(body.marketingAccess)
        if (body.marketingAccess === 'waitlisted') {
          updates.push('marketing_waitlisted_at = NOW()')
        }
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' })
      }

      updates.push('updated_at = NOW()')
      values.push(userId)

      const { rows: [user] } = await db.query<{
        id: string
        email: string
        full_name: string
        mode: string
        marketing_access: string
        timezone: string
        onboarding_completed: boolean
      }>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, email, full_name, mode, marketing_access, timezone, onboarding_completed`,
        values,
      )

      if (!user) {
        return reply.code(404).send({ error: 'User not found' })
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          mode: user.mode,
          marketingAccess: resolveMarketingAccess(user.marketing_access),
          timezone: user.timezone,
          onboardingCompleted: user.onboarding_completed,
        },
      })
    },
  )

  fastify.get(
    '/api/users/me/stats',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [stats] } = await db.query<{
        total_contacts: string
        total_messages: string
        total_suggestions: string
      }>(
        `SELECT
           (SELECT COUNT(*) FROM contacts WHERE user_id = $1) AS total_contacts,
           (SELECT COUNT(*) FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.user_id = $1) AS total_messages,
           (SELECT COUNT(*) FROM suggested_replies sr
            JOIN conversations c ON sr.conversation_id = c.id
            WHERE c.user_id = $1) AS total_suggestions`,
        [userId],
      )

      return reply.send({
        stats: {
          totalContacts: parseInt(stats.total_contacts, 10),
          totalMessages: parseInt(stats.total_messages, 10),
          totalSuggestions: parseInt(stats.total_suggestions, 10),
        },
      })
    },
  )
}
