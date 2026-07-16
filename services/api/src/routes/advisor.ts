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

    // Advisor Companion Plan Phase 5 (§6.5/§9) — engagement signal for the
    // Phase 4.5 crons' frequency tuning: if the user's last-seen message in
    // this session was a proactively-initiated one, replying to it counts
    // as engagement rather than being ignored.
    const { rows: [lastMsg] } = await db.query(
      `SELECT initiated FROM advisor_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    if (lastMsg?.initiated) {
      await db.query(
        `UPDATE proactive_interest_chats SET user_engaged = true
         WHERE id = (SELECT id FROM proactive_interest_chats WHERE session_id = $1 ORDER BY delivered_at DESC LIMIT 1)`,
        [id],
      );
    }

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
    // Business Events Part E — on-by-default kill switch for the Business
    // Manager Assistant, same "paused=false means on" precedent as
    // companionFeaturesPaused. See docs/BUSINESS_EVENTS_PLAN.md Part E.
    businessManagerPaused: false,
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
      businessManagerPaused: r.business_manager_paused,
    };
  }

  fastify.get('/api/advisor/profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows: [profile] } = await db.query(
      `SELECT display_persona, tone_preferences, advice_preferences, boundaries, relationship_context,
              interests, spiritual_preferences, motivational_style, gossip_style,
              companion_features_paused, personal_mode_enabled, business_manager_paused
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
    businessManagerPaused: z.boolean().optional(),
  });

  fastify.patch('/api/advisor/profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = patchProfileBody.parse(request.body);

    const jsonbColumns: Record<string, unknown> = {
      display_persona: body.displayPersona, tone_preferences: body.tonePreferences,
      advice_preferences: body.advicePreferences, boundaries: body.boundaries,
      interests: body.interests, spiritual_preferences: body.spiritualPreferences,
      motivational_style: body.motivationalStyle, gossip_style: body.gossipStyle,
    };
    // companion_features_paused/business_manager_paused are plain BOOLEAN
    // columns — kept out of the jsonbColumns loop below (which casts every
    // value with ::jsonb) rather than cast-mismatched against it.
    const booleanColumns: Record<string, boolean | undefined> = {
      companion_features_paused: body.companionFeaturesPaused,
      business_manager_paused: body.businessManagerPaused,
    };

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [userId];
    let idx = 2;
    for (const [col, value] of Object.entries(jsonbColumns)) {
      if (value === undefined) continue;
      sets.push(`${col} = $${idx++}::jsonb`);
      values.push(JSON.stringify(value));
    }
    for (const [col, value] of Object.entries(booleanColumns)) {
      if (value === undefined) continue;
      sets.push(`${col} = $${idx++}`);
      values.push(value);
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

  // ── Conversation Watch Mode (Advisor Companion Plan Phase 4, §5.4/§9) ────
  // Reuses advisor_action_requests' already-unused 'watch_conversation'
  // action type instead of a dedicated table — a watch is auto-approved
  // at creation (there's nothing risky to approve, unlike a send), and
  // services/intelligence/app/workers/message_worker.py polls for an
  // active one on every incoming message via find_active_watch().

  const createWatchBody = z.object({
    sessionId: z.string().uuid(),
    conversationId: z.string().uuid(),
    expiresInMinutes: z.number().int().min(5).max(24 * 60).optional(),
  });

  fastify.post('/api/advisor/watch', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId, conversationId, expiresInMinutes } = createWatchBody.parse(request.body);

    const { rows: [conversation] } = await db.query(
      'SELECT id, contact_id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: [session] } = await db.query(
      'SELECT id FROM advisor_sessions WHERE id = $1 AND user_id = $2 AND is_archived = false',
      [sessionId, userId],
    );
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const minutes = expiresInMinutes ?? 60;
    const { rows: [watch] } = await db.query(
      `INSERT INTO advisor_action_requests
         (user_id, session_id, action_type, status, payload, risk_level, approved_at, expires_at)
       VALUES ($1, $2, 'watch_conversation', 'approved', $3::jsonb, 'low', NOW(), NOW() + make_interval(mins => $4))
       RETURNING *`,
      [userId, sessionId, JSON.stringify({ conversationId, contactId: conversation.contact_id }), minutes],
    );
    return reply.code(201).send({ watch: actionRequestApiShape(watch) });
  });

  fastify.get('/api/advisor/watch', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId } = request.query as { sessionId?: string };

    const filters = ["user_id = $1", "action_type = 'watch_conversation'", "status = 'approved'", "(expires_at IS NULL OR expires_at > NOW())"];
    const params: unknown[] = [userId];
    if (sessionId) { params.push(sessionId); filters.push(`session_id = $${params.length}`); }

    const { rows } = await db.query(
      `SELECT * FROM advisor_action_requests WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 20`,
      params,
    );
    return reply.send({ watches: rows.map(actionRequestApiShape) });
  });

  fastify.delete('/api/advisor/watch/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rowCount } = await db.query(
      `UPDATE advisor_action_requests SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND action_type = 'watch_conversation' AND status = 'approved'`,
      [id, userId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Watch not found or already ended' });
    return reply.send({ ok: true });
  });

  // ── Companion Feed (Advisor Companion Plan Phase 4.5, §5.5/§7.7) ─────────
  // Merged, timeline-ordered read of gossip_worthy_events + recent
  // proactive_interest_chats for the "Zuri Noticed Something" card. Note
  // §5.5 also lists a separate Companion Preferences API — that's already
  // covered by the existing GET/PATCH /api/advisor/profile (Phase 1),
  // which returns/updates these exact fields, so it isn't duplicated here.

  fastify.get('/api/advisor/companion-feed', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { status } = request.query as { status?: string };

    // §6.9's delivery-timing check, done here rather than in the
    // intelligence service since Node already owns this read path and can
    // check advisor_user_profiles.current_emotional_state directly —
    // surfaces at most one new gossip item per call, only when the user's
    // current state is calm enough not to pile on a bad day.
    const { rows: [profile] } = await db.query(
      `SELECT current_emotional_state->>'valence' AS valence,
              current_emotional_state->>'arousal' AS arousal
       FROM advisor_user_profiles WHERE user_id = $1`,
      [userId],
    );
    const valence = profile?.valence != null ? parseFloat(profile.valence) : 0;
    const arousal = profile?.arousal != null ? parseFloat(profile.arousal) : 0.3;
    if (valence >= -0.2 && arousal <= 0.6) {
      await db.query(
        `UPDATE gossip_worthy_events SET status = 'delivered', delivered_at = NOW()
         WHERE id = (
           SELECT id FROM gossip_worthy_events
           WHERE user_id = $1 AND status = 'pending'
           ORDER BY confidence DESC, created_at ASC LIMIT 1
         )`,
        [userId],
      );
    }

    const gossipStatuses = status === 'pending' ? ['pending'] : ['pending', 'delivered'];
    const { rows: gossip } = await db.query(
      `SELECT g.id, g.contact_id, g.signal_type, g.summary, g.confidence, g.in_close_circle,
              g.status, g.delivered_at, g.created_at,
              COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
       FROM gossip_worthy_events g
       JOIN contacts c ON c.id = g.contact_id
       WHERE g.user_id = $1 AND g.status = ANY($2::text[]) AND g.created_at > NOW() - INTERVAL '7 days'
       ORDER BY g.created_at DESC LIMIT 20`,
      [userId, gossipStatuses],
    );
    const { rows: interestChats } = await db.query(
      `SELECT id, interest_topic, trigger_event, content_type, delivered_at, user_engaged
       FROM proactive_interest_chats
       WHERE user_id = $1 AND delivered_at > NOW() - INTERVAL '24 hours'
       ORDER BY delivered_at DESC LIMIT 20`,
      [userId],
    );

    const items = [
      ...gossip.map(g => ({
        kind: 'gossip' as const, id: g.id, contactId: g.contact_id, contactName: g.contact_name,
        signalType: g.signal_type, summary: g.summary, confidence: Number(g.confidence),
        inCloseCircle: g.in_close_circle, status: g.status, timestamp: g.delivered_at ?? g.created_at,
      })),
      ...interestChats.map(i => ({
        kind: 'interest' as const, id: i.id, topic: i.interest_topic, triggerEvent: i.trigger_event,
        contentType: i.content_type, userEngaged: i.user_engaged, timestamp: i.delivered_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return reply.send({ items });
  });

  fastify.post('/api/advisor/companion-feed/:id/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { rowCount } = await db.query(
      `UPDATE gossip_worthy_events SET status = 'dismissed' WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Not found' });
    return reply.send({ ok: true });
  });

  // ── Scoped Automation (Advisor Companion Plan Phase 6, §3.5/§9) ──────────
  // A time-limited, conversation-specific auto-send grant, layered on top
  // of the existing auto-response eligibility checks in
  // services/intelligence/app/services/reply_gen.py — it never bypasses
  // business hours/exclusions/escalation keywords, only the approval_mode
  // gate, and only for a reply judged in-scope by check_reply_in_scope().

  function automationGrantApiShape(r: any) {
    const effectiveStatus = r.status === 'active' && new Date(r.expires_at) <= new Date() ? 'expired' : r.status;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      scopeDescription: r.scope_description,
      status: effectiveStatus,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    };
  }

  const createAutomationGrantBody = z.object({
    sessionId: z.string().uuid(),
    conversationId: z.string().uuid(),
    scopeDescription: z.string().min(1).max(500),
    durationMinutes: z.number().int().min(5).max(240).optional(),
  });

  fastify.post('/api/advisor/automation-grants', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId, conversationId, scopeDescription, durationMinutes } = createAutomationGrantBody.parse(request.body);

    const { rows: [conversation] } = await db.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: [session] } = await db.query(
      'SELECT id FROM advisor_sessions WHERE id = $1 AND user_id = $2 AND is_archived = false',
      [sessionId, userId],
    );
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const minutes = durationMinutes ?? 30;
    const { rows: [grant] } = await db.query(
      `INSERT INTO advisor_automation_grants
         (user_id, session_id, conversation_id, scope_description, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5))
       RETURNING *`,
      [userId, sessionId, conversationId, scopeDescription, minutes],
    );
    return reply.code(201).send({ grant: automationGrantApiShape(grant) });
  });

  fastify.get('/api/advisor/automation-grants', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { conversationId } = request.query as { conversationId?: string };

    const filters = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (conversationId) { params.push(conversationId); filters.push(`conversation_id = $${params.length}`); }

    const { rows } = await db.query(
      `SELECT * FROM advisor_automation_grants WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 20`,
      params,
    );
    return reply.send({ grants: rows.map(automationGrantApiShape) });
  });

  fastify.post('/api/advisor/automation-grants/:id/revoke', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { rowCount } = await db.query(
      `UPDATE advisor_automation_grants SET status = 'revoked', revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Grant not found or already ended' });
    return reply.send({ ok: true });
  });

  fastify.get('/api/advisor/automation-grants/:id/audit-log', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [grant] } = await db.query(
      'SELECT id FROM advisor_automation_grants WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!grant) return reply.code(404).send({ error: 'Grant not found' });

    const { rows } = await db.query(
      `SELECT id, message_id, action, detail, sent_text, created_at
       FROM advisor_automation_audit_log WHERE grant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [id],
    );
    return reply.send({
      entries: rows.map(r => ({
        id: r.id, messageId: r.message_id, action: r.action,
        detail: r.detail, sentText: r.sent_text, createdAt: r.created_at,
      })),
    });
  });
}
