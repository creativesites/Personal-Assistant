import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SessionManager } from '../lib/session-manager';

const connectBody = z.object({
  userId: z.string().uuid(),
  phoneNumber: z.string().optional(),
});

const sendBody = z.object({
  jid: z.string(),
  text: z.string().min(1),
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

      await sessionManager.startSession(body.userId, body.phoneNumber);

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
  };
}
