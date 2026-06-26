import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { authenticate } from '../plugins/authenticate';

const connectBody = z.object({
  phoneNumber: z.string().optional(),
});

export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/whatsapp/connect',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = connectBody.parse(request.body);

      const res = await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phoneNumber: body.phoneNumber }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        return reply.code(res.status).send(data);
      }

      return reply.code(202).send({
        message: 'Connection initiated. Listen for whatsapp:qr or whatsapp:link_code on your socket.',
        ...data,
      });
    }
  );

  fastify.delete(
    '/api/whatsapp/connect',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      return reply.send({ message: 'Disconnected' });
    }
  );

  fastify.get(
    '/api/whatsapp/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const res = await fetch(
        `${config.WHATSAPP_SERVICE_URL}/internal/sessions/status/${userId}`
      );
      const data = await res.json() as Record<string, unknown>;

      return reply.code(res.ok ? 200 : res.status).send(data);
    }
  );
}
