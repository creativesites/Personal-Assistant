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
  clerkOrgId: z.string().nullable().optional(),
  orgRole: z.string().nullable().optional(),
  orgSlug: z.string().nullable().optional(),
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
  is_company_managed: boolean
  current_organization_id: string | null
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

    let body: z.infer<typeof clerkSyncBody>
    try {
      body = clerkSyncBody.parse(request.body)
    } catch (err: any) {
      fastify.log.error({ err }, 'clerk-sync: invalid request body')
      return reply.code(400).send({ error: 'Invalid request body', detail: err.message })
    }

    const { clerkUserId, email, name, clerkOrgId, orgRole, orgSlug } = body

    try {
      let { rows: [user] } = await db.query<UserRow>(
        `SELECT id, email, full_name, COALESCE(mode, 'business') AS mode,
                COALESCE(marketing_access, 'none') AS marketing_access,
                is_admin, onboarding_completed,
                COALESCE(is_company_managed, false) AS is_company_managed,
                current_organization_id
         FROM users WHERE clerk_user_id = $1`,
        [clerkUserId],
      )

      if (!user) {
        const { rows: [existing] } = await db.query<UserRow>(
          `SELECT id, email, full_name, COALESCE(mode, 'business') AS mode,
                  COALESCE(marketing_access, 'none') AS marketing_access,
                  is_admin, onboarding_completed,
                  COALESCE(is_company_managed, false) AS is_company_managed,
                  current_organization_id
           FROM users WHERE email = $1`,
          [email],
        )

        if (existing) {
          await db.query('UPDATE users SET clerk_user_id = $1, updated_at = NOW() WHERE id = $2', [clerkUserId, existing.id])
          user = existing
        } else {
          const { rows: [created] } = await db.query<UserRow>(
            `INSERT INTO users (email, full_name, clerk_user_id)
             VALUES ($1, $2, $3)
             RETURNING id, email, full_name, COALESCE(mode, 'hybrid') AS mode,
                       COALESCE(marketing_access, 'none') AS marketing_access,
                       is_admin, onboarding_completed, false AS is_company_managed, NULL AS current_organization_id`,
            [email, name || 'User', clerkUserId],
          )
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

      // Organization Sync Logic
      let orgDetails: { id: string; clerkOrgId: string; name: string; role: string } | null = null

      if (clerkOrgId) {
        // Upsert organization
        const orgName = orgSlug ? orgSlug.replace(/[-_]/g, ' ').toUpperCase() : 'Company Workspace'
        const { rows: [org] } = await db.query<{ id: string; name: string; clerk_org_id: string }>(
          `INSERT INTO organizations (clerk_org_id, name, slug, owner_user_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (clerk_org_id) DO UPDATE SET
             slug = COALESCE(EXCLUDED.slug, organizations.slug),
             updated_at = NOW()
           RETURNING id, name, clerk_org_id`,
          [clerkOrgId, orgName, orgSlug ?? null, user.id],
        )

        // Standardize Clerk role strings (org:admin -> admin, org:member -> member, etc.)
        let normalizedRole = 'member'
        if (orgRole) {
          if (orgRole.includes('admin') || orgRole.includes('owner')) normalizedRole = 'admin'
          else if (orgRole.includes('viewer')) normalizedRole = 'viewer'
        }

        // Upsert membership
        await db.query(
          `INSERT INTO organization_members (organization_id, user_id, role, status)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (organization_id, user_id) DO UPDATE SET
             role = EXCLUDED.role,
             status = 'active',
             updated_at = NOW()`,
          [org.id, user.id, normalizedRole],
        )

        // Lock user mode to business and mark as company-managed
        await db.query(
          `UPDATE users SET current_organization_id = $1, is_company_managed = true, mode = 'business', updated_at = NOW() WHERE id = $2`,
          [org.id, user.id],
        )

        user.mode = 'business'
        user.is_company_managed = true
        user.current_organization_id = org.id
        orgDetails = { id: org.id, clerkOrgId: org.clerk_org_id, name: org.name, role: normalizedRole }
      } else {
        // Check if user is a member of ANY active company org in Zuri DB
        const { rows: [activeMem] } = await db.query<{
          organization_id: string
          role: string
          org_name: string
          clerk_org_id: string
        }>(
          `SELECT om.organization_id, om.role, o.name AS org_name, o.clerk_org_id
           FROM organization_members om
           JOIN organizations o ON om.organization_id = o.id
           WHERE om.user_id = $1 AND om.status = 'active'
           LIMIT 1`,
          [user.id],
        )

        if (activeMem) {
          await db.query(
            `UPDATE users SET current_organization_id = $1, is_company_managed = true, mode = 'business', updated_at = NOW() WHERE id = $2`,
            [activeMem.organization_id, user.id],
          )
          user.mode = 'business'
          user.is_company_managed = true
          user.current_organization_id = activeMem.organization_id
          orgDetails = { id: activeMem.organization_id, clerkOrgId: activeMem.clerk_org_id, name: activeMem.org_name, role: activeMem.role }
        } else if (user.is_company_managed) {
          // No active org membership remaining -> unlock company management constraint
          await db.query(
            `UPDATE users SET current_organization_id = NULL, is_company_managed = false, updated_at = NOW() WHERE id = $1`,
            [user.id],
          )
          user.is_company_managed = false
          user.current_organization_id = null
        }
      }

      const token = fastify.jwt.sign(
        { userId: user.id, isAdmin: user.is_admin ?? false, orgId: user.current_organization_id },
        { expiresIn: '30d' },
      )

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
          isCompanyManaged: user.is_company_managed,
          organization: orgDetails,
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

      const bodySchema = z.object({
        mode: z.enum(['business', 'personal', 'hybrid']).optional(),
        identityRole: z.string().optional(),
        businessName: z.string().optional(),
        businessDescription: z.string().optional(),
        industry: z.string().optional(),
        primaryGoal: z.string().optional(),
      });

      let body: z.infer<typeof bodySchema> = {};
      try {
        if (request.body && typeof request.body === 'object') {
          body = bodySchema.parse(request.body);
        }
      } catch {
        // Fallback gracefully if empty body or invalid fields
      }

      // 1. Update user record (mode and onboarding_completed)
      const updates = ['onboarding_completed = true', 'updated_at = NOW()'];
      const values: any[] = [];
      let paramIdx = 1;

      if (body.mode) {
        updates.push(`mode = $${paramIdx++}`);
        values.push(body.mode);
      }

      values.push(userId);
      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values,
      );

      // 2. Persist to business_profiles (upsert default profile)
      if (body.businessName || body.businessDescription || body.industry) {
        const { rows: [existingProfile] } = await db.query(
          `SELECT id FROM business_profiles WHERE user_id = $1 AND is_default = true`,
          [userId],
        );

        if (existingProfile) {
          await db.query(
            `UPDATE business_profiles
             SET company_name = COALESCE($1, company_name),
                 industry = COALESCE($2, industry),
                 footer_text = COALESCE($3, footer_text),
                 updated_at = NOW()
             WHERE id = $4`,
            [body.businessName || null, body.industry || null, body.businessDescription || null, existingProfile.id],
          );
        } else {
          await db.query(
            `INSERT INTO business_profiles (user_id, company_name, industry, footer_text, is_default)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT DO NOTHING`,
            [userId, body.businessName || 'My Business', body.industry || null, body.businessDescription || null],
          );
        }
      }

      // 3. Seed business_facts for the AI intelligence engine
      const factSeeds: { category: string; key: string; value: string }[] = [];
      if (body.businessName) {
        factSeeds.push({ category: 'general_info', key: 'company_name', value: body.businessName });
      }
      if (body.businessDescription) {
        factSeeds.push({ category: 'general_info', key: 'business_description', value: body.businessDescription });
      }
      if (body.industry) {
        factSeeds.push({ category: 'general_info', key: 'industry', value: body.industry });
      }
      if (body.identityRole) {
        factSeeds.push({ category: 'general_info', key: 'user_role', value: body.identityRole });
      }
      if (body.primaryGoal) {
        factSeeds.push({ category: 'company_values', key: 'primary_goal', value: body.primaryGoal });
      }

      for (const seed of factSeeds) {
        await db.query(
          `INSERT INTO business_facts (user_id, category, fact_key, fact_value, confidence, source, is_approved, approved_at)
           VALUES ($1, $2, $3, $4, 1.0, 'onboarding', true, NOW())
           ON CONFLICT DO NOTHING`,
          [userId, seed.category, seed.key, seed.value],
        ).catch(() => {});
      }

      // 4. Personalize default AI assistant agent
      if (body.identityRole || body.businessName) {
        const agentTitle = body.identityRole ? `${body.identityRole.replace('_', ' ').toUpperCase()} Assistant` : 'Personal Assistant';
        const desc = body.businessName
          ? `Tailored assistant for ${body.businessName} — helps manage conversations, follow-ups, and customer relations.`
          : 'Your default AI assistant — drafts replies and handles messages.';

        await db.query(
          `UPDATE agents
           SET role_title = $1, description = $2, updated_at = NOW()
           WHERE user_id = $3 AND is_default = true`,
          [agentTitle, desc, userId],
        ).catch(() => {});
      }

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
        is_company_managed: boolean;
        current_organization_id: string | null;
      }>(
        `SELECT id, email, full_name, timezone, COALESCE(mode, 'hybrid') AS mode,
                COALESCE(marketing_access, 'none') AS marketing_access, onboarding_completed,
                COALESCE(is_company_managed, false) AS is_company_managed,
                current_organization_id
         FROM users WHERE id = $1`,
        [userId]
      );

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      let orgDetails = null
      if (user.current_organization_id) {
        const { rows: [org] } = await db.query<{ id: string; clerk_org_id: string; name: string; role: string }>(
          `SELECT o.id, o.clerk_org_id, o.name, om.role
           FROM organizations o
           JOIN organization_members om ON om.organization_id = o.id
           WHERE o.id = $1 AND om.user_id = $2 AND om.status = 'active'`,
          [user.current_organization_id, userId],
        )
        if (org) {
          orgDetails = { id: org.id, clerkOrgId: org.clerk_org_id, name: org.name, role: org.role }
        }
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
          isCompanyManaged: user.is_company_managed,
          organization: orgDetails,
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

      // Verify company governance restriction
      const { rows: [currentUser] } = await db.query<{ is_company_managed: boolean }>(
        `SELECT COALESCE(is_company_managed, false) AS is_company_managed FROM users WHERE id = $1`,
        [userId],
      )

      if (currentUser?.is_company_managed && body.mode && body.mode !== 'business') {
        return reply.code(403).send({
          error: 'Your account is managed by your company organization. Workspace mode is locked to business.',
        })
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
        is_company_managed: boolean
      }>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, email, full_name, mode, marketing_access, timezone, onboarding_completed, COALESCE(is_company_managed, false) AS is_company_managed`,
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

      try {
        const { rows } = await db.query<{
          total_contacts: string
          total_messages: string
          total_suggestions: string
        }>(
          `SELECT
             (SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND archived_at IS NULL) AS total_contacts,
             (SELECT COUNT(*) FROM messages m
              JOIN conversations c ON m.conversation_id = c.id
              WHERE c.user_id = $1) AS total_messages,
             ((SELECT COUNT(*) FROM message_analyses ma
               JOIN messages m ON ma.message_id = m.id
               JOIN conversations c ON m.conversation_id = c.id
               WHERE c.user_id = $1) +
              (SELECT COUNT(*) FROM suggested_replies sr
               JOIN conversations c ON sr.conversation_id = c.id
               WHERE c.user_id = $1) +
              (SELECT COUNT(*) FROM documents WHERE user_id = $1) +
              (SELECT COUNT(*) FROM opportunities WHERE user_id = $1)) AS total_suggestions`,
          [userId],
        )

        const stats = rows[0]

        return reply.send({
          stats: {
            totalContacts: parseInt(stats?.total_contacts || '0', 10),
            totalMessages: parseInt(stats?.total_messages || '0', 10),
            totalSuggestions: parseInt(stats?.total_suggestions || '0', 10),
          },
        })
      } catch (err: any) {
        fastify.log.error({ err }, 'users/me/stats: DB query failed')
        return reply.send({
          stats: {
            totalContacts: 0,
            totalMessages: 0,
            totalSuggestions: 0,
          },
        })
      }
    },
  )
}
