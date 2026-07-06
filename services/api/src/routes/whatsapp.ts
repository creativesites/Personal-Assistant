import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { authenticate } from '../plugins/authenticate';
import { db } from '../lib/db';
import { redis } from '../lib/redis';

const connectBody = z.object({
  phoneNumber: z.string().optional(),
});

export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/whatsapp/connect',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = connectBody.parse(request.body ?? {});

      try {
        const res = await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, phoneNumber: body.phoneNumber }),
        });

        const data = await res.json().catch(() => ({})) as Record<string, unknown>;

        if (!res.ok) {
          return reply.code(res.status).send(data);
        }

        return reply.code(202).send({ message: 'Connection initiated.', ...data });
      } catch (err: any) {
        fastify.log.error({ err }, 'whatsapp/connect: whatsapp service unreachable');
        return reply.code(503).send({ error: 'WhatsApp service unavailable', detail: err.message });
      }
    }
  );

  fastify.delete(
    '/api/whatsapp/connect',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch (err: any) {
        fastify.log.warn({ err }, 'whatsapp/disconnect: whatsapp service unreachable');
      }

      await db.query(
        `UPDATE whatsapp_instances SET status = 'disconnected', qr_code = NULL,
         link_code = NULL, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      ).catch(() => {});

      return reply.send({ message: 'Disconnected' });
    }
  );

  fastify.post(
    '/api/whatsapp/request-link-code',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { phoneNumber } = z.object({ phoneNumber: z.string().min(7) }).parse(request.body);

      try {
        const res = await fetch(`${config.WHATSAPP_SERVICE_URL}/internal/sessions/request-link-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, phoneNumber }),
        });
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) return reply.code(res.status).send(data);
        return reply.send(data);
      } catch (err: any) {
        fastify.log.error({ err }, 'whatsapp/request-link-code: whatsapp service unreachable');
        return reply.code(503).send({ error: 'WhatsApp service unavailable', detail: err.message });
      }
    }
  );

  fastify.get(
    '/api/whatsapp/service-health',
    { preHandler: authenticate },
    async (_request, reply) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${config.WHATSAPP_SERVICE_URL}/health`, { signal: controller.signal });
        clearTimeout(timer);
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        return reply.send({ reachable: true, httpStatus: res.status, ...body });
      } catch (err: any) {
        const isTimeout = err.name === 'AbortError';
        return reply.code(503).send({
          reachable: false,
          error: isTimeout ? 'Timed out after 5s' : err.message,
        });
      }
    }
  );

  fastify.get(
    '/api/whatsapp/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        const { rows: [instance] } = await db.query<{
          status: string;
          phone_number: string | null;
          qr_code: string | null;
          qr_expires_at: string | null;
          link_code: string | null;
          link_code_expires_at: string | null;
          last_connected_at: string | null;
        }>(
          `SELECT status, phone_number, qr_code, qr_expires_at,
                  link_code, link_code_expires_at, last_connected_at
           FROM whatsapp_instances WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );

        if (!instance) {
          return reply.send({ connected: false, status: 'disconnected' });
        }

        const now = new Date();
        const lcValid = instance.link_code_expires_at && new Date(instance.link_code_expires_at) > now;

        // QR lives in Redis (wa:qr:{userId}) with a 3-minute TTL set by the WhatsApp service.
        // The DB qr_code column is no longer written; Redis is the source of truth for QR data.
        const qrCode = instance.status === 'qr_pending'
          ? await redis.get(`wa:qr:${userId}`)
          : null;

        return reply.send({
          connected: instance.status === 'connected',
          status: instance.status,
          phone: instance.phone_number,
          qrCode,
          linkCode: lcValid ? instance.link_code : null,
          linkCodeExpiresAt: instance.link_code_expires_at,
          lastConnectedAt: instance.last_connected_at,
        });
      } catch (err: any) {
        fastify.log.error({ err }, 'whatsapp/status: DB error');
        return reply.code(500).send({ error: 'Failed to fetch status', detail: err.message });
      }
    }
  );
}
