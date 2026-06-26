import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { redis } from '../lib/redis';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_req, reply) => {
    const checks: {
      status: string;
      timestamp: string;
      services: Record<string, string>;
    } = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    try {
      const client = await db.connect();
      await client.query('SELECT 1');
      client.release();
      checks.services.database = 'ok';
    } catch {
      checks.services.database = 'error';
      checks.status = 'degraded';
    }

    try {
      await redis.ping();
      checks.services.redis = 'ok';
    } catch {
      checks.services.redis = 'error';
      checks.status = 'degraded';
    }

    const statusCode = checks.status === 'ok' ? 200 : 503;
    return reply.code(statusCode).send(checks);
  });
}
