import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../lib/db';
import { config } from '../config';
import { authenticate } from '../plugins/authenticate';

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

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Called by the Next.js web app after Clerk authentication.
  // Finds or creates a Zuri user and returns a Zuri JWT.
  fastify.post('/api/auth/clerk-sync', async (request, reply) => {
    const secret = (request.headers['x-internal-secret'] as string) ?? ''
    if (config.INTERNAL_API_SECRET && secret !== config.INTERNAL_API_SECRET) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const body = clerkSyncBody.parse(request.body)
    const { clerkUserId, email, name } = body

    // Find existing user by Clerk ID
    let { rows: [user] } = await db.query<{ id: string; email: string; full_name: string; onboarding_completed: boolean }>(
      'SELECT id, email, full_name, onboarding_completed FROM users WHERE clerk_user_id = $1',
      [clerkUserId],
    )

    if (!user) {
      // Fall back to email match (Clerk user signed up before this column existed)
      const { rows: [existing] } = await db.query<{ id: string; email: string; full_name: string; onboarding_completed: boolean }>(
        'SELECT id, email, full_name, onboarding_completed FROM users WHERE email = $1',
        [email],
      )

      if (existing) {
        await db.query('UPDATE users SET clerk_user_id = $1, updated_at = NOW() WHERE id = $2', [clerkUserId, existing.id])
        user = existing
      } else {
        // New Clerk user — create account
        const { rows: [created] } = await db.query<{ id: string; email: string; full_name: string; onboarding_completed: boolean }>(
          `INSERT INTO users (email, full_name, clerk_user_id)
           VALUES ($1, $2, $3)
           RETURNING id, email, full_name, onboarding_completed`,
          [email, name || 'User', clerkUserId],
        )
        await Promise.all([
          db.query('INSERT INTO subscriptions (user_id, plan) VALUES ($1, $2)', [created.id, 'free']),
          db.query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [created.id]),
          db.query(
            `INSERT INTO calendars (user_id, name, is_default) VALUES ($1, 'My Calendar', true)`,
            [created.id],
          ),
        ])
        user = created
      }
    }

    const token = fastify.jwt.sign({ userId: user.id }, { expiresIn: '30d' })

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        onboardingCompleted: user.onboarding_completed,
      },
    })
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
      db.query('INSERT INTO subscriptions (user_id, plan) VALUES ($1, $2)', [user.id, 'free']),
      db.query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [user.id]),
      db.query(
        `INSERT INTO calendars (user_id, name, is_default) VALUES ($1, 'My Calendar', true)`,
        [user.id]
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
        onboarding_completed: boolean;
      }>(
        'SELECT id, email, full_name, timezone, onboarding_completed FROM users WHERE id = $1',
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
          onboardingCompleted: user.onboarding_completed,
        },
      });
    }
  );
}
