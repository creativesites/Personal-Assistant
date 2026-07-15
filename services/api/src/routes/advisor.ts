import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { sendWhatsAppMessage } from '../lib/whatsapp-send';
import { actionRequestApiShape } from '../lib/advisor-actions';

const INTELLIGENCE_URL = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';

const createSessionBody = z.object({
  title: z.string().max(200).optional(),
  contactId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  category: z.enum(['relationship', 'business']).optional(),
  companionMode: z.enum([
    'balanced', 'best_friend', 'coach', 'therapist_like',
    'business_partner', 'dating_advisor', 'analyst', 'gossip', 'spiritual_companion',
  ]).optional(),
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
              s.session_category, s.companion_mode, s.created_at, s.updated_at,
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
      `INSERT INTO advisor_sessions (user_id, contact_id, conversation_id, title, session_category, companion_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, contact_id, conversation_id, message_count, session_category, companion_mode, created_at`,
      [userId, body.contactId ?? null, body.conversationId ?? null, body.title ?? 'New conversation',
        sessionCategory, body.companionMode ?? 'balanced'],
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
    // Advisor Companion Plan Phase 1 (docs/ADVISOR_COMPANION_PLAN.md §5.2) —
    // the global advisor now returns richer per-turn metadata
    // (assistantState/memorySuggestion) via AdvisorCompanionService; the
    // conversation-scoped and studio advisors still return only {answer}
    // for now (their own orchestration is a later phase).
    let assistantState: Record<string, unknown> | null = null;
    let memorySuggestion: Record<string, unknown> | null = null;
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
        const data = await res.json() as {
          answer?: string
          assistantState?: Record<string, unknown>
          memorySuggestion?: Record<string, unknown> | null
        };
        answer = data.answer ?? 'I was unable to generate a response.';
        assistantState = data.assistantState ?? null;
        memorySuggestion = data.memorySuggestion ?? null;
      } else {
        answer = 'The AI service returned an error. Please try again.';
      }
    } catch {
      answer = 'Unable to reach the intelligence service. Please check that it is running.';
    }

    // Persist assistant message
    const { rows: [assistantMsg] } = await db.query(
      `INSERT INTO advisor_messages (session_id, role, content, metadata)
       VALUES ($1, 'assistant', $2, $3::jsonb)
       RETURNING id, role, content, metadata, created_at`,
      [id, answer, JSON.stringify(assistantState ? { assistantState, memorySuggestion } : {})],
    );

    // Bump session counters
    await db.query(
      `UPDATE advisor_sessions SET message_count = message_count + 2, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    return reply.send({ message: assistantMsg, assistantState, memorySuggestion });
  });

  // ── PATCH /api/advisor/sessions/:id ───────────────────────────────────────

  const patchSessionBody = z.object({
    companionMode: z.enum([
      'balanced', 'best_friend', 'coach', 'therapist_like',
      'business_partner', 'dating_advisor', 'analyst', 'gossip', 'spiritual_companion',
    ]),
  });

  fastify.patch('/api/advisor/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { companionMode } = patchSessionBody.parse(request.body);

    const { rowCount } = await db.query(
      'UPDATE advisor_sessions SET companion_mode = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [companionMode, id, userId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Session not found' });

    return reply.send({ ok: true });
  });

  // ── Advisor Profile (Advisor Companion Plan Phase 1, §5.1/§7.6) ──────────

  const DEFAULT_PROFILE = {
    displayPersona: {}, tonePreferences: {}, advicePreferences: {}, boundaries: {},
    relationshipContext: {}, interests: [], spiritualPreferences: {}, motivationalStyle: {},
    gossipStyle: {}, companionFeaturesPaused: false, personalModeEnabled: false,
  };

  function profileApiShape(r: any) {
    return {
      displayPersona: r.display_persona,
      tonePreferences: r.tone_preferences,
      advicePreferences: r.advice_preferences,
      boundaries: r.boundaries,
      relationshipContext: r.relationship_context,
      interests: r.interests,
      spiritualPreferences: r.spiritual_preferences,
      motivationalStyle: r.motivational_style,
      gossipStyle: r.gossip_style,
      companionFeaturesPaused: r.companion_features_paused,
      personalModeEnabled: r.personal_mode_enabled,
    };
  }

  fastify.get('/api/advisor/profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows: [profile] } = await db.query(
      `SELECT display_persona, tone_preferences, advice_preferences, boundaries, relationship_context,
              interests, spiritual_preferences, motivational_style, gossip_style,
              companion_features_paused, personal_mode_enabled
       FROM advisor_user_profiles WHERE user_id = $1`,
      [userId],
    );
    return reply.send({ profile: profile ? profileApiShape(profile) : DEFAULT_PROFILE });
  });

  const patchProfileBody = z.object({
    displayPersona: z.record(z.any()).optional(),
    tonePreferences: z.record(z.any()).optional(),
    advicePreferences: z.record(z.any()).optional(),
    boundaries: z.record(z.any()).optional(),
    interests: z.array(z.string()).optional(),
    spiritualPreferences: z.record(z.any()).optional(),
    motivationalStyle: z.record(z.any()).optional(),
    gossipStyle: z.record(z.any()).optional(),
    companionFeaturesPaused: z.boolean().optional(),
    // §1.2/§4.5 — the Personalisation-tab toggle is one of the two allowed
    // setters for personal_mode_enabled (the other being the chat intent,
    // handled inside AdvisorCompanionService) — never inferred.
    personalModeEnabled: z.boolean().optional(),
  });

  fastify.patch('/api/advisor/profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = patchProfileBody.parse(request.body);

    const columns: Record<string, unknown> = {
      display_persona: body.displayPersona, tone_preferences: body.tonePreferences,
      advice_preferences: body.advicePreferences, boundaries: body.boundaries,
      interests: body.interests, spiritual_preferences: body.spiritualPreferences,
      motivational_style: body.motivationalStyle, gossip_style: body.gossipStyle,
      companion_features_paused: body.companionFeaturesPaused,
    };

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [userId];
    let idx = 2;
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      sets.push(`${col} = $${idx++}::jsonb`);
      values.push(JSON.stringify(value));
    }
    if (body.personalModeEnabled !== undefined) {
      sets.push(`personal_mode_enabled = $${idx++}`);
      values.push(body.personalModeEnabled);
      sets.push(`personal_mode_enabled_at = ${body.personalModeEnabled ? 'NOW()' : 'NULL'}`);
    }

    await db.query(
      `INSERT INTO advisor_user_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}`,
      values,
    );

    return reply.send({ ok: true });
  });

  // ── Advisor Memories (§4.2/§5.1) ──────────────────────────────────────────

  function memoryApiShape(r: any) {
    return {
      id: r.id,
      memoryType: r.memory_type,
      memoryKey: r.memory_key,
      memoryValue: r.memory_value,
      confidence: Number(r.confidence),
      evidenceCount: r.evidence_count,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
    };
  }

  fastify.get('/api/advisor/memories', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { type } = request.query as { type?: string };

    const filters = ['user_id = $1', 'is_active = true'];
    const params: unknown[] = [userId];
    if (type) { params.push(type); filters.push(`memory_type = $${params.length}`); }

    const { rows } = await db.query(
      `SELECT * FROM advisor_memories WHERE ${filters.join(' AND ')} ORDER BY last_seen_at DESC LIMIT 100`,
      params,
    );
    return reply.send({ memories: rows.map(memoryApiShape) });
  });

  const createMemoryBody = z.object({
    memoryType: z.enum([
      'preference', 'boundary', 'trait', 'goal',
      'relationship_pattern', 'successful_advice', 'disliked_advice',
    ]),
    memoryKey: z.string().min(1).max(120),
    memoryValue: z.string().min(1).max(1000),
  });

  fastify.post('/api/advisor/memories', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = createMemoryBody.parse(request.body);

    // Explicit user "remember this" — fully trusted, unlike an inferred suggestion.
    const { rows: [memory] } = await db.query(
      `INSERT INTO advisor_memories (user_id, memory_type, memory_key, memory_value, confidence)
       VALUES ($1, $2, $3, $4, 1.0) RETURNING *`,
      [userId, body.memoryType, body.memoryKey, body.memoryValue],
    );
    return reply.code(201).send({ memory: memoryApiShape(memory) });
  });

  fastify.delete('/api/advisor/memories/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    // Deactivated, not deleted — same convention as contact_insights.
    const { rowCount } = await db.query(
      'UPDATE advisor_memories SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Memory not found' });
    return reply.send({ ok: true });
  });

  const correctMemoryBody = z.object({
    memoryValue: z.string().min(1).max(1000),
  });

  fastify.post('/api/advisor/memories/:id/correct', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { memoryValue } = correctMemoryBody.parse(request.body);

    // A user correction is fully trusted going forward.
    const { rows: [memory] } = await db.query(
      `UPDATE advisor_memories
       SET memory_value = $1, confidence = 1.0, evidence_count = evidence_count + 1, last_seen_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [memoryValue, id, userId],
    );
    if (!memory) return reply.code(404).send({ error: 'Memory not found' });
    return reply.send({ memory: memoryApiShape(memory) });
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

  // ── Advisor Action Requests (Advisor Companion Plan Phase 3, §4.3/§5.3) ──
  // The proposal itself is created in routes/conversations.ts's /ask
  // handler (it needs the just-persisted assistant message_id); this is
  // the read/approve/cancel/execute surface on top of it.

  fastify.get('/api/advisor/actions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId, status } = request.query as { sessionId?: string; status?: string };

    const filters = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (sessionId) { params.push(sessionId); filters.push(`session_id = $${params.length}`); }
    if (status) { params.push(status); filters.push(`status = $${params.length}`); }

    const { rows } = await db.query(
      `SELECT * FROM advisor_action_requests WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 50`,
      params,
    );
    return reply.send({ actions: rows.map(actionRequestApiShape) });
  });

  fastify.post('/api/advisor/actions/:id/approve', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [action] } = await db.query(
      `UPDATE advisor_action_requests SET status = 'approved', approved_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'proposed' RETURNING *`,
      [id, userId],
    );
    if (!action) return reply.code(404).send({ error: 'Action not found or not in a proposed state' });
    return reply.send({ action: actionRequestApiShape(action) });
  });

  fastify.post('/api/advisor/actions/:id/cancel', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [action] } = await db.query(
      `UPDATE advisor_action_requests SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status IN ('proposed', 'approved') RETURNING *`,
      [id, userId],
    );
    if (!action) return reply.code(404).send({ error: 'Action not found or already resolved' });
    return reply.send({ action: actionRequestApiShape(action) });
  });

  // §8.1 default sending policy — drafting is always allowed, sending
  // always requires the approve step above to have already happened;
  // this route is the one place an advisor-proposed action actually runs.
  fastify.post('/api/advisor/actions/:id/execute', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [action] } = await db.query(
      `SELECT * FROM advisor_action_requests WHERE id = $1 AND user_id = $2 AND status = 'approved'`,
      [id, userId],
    );
    if (!action) return reply.code(404).send({ error: 'Action not found or not approved yet' });

    if (action.action_type !== 'send_whatsapp_message') {
      return reply.code(400).send({ error: `Execution for action type "${action.action_type}" is not supported yet` });
    }

    await db.query(`UPDATE advisor_action_requests SET status = 'executing' WHERE id = $1`, [id]);

    try {
      const payload = action.payload as { conversationId: string; text: string };
      const { message } = await sendWhatsAppMessage(userId, payload.conversationId, payload.text);
      const { rows: [updated] } = await db.query(
        `UPDATE advisor_action_requests
         SET status = 'completed', executed_at = NOW(), result = $1::jsonb
         WHERE id = $2 RETURNING *`,
        [JSON.stringify({ sent: true, messageId: message.id }), id],
      );
      return reply.send({ action: actionRequestApiShape(updated) });
    } catch (err) {
      const { rows: [updated] } = await db.query(
        `UPDATE advisor_action_requests
         SET status = 'failed', result = $1::jsonb
         WHERE id = $2 RETURNING *`,
        [JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), id],
      );
      return reply.code(502).send({ action: actionRequestApiShape(updated), error: 'Failed to send message' });
    }
  });
}
