import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
import { knowledgeRoutes } from './routes/knowledge';
import { businessFactsRoutes } from './routes/business-facts';
import { memoryRoutes } from './routes/memory';
import { productsRoutes } from './routes/products';
import { advisorRoutes } from './routes/advisor';
import { contentGenerationsRoutes } from './routes/content-generations';
import { socialAccountsRoutes } from './routes/social-accounts';
import { socialPostsRoutes } from './routes/social-posts';
import { dealsRoutes } from './routes/deals';
import { opportunitiesRoutes } from './routes/opportunities';
import { connectionsRoutes } from './routes/connections';
import { relationshipsRoutes } from './routes/relationships';
import { goalsRoutes } from './routes/goals';
import { diagnosticsRoutes } from './routes/diagnostics';
import { businessProfileRoutes } from './routes/business-profile';
import { documentsRoutes } from './routes/documents';
import { recurringDocumentsRoutes } from './routes/recurring-documents';
import { suppliersRoutes } from './routes/suppliers';
import { studioRoutes } from './routes/studio';
import { productFamiliesRoutes } from './routes/product-families';
import { purchaseOrdersRoutes } from './routes/purchase-orders';
import { inventoryLocationsRoutes } from './routes/inventory-locations';
import { actionBundlesRoutes } from './routes/action-bundles';
import { projectsRoutes } from './routes/projects';
import { goalProfilesRoutes } from './routes/goal-profiles';
import { reflectionRoutes } from './routes/reflection';
import { predictionsRoutes } from './routes/predictions';
import { subscriptionPlansRoutes } from './routes/subscription-plans';
import { adminPaymentsRoutes } from './routes/admin-payments';
import { servicesRoutes } from './routes/services';

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

  await fastify.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
    },
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
  await fastify.register(knowledgeRoutes);
  await fastify.register(businessFactsRoutes);
  await fastify.register(memoryRoutes);
  await fastify.register(productsRoutes);
  await fastify.register(advisorRoutes);
  await fastify.register(contentGenerationsRoutes);
  await fastify.register(socialAccountsRoutes);
  await fastify.register(socialPostsRoutes);
  await fastify.register(dealsRoutes);
  await fastify.register(opportunitiesRoutes);
  await fastify.register(connectionsRoutes);
  await fastify.register(relationshipsRoutes);
  await fastify.register(goalsRoutes);
  await fastify.register(diagnosticsRoutes);
  await fastify.register(businessProfileRoutes);
  await fastify.register(documentsRoutes);
  await fastify.register(recurringDocumentsRoutes);
  await fastify.register(suppliersRoutes);
  await fastify.register(studioRoutes);
  await fastify.register(productFamiliesRoutes);
  await fastify.register(purchaseOrdersRoutes);
  await fastify.register(inventoryLocationsRoutes);
  await fastify.register(actionBundlesRoutes);
  await fastify.register(projectsRoutes);
  await fastify.register(goalProfilesRoutes);
  await fastify.register(reflectionRoutes);
  await fastify.register(predictionsRoutes);
  await fastify.register(subscriptionPlansRoutes);
  await fastify.register(adminPaymentsRoutes);
  await fastify.register(servicesRoutes);

  return fastify;
}
