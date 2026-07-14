import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

const INTELLIGENCE_URL = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';

const createSessionBody = z.object({
  title: z.string().max(200).optional(),
  contactId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  category: z.enum(['relationship', 'business']).optional(),
});

const sendMessageBody = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

export async function advisorRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/advisor/sessions ─────────────────────────────────────────────

  fastify.get('/api/advisor/sessions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const query = request.query as Record<string, string>;
    const category = query.category ?? null;

    const { rows } = await db.query(
      `SELECT s.id, s.title, s.contact_id, s.conversation_id, s.message_count,
              s.session_category, s.created_at, s.updated_at,
              c.display_name AS contact_name
       FROM advisor_sessions s
       LEFT JOIN contacts c ON s.contact_id = c.id AND c.user_id = $1
       WHERE s.user_id = $1 AND s.is_archived = false
         AND ($2::text IS NULL OR s.session_category = $2)
       ORDER BY s.updated_at DESC
       LIMIT 50`,
      [userId, category],
    );
    return reply.send({ sessions: rows });
  });

  // ── POST /api/advisor/sessions ────────────────────────────────────────────

  fastify.post('/api/advisor/sessions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = createSessionBody.parse(request.body);

    const sessionCategory = body.category ?? 'relationship';
    const { rows: [session] } = await db.query(
      `INSERT INTO advisor_sessions (user_id, contact_id, conversation_id, title, session_category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, contact_id, conversation_id, message_count, session_category, created_at`,
      [userId, body.contactId ?? null, body.conversationId ?? null, body.title ?? 'New conversation', sessionCategory],
    );
    return reply.code(201).send({ session });
  });

  // ── GET /api/advisor/sessions/:id/messages ────────────────────────────────

  fastify.get('/api/advisor/sessions/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [session] } = await db.query(
      'SELECT id FROM advisor_sessions WHERE id = $1 AND user_id = $2 AND is_archived = false',
      [id, userId],
    );
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const { rows } = await db.query(
      `SELECT id, role, content, metadata, created_at
       FROM advisor_messages WHERE session_id = $1
       ORDER BY created_at ASC`,
      [id],
    );
    return reply.send({ messages: rows });
  });

  // ── POST /api/advisor/sessions/:id/messages ───────────────────────────────

  fastify.post('/api/advisor/sessions/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { message, conversationId } = sendMessageBody.parse(request.body);

    const { rows: [session] } = await db.query(
      'SELECT id, conversation_id, session_category FROM advisor_sessions WHERE id = $1 AND user_id = $2 AND is_archived = false',
      [id, userId],
    );
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    // Persist user message
    await db.query(
      `INSERT INTO advisor_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [id, message],
    );

    // Route to intelligence service
    const convId = conversationId ?? session.conversation_id;
    const isBusinessSession = session.session_category === 'business';
    let answer = '';
    try {
      const endpoint = convId
        ? `/internal/conversations/${convId}/ask`
        : isBusinessSession
          ? `/internal/studio/ask`
          : `/internal/advisor/ask`;

      const res = await fetch(`${INTELLIGENCE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, question: message, session_id: id }),
      });

      if (res.ok) {
        const data = await res.json() as { answer?: string };
        answer = data.answer ?? 'I was unable to generate a response.';
      } else {
        answer = 'The AI service returned an error. Please try again.';
      }
    } catch {
      answer = 'Unable to reach the intelligence service. Please check that it is running.';
    }

    // Persist assistant message
    const { rows: [assistantMsg] } = await db.query(
      `INSERT INTO advisor_messages (session_id, role, content)
       VALUES ($1, 'assistant', $2)
       RETURNING id, role, content, metadata, created_at`,
      [id, answer],
    );

    // Bump session counters
    await db.query(
      `UPDATE advisor_sessions SET message_count = message_count + 2, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    return reply.send({ message: assistantMsg });
  });

  // ── DELETE /api/advisor/sessions/:id ─────────────────────────────────────

  fastify.delete('/api/advisor/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query(
      `UPDATE advisor_sessions SET is_archived = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return reply.send({ ok: true });
  });
}
