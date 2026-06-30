import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';

export async function writingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/writing/analyse-draft', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { text, contactId, conversationId } = request.body as any;
    if (!text) return reply.code(400).send({ error: 'text is required' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/draft-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId, contact_id: contactId, draft_text: text }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch (err: any) {
      return reply.code(502).send({ error: 'Failed to reach intelligence service' });
    }
  });
}
