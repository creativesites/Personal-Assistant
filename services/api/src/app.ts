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
import { businessProfilesRoutes } from './routes/business-profiles';
import { documentsRoutes } from './routes/documents';
import signaturesRoutes from './routes/signatures';
import { recurringDocumentsRoutes } from './routes/recurring-documents';
import { suppliersRoutes } from './routes/suppliers';
import { studioRoutes } from './routes/studio';
import { businessFeedRoutes } from './routes/business-feed';
import { searchRoutes } from './routes/search';
import { productFamiliesRoutes } from './routes/product-families';
import { purchaseOrdersRoutes } from './routes/purchase-orders';
import { inventoryLocationsRoutes } from './routes/inventory-locations';
import { actionBundlesRoutes } from './routes/action-bundles';
import { projectsRoutes } from './routes/projects';
import { goalProfilesRoutes } from './routes/goal-profiles';
import { careerProfileRoutes } from './routes/career-profile';
import { careerOpportunitiesRoutes } from './routes/career-opportunities';
import { careerDocumentsRoutes } from './routes/career-documents';
import { careerInterviewsRoutes } from './routes/career-interviews';
import { careerRadarRoutes } from './routes/career-radar';
import { careerJobDiscoveryRoutes } from './routes/career-job-discovery';
import { careerProfileEntriesRoutes } from './routes/career-profile-entries';
import { careerCvsRoutes } from './routes/career-cvs';
import { careerCvAssistantRoutes } from './routes/career-cv-assistant';
import { careerCvMatchingRoutes } from './routes/career-cv-matching';
import { reflectionRoutes } from './routes/reflection';
import { predictionsRoutes } from './routes/predictions';
import { subscriptionPlansRoutes } from './routes/subscription-plans';
import { adminPaymentsRoutes } from './routes/admin-payments';
import { servicesRoutes } from './routes/services';
import { notificationsRoutes } from './routes/notifications';
import { billingRoutes } from './routes/billing';
import { promotionsRoutes } from './routes/promotions';
import { adminPromotionsRoutes } from './routes/admin-promotions';
import { adminRevenueRoutes } from './routes/admin-revenue';
import { privacyRoutes } from './routes/privacy';
import { byokRoutes } from './routes/byok';
import { salesErpRoutes } from './routes/sales-erp';
import { organizationRoutes } from './routes/organization';
import { readOnlyModeGuard } from './lib/entitlements';

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

  // PDF Rendering Architecture (see CLAUDE.md) — the frontend uploads a
  // client-rendered document PDF as a raw application/pdf body (not
  // multipart, since it's already a Blob) to POST /api/documents/:id/
  // render-complete. Fastify only parses json/text by default, so this
  // content type needs its own raw-buffer parser registered once, globally.
  fastify.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // Membership Platform Phase 2 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — global
  // read-only-mode mutation guard, ahead of every route's own preHandlers.
  fastify.addHook('preHandler', readOnlyModeGuard);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(whatsappRoutes);
  await fastify.register(conversationsRoutes);
  await fastify.register(contactsRoutes);
  await fastify.register(proactiveRoutes);
  await fastify.register(suggestionsRoutes);
  await fastify.register(privacyRoutes);
  await fastify.register(companionRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(agentRoutes);
  await fastify.register(analyticsRoutes);
  await fastify.register(teamRoutes);
  await fastify.register(organizationRoutes);
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
  await fastify.register(businessProfilesRoutes);
  await fastify.register(documentsRoutes);
  await fastify.register(signaturesRoutes);
  await fastify.register(recurringDocumentsRoutes);
  await fastify.register(suppliersRoutes);
  await fastify.register(studioRoutes);
  await fastify.register(businessFeedRoutes);
  await fastify.register(searchRoutes);
  await fastify.register(productFamiliesRoutes);
  await fastify.register(purchaseOrdersRoutes);
  await fastify.register(inventoryLocationsRoutes);
  await fastify.register(actionBundlesRoutes);
  await fastify.register(projectsRoutes);
  await fastify.register(goalProfilesRoutes);
  await fastify.register(careerProfileRoutes);
  await fastify.register(careerOpportunitiesRoutes);
  await fastify.register(careerDocumentsRoutes);
  await fastify.register(careerInterviewsRoutes);
  await fastify.register(careerRadarRoutes);
  await fastify.register(careerJobDiscoveryRoutes);
  await fastify.register(careerProfileEntriesRoutes);
  await fastify.register(careerCvsRoutes);
  await fastify.register(careerCvAssistantRoutes);
  await fastify.register(careerCvMatchingRoutes);
  await fastify.register(reflectionRoutes);
  await fastify.register(predictionsRoutes);
  await fastify.register(subscriptionPlansRoutes);
  await fastify.register(adminPaymentsRoutes);
  await fastify.register(servicesRoutes);
  await fastify.register(promotionsRoutes);
  await fastify.register(adminPromotionsRoutes);
  await fastify.register(adminRevenueRoutes);
  await fastify.register(notificationsRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(byokRoutes);
  await fastify.register(salesErpRoutes);

  return fastify;
}
