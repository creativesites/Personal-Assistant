import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { sessionRoutes } from './routes/sessions';
import type { SessionManager } from './lib/session-manager';

export async function buildApp(sessionManager: SessionManager) {
  const fastify = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await fastify.register(cors, { origin: false });

  await fastify.register(healthRoutes);
  await fastify.register(sessionRoutes(sessionManager));

  return fastify;
}
