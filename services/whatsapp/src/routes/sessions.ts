import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SessionManager } from '../lib/session-manager';

const connectBody = z.object({
  userId: z.string().uuid(),
  phoneNumber: z.string().optional(),
  forceNewQR: z.boolean().optional(),
});

const sendBody = z.object({
  jid: z.string(),
  text: z.string().min(1),
});

const catalogCreateBody = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
  retailerId: z.string().optional(),
});

const userIdParam = z.object({
  userId: z.string().uuid(),
});

export function sessionRoutes(sessionManager: SessionManager) {
  return async function routes(fastify: FastifyInstance) {
    fastify.post('/internal/sessions/connect', async (request, reply) => {
      const body = connectBody.parse(request.body);

      if (sessionManager.status(body.userId) === 'connected') {
        return reply.code(409).send({ error: 'Session already active' });
      }

      // Normalize phone number — digits only, no + or spaces
      const phoneNumber = body.phoneNumber ? body.phoneNumber.replace(/\D/g, '') : undefined;
      // User-initiated connects always force a fresh QR by default; restoreAll() does not.
      const forceNewQR = body.forceNewQR ?? true;
      await sessionManager.startSession(body.userId, phoneNumber, forceNewQR);

      return reply.code(202).send({
        message: 'Connection started. Listen for whatsapp:qr or whatsapp:link_code events.',
        userId: body.userId,
      });
    });

    fastify.post('/internal/sessions/disconnect', async (request, reply) => {
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.body);
      await sessionManager.disconnect(userId);
      return reply.send({ message: 'Disconnected', userId });
    });

    fastify.get('/internal/sessions/status/:userId', async (request, reply) => {
      const { userId } = userIdParam.parse(request.params);
      const status = sessionManager.status(userId);
      return reply.send({ userId, status, activeCount: sessionManager.activeCount() });
    });

    fastify.post('/internal/sessions/:userId/send', async (request, reply) => {
      const { userId } = userIdParam.parse(request.params);
      const { jid, text } = sendBody.parse(request.body);
      await sessionManager.sendMessage(userId, jid, text);
      return reply.send({ sent: true });
    });

    fastify.get('/session/:userId/profile-picture/:jid', async (request, reply) => {
      const { userId, jid } = request.params as { userId: string; jid: string };
      try {
        const avatarUrl = await sessionManager.fetchProfilePicture(userId, decodeURIComponent(jid));
        return reply.send({ userId, jid, avatarUrl });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    });

    fastify.get('/internal/sessions/:userId/catalog/products', async (request, reply) => {
      const { userId } = userIdParam.parse(request.params);
      const { limit, cursor } = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).parse(request.query);
      try {
        const catalog = await sessionManager.listCatalogProducts(userId, limit, cursor);
        return reply.send(catalog);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    });

    fastify.post('/internal/sessions/:userId/catalog/products', async (request, reply) => {
      const { userId } = userIdParam.parse(request.params);
      const body = catalogCreateBody.parse(request.body);
      try {
        const product = await sessionManager.createCatalogProduct(userId, body);
        return reply.code(201).send({ product });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    });

    fastify.post('/internal/sessions/request-link-code', async (request, reply) => {
      const { userId, phoneNumber } = z.object({
        userId: z.string().uuid(),
        phoneNumber: z.string().min(7),
      }).parse(request.body);

      try {
        const code = await sessionManager.requestLinkCode(userId, phoneNumber);
        return reply.send({ code });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    });


  };
}
