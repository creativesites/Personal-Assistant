import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { whatsappRoutes } from './routes/whatsapp';
import { conversationsRoutes } from './routes/conversations';
import { contactsRoutes } from './routes/contacts';
import { proactiveRoutes } from './routes/proactive';
import { suggestionsRoutes } from './routes/suggestions';
import { companionRoutes } from './routes/companion';
import { adminRoutes } from './routes/admin';
import { agentRoutes } from './routes/agents';
import { analyticsRoutes } from './routes/analytics';
import { teamRoutes } from './routes/team';
import { broadcastsRoutes } from './routes/broadcasts';
import { enterpriseRoutes } from './routes/enterprise';
import { mediaRoutes } from './routes/media';
import { leadsRoutes } from './routes/leads';
import { settingsRoutes } from './routes/settings';
import { calendarRoutes } from './routes/calendar';

export async function buildApp() {
  const fastify = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  const corsOrigin: string | string[] | boolean =
    config.NODE_ENV === 'development'
      ? true
      : config.CORS_ORIGIN
        ? config.CORS_ORIGIN.split(',').map((o) => o.trim())
        : true;

  await fastify.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(whatsappRoutes);
  await fastify.register(conversationsRoutes);
  await fastify.register(contactsRoutes);
  await fastify.register(proactiveRoutes);
  await fastify.register(suggestionsRoutes);
  await fastify.register(companionRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(agentRoutes);
  await fastify.register(analyticsRoutes);
  await fastify.register(teamRoutes);
  await fastify.register(broadcastsRoutes);
  await fastify.register(enterpriseRoutes);
  await fastify.register(mediaRoutes);
  await fastify.register(leadsRoutes);
  await fastify.register(settingsRoutes);
  await fastify.register(calendarRoutes);

  return fastify;
}
