import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { whatsappRoutes } from './routes/whatsapp';

export async function buildApp() {
  const fastify = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await fastify.register(cors, {
    origin: config.NODE_ENV === 'development',
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(whatsappRoutes);

  return fastify;
}
