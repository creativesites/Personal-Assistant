import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { healthRoutes } from './routes/health';

export async function buildApp() {
  const fastify = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await fastify.register(cors, { origin: false });

  await fastify.register(healthRoutes);

  return fastify;
}
