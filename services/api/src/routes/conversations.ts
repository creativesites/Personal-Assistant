import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Derive an AI priority label from DB-level data. */
function derivePriority(row: {
  sla_minutes: number | null;
  latest_intent: string | null;
  latest_urgency: string | null;
  latest_sentiment: string | null;
  lead_score: number | null;
  requires_response: boolean | null;
}): string | null {
  const score = row.lead_score ?? 0;
  const intent = (row.latest_intent ?? '').toLowerCase();
  const urgency = row.latest_urgency;
  const sentiment = row.latest_sentiment;
  const sla = row.sla_minutes ?? 0;

  if (intent.includes('buy') || intent.includes('order') || intent.includes('purchase') || intent.includes('price')) {
    return score > 70 ? 'ready_to_buy' : 'hot_lead';
  }
  if (sentiment === 'negative') return 'dissatisfied';
  if (urgency === 'urgent' || urgency === 'high') return 'needs_followup';
  if (score > 80) return 'loyal';
  if (row.requires_response && sla > 60) return 'waiting';
  if (score > 65) return 'hot_lead';
  return null;
}

export async function conversationsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/conversations ──────────────────────────────────────────────────

  fastify.get('/api/conversations', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `WITH latest_contact_msg AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.id           AS message_id,
          m.whatsapp_timestamp,
          (ma.intent->>'primary') AS intent,
          ma.response_urgency,
          ma.sentiment,
          ma.requires_response,
          EXTRACT(EPOCH FROM (NOW() - m.whatsapp_timestamp)) / 60 AS sla_minutes
        FROM messages m
        LEFT JOIN message_analyses ma ON ma.message_id = m.id
        WHERE m.sender_type = 'contact' AND m.is_deleted = false
        ORDER BY m.conversation_id, m.whatsapp_timestamp DESC
      ),
      lead_scores AS (
        SELECT ci.contact_id, MAX(ci.confidence * 100) AS lead_score
        FROM contact_insights ci
        WHERE ci.user_id = $1 AND ci.is_active = true
          AND (ci.insight_key ILIKE '%lead%' OR ci.insight_key ILIKE '%score%' OR ci.insight_key ILIKE '%intent%')
        GROUP BY ci.contact_id
      )
      SELECT
        c.id,
        c.last_message_at,
        c.last_message_preview,
        c.unread_count,
        co.id   AS contact_id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
        co.avatar_url,
        co.phone_number,
        COALESCE(r.relationship_type, 'acquaintance')  AS relationship_type,
        COALESCE(r.health_score, 70)                   AS health_score,
        COALESCE(r.importance_tier, 3)                 AS importance_tier,
        COALESCE(ls.lead_score, 0)                     AS lead_score,
        lcm.sla_minutes,
        lcm.intent          AS latest_intent,
        lcm.response_urgency AS latest_urgency,
        lcm.sentiment       AS latest_sentiment,
        lcm.requires_response
      FROM conversations c
      JOIN contacts co ON co.id = c.contact_id
      LEFT JOIN relationships r   ON r.contact_id   = co.id AND r.user_id = c.user_id
      LEFT JOIN lead_scores ls    ON ls.contact_id  = co.id
      LEFT JOIN latest_contact_msg lcm ON lcm.conversation_id = c.id
      WHERE c.user_id = $1 AND c.is_archived = false
      ORDER BY
        CASE WHEN c.unread_count > 0 THEN 0 ELSE 1 END,
        c.last_message_at DESC NULLS LAST
      LIMIT 100`,
      [userId],
    );

    return reply.send({
      conversations: rows.map((r: any) => {
        const priorityRow = {
          sla_minutes: r.sla_minutes ? parseFloat(r.sla_minutes) : null,
          latest_intent: r.latest_intent,
          latest_urgency: r.latest_urgency,
          latest_sentiment: r.latest_sentiment,
          lead_score: r.lead_score ? parseFloat(r.lead_score) : null,
          requires_response: r.requires_response,
        };
        return {
          id: r.id,
          lastMessageAt: r.last_message_at,
          lastMessagePreview: r.last_message_preview,
          unreadCount: r.unread_count,
          contact: {
            id: r.contact_id,
            name: r.contact_name,
            avatarUrl: r.avatar_url,
            phone: r.phone_number,
          },
          relationshipType: r.relationship_type,
          healthScore: r.health_score,
          importanceTier: r.importance_tier,
          leadScore: Math.min(100, Math.round(priorityRow.lead_score ?? 0)),
          slaMinutes: priorityRow.sla_minutes ? Math.round(priorityRow.sla_minutes) : null,
          sentiment: r.latest_sentiment ?? null,
          aiPriority: derivePriority(priorityRow),
        };
      }),
    });
  });

  // ── GET /api/conversations/:id/messages ────────────────────────────────────

  fastify.get('/api/conversations/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [conv] } = await db.query(
      'SELECT id, contact_id FROM conversations WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const [messagesResult, contactResult] = await Promise.all([
      db.query(
        `SELECT
          m.id,
          m.sender_type,
          m.message_type,
          m.body,
          m.whatsapp_timestamp,
          m.is_deleted,
          m.media_url,
          m.media_mime_type,
          m.transcription,
          m.quoted_message_id,
          ma.sentiment,
          ma.sentiment_score,
          ma.requires_response,
          ma.response_urgency,
          ma.importance_score,
          (SELECT COUNT(*) FROM suggested_replies sr
            WHERE sr.message_id = m.id AND sr.status = 'pending') AS pending_suggestions
        FROM messages m
        LEFT JOIN message_analyses ma ON ma.message_id = m.id
        WHERE m.conversation_id = $1 AND m.is_deleted = false
        ORDER BY m.whatsapp_timestamp ASC
        LIMIT 150`,
        [id],
      ),
      db.query(
        `SELECT
          co.id,
          COALESCE(co.custom_name, co.display_name, co.phone_number) AS name,
          co.avatar_url,
          co.phone_number,
          COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
          COALESCE(r.health_score, 70) AS health_score
        FROM contacts co
        LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
        WHERE co.id = $1`,
        [conv.contact_id, userId],
      ),
    ]);

    // Mark conversation as read
    await db.query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);

    return reply.send({
      messages: messagesResult.rows.map((m: any) => ({
        id: m.id,
        senderType: m.sender_type,
        messageType: m.message_type,
        body: m.body,
        timestamp: m.whatsapp_timestamp,
        mediaUrl: m.media_url,
        mediaMimeType: m.media_mime_type,
        transcription: m.transcription,
        quotedMessageId: m.quoted_message_id,
        analysis: m.sentiment
          ? {
              sentiment: m.sentiment,
              sentimentScore: m.sentiment_score,
              requiresResponse: m.requires_response,
              responseUrgency: m.response_urgency,
              importanceScore: m.importance_score,
            }
          : null,
        pendingSuggestions: parseInt(m.pending_suggestions, 10),
      })),
      contact: contactResult.rows[0]
        ? {
            id: contactResult.rows[0].id,
            name: contactResult.rows[0].name,
            avatarUrl: contactResult.rows[0].avatar_url,
            phone: contactResult.rows[0].phone_number,
            relationshipType: contactResult.rows[0].relationship_type,
            healthScore: contactResult.rows[0].health_score,
          }
        : null,
    });
  });

  // ── POST /api/conversations/:id/messages ───────────────────────────────────

  const sendMessageBody = z.object({ text: z.string().min(1).max(4096) });

  fastify.post('/api/conversations/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { text } = sendMessageBody.parse(request.body);

    // Verify the conversation belongs to this user and get the contact JID
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.whatsapp_chat_id, co.whatsapp_jid
       FROM conversations c
       JOIN contacts co ON co.id = c.contact_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const now = new Date();
    const tempWaId = `direct-${crypto.randomUUID()}`;

    // Persist message to DB
    const { rows: [msg] } = await db.query(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
       VALUES ($1, $2, 'user', 'text', $3, $4)
       RETURNING id`,
      [id, tempWaId, text, now],
    );

    // Update conversation metadata
    await db.query(
      `UPDATE conversations
       SET last_message_at = $1, last_message_preview = $2, updated_at = NOW()
       WHERE id = $3`,
      [now, text.slice(0, 200), id],
    );

    // Queue for WhatsApp delivery
    await addToQueue(QUEUE_NAMES.SEND_REPLY, {
      userId,
      messageId: msg.id,
      suggestedReplyId: null,
      recipientJid: conv.whatsapp_jid,
      text,
    });

    return reply.code(201).send({
      message: {
        id: msg.id,
        senderType: 'user',
        body: text,
        timestamp: now.toISOString(),
        pendingSuggestions: 0,
      },
    });
  });

  // ── GET /api/inbox/briefing ────────────────────────────────────────────────

  fastify.get('/api/inbox/briefing', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const [waitingResult, intentResult, slaResult, healthResult] = await Promise.all([
      // Conversations with unread messages (contact waiting for user reply)
      db.query(
        `SELECT COUNT(*) AS count
         FROM conversations
         WHERE user_id = $1 AND unread_count > 0 AND is_archived = false`,
        [userId],
      ),
      // Conversations where latest contact message shows buying intent
      db.query(
        `SELECT COUNT(DISTINCT m.conversation_id) AS count
         FROM messages m
         JOIN message_analyses ma ON ma.message_id = m.id
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
           AND m.sender_type = 'contact'
           AND ma.intent::text ILIKE '%buy%' OR ma.intent::text ILIKE '%order%' OR ma.intent::text ILIKE '%price%'
         AND m.whatsapp_timestamp > NOW() - INTERVAL '48 hours'`,
        [userId],
      ),
      // Conversations waiting more than 2 hours for a reply
      db.query(
        `SELECT COUNT(*) AS count
         FROM (
           SELECT DISTINCT ON (m.conversation_id) m.conversation_id,
             EXTRACT(EPOCH FROM (NOW() - m.whatsapp_timestamp)) / 3600 AS hours_waiting
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           LEFT JOIN message_analyses ma ON ma.message_id = m.id
           WHERE c.user_id = $1 AND m.sender_type = 'contact'
             AND (ma.requires_response = true OR ma.requires_response IS NULL)
             AND c.unread_count > 0
           ORDER BY m.conversation_id, m.whatsapp_timestamp DESC
         ) waiting
         WHERE hours_waiting > 2`,
        [userId],
      ),
      // High-value contacts (high importance tier or high confidence insights)
      db.query(
        `SELECT COUNT(DISTINCT co.id) AS count,
                COALESCE(SUM(r.health_score), 0) AS total_health
         FROM contacts co
         JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
         WHERE r.importance_tier <= 2`,
        [userId],
      ),
    ]);

    const waitingCount = parseInt(waitingResult.rows[0]?.count ?? '0', 10);
    const highIntentCount = parseInt(intentResult.rows[0]?.count ?? '0', 10);
    const slaBreachCount = parseInt(slaResult.rows[0]?.count ?? '0', 10);
    const vipCount = parseInt(healthResult.rows[0]?.count ?? '0', 10);

    // Build contextual briefing items
    const items: string[] = [];
    if (waitingCount > 0) {
      items.push(`${waitingCount} customer${waitingCount !== 1 ? 's are' : ' is'} waiting for your reply`);
    }
    if (highIntentCount > 0) {
      items.push(`${highIntentCount} conversation${highIntentCount !== 1 ? 's have' : ' has'} high buying intent`);
    }
    if (slaBreachCount > 0) {
      items.push(`${slaBreachCount} conversation${slaBreachCount !== 1 ? 's have' : ' has'} been waiting over 2 hours`);
    }
    if (vipCount > 0) {
      items.push(`${vipCount} VIP contact${vipCount !== 1 ? 's' : ''} in your network — keep relationships warm`);
    }
    if (items.length === 0) {
      items.push('All caught up! No urgent conversations right now.');
    }

    return reply.send({
      waitingCount,
      highIntentCount,
      slaBreachCount,
      vipCount,
      items,
    });
  });

  // ── GET /api/conversations/:id/context ────────────────────────────────────

  fastify.get('/api/conversations/:id/context', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    // Verify ownership
    const { rows: [conv] } = await db.query(
      `SELECT c.id, c.contact_id, c.last_message_at
       FROM conversations c WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const [analysesResult, insightsResult, profileResult, snapshotResult] = await Promise.all([
      // Recent message analyses — intent, sentiment, topics, entities
      db.query(
        `SELECT
          m.sender_type, m.body, m.whatsapp_timestamp,
          ma.sentiment, ma.intent, ma.topics, ma.entities,
          ma.requires_response, ma.response_urgency, ma.importance_score,
          ma.promises_detected, ma.events_detected
         FROM messages m
         JOIN message_analyses ma ON ma.message_id = m.id
         WHERE m.conversation_id = $1 AND m.is_deleted = false
         ORDER BY m.whatsapp_timestamp DESC
         LIMIT 20`,
        [id],
      ),
      // Active contact insights
      db.query(
        `SELECT insight_key, insight_value, confidence, supporting_text
         FROM contact_insights
         WHERE contact_id = $1 AND user_id = $2 AND is_active = true
         ORDER BY confidence DESC LIMIT 15`,
        [conv.contact_id, userId],
      ),
      // Contact profile
      db.query(
        `SELECT cp.personality_summary, cp.communication_style, cp.mood_baseline,
                cp.known_triggers, cp.current_life_context, r.health_score,
                COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name
         FROM contacts co
         LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $2
         LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
         WHERE co.id = $1`,
        [conv.contact_id, userId],
      ),
      // Latest context snapshot if available
      db.query(
        `SELECT summary, covers_from, covers_to, created_at
         FROM context_snapshots
         WHERE contact_id = $1 AND user_id = $2 AND is_current = true
         ORDER BY created_at DESC LIMIT 1`,
        [conv.contact_id, userId],
      ),
    ]);

    const analyses = analysesResult.rows;
    const insights = insightsResult.rows;
    const profile = profileResult.rows[0] ?? null;
    const snapshot = snapshotResult.rows[0] ?? null;

    // Aggregate sentiment from recent contact messages
    const contactAnalyses = analyses.filter((a: any) => a.sender_type === 'contact');
    const sentimentCounts: Record<string, number> = {};
    for (const a of contactAnalyses) {
      if (a.sentiment) sentimentCounts[a.sentiment] = (sentimentCounts[a.sentiment] ?? 0) + 1;
    }
    const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';

    // Aggregate intents
    const intentSet = new Set<string>();
    for (const a of contactAnalyses) {
      if (a.intent) {
        try {
          const intent = typeof a.intent === 'string' ? JSON.parse(a.intent) : a.intent;
          if (Array.isArray(intent)) intent.forEach((i: string) => intentSet.add(i));
          else if (typeof intent === 'string') intentSet.add(intent);
        } catch {}
      }
    }

    // Aggregate topics
    const topicCounts: Record<string, number> = {};
    for (const a of analyses) {
      if (a.topics) {
        try {
          const topics = typeof a.topics === 'string' ? JSON.parse(a.topics) : a.topics;
          if (Array.isArray(topics)) {
            topics.forEach((t: string) => { topicCounts[t] = (topicCounts[t] ?? 0) + 1; });
          }
        } catch {}
      }
    }
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

    // Urgency
    const hasUrgent = analyses.some((a: any) => a.response_urgency === 'urgent' || a.response_urgency === 'high');
    const requiresResponse = analyses.some((a: any) => a.requires_response === true);

    // Buying signals from intent + insights
    const buyingSignals: string[] = [];
    const intents = Array.from(intentSet);
    if (intents.some(i => i.toLowerCase().includes('buy') || i.toLowerCase().includes('purchase'))) buyingSignals.push('Purchase intent detected');
    if (intents.some(i => i.toLowerCase().includes('price') || i.toLowerCase().includes('cost'))) buyingSignals.push('Pricing inquiry');
    if (intents.some(i => i.toLowerCase().includes('order'))) buyingSignals.push('Order inquiry');
    for (const ins of insights) {
      if ((ins.insight_key ?? '').toLowerCase().includes('interest') || (ins.insight_value ?? '').toLowerCase().includes('interested')) {
        buyingSignals.push(ins.insight_value);
      }
    }

    // Next action recommendation
    let nextAction = 'Continue the conversation';
    if (buyingSignals.length > 0) nextAction = 'Send a proposal or catalogue link';
    else if (dominantSentiment === 'negative') nextAction = 'Address concerns and rebuild trust';
    else if (hasUrgent) nextAction = 'Respond immediately — urgent message detected';
    else if (requiresResponse) nextAction = 'Reply to move the conversation forward';

    return reply.send({
      context: {
        contactName: profile?.contact_name ?? null,
        summary: snapshot?.summary ?? null,
        dominantSentiment,
        intents: intents.slice(0, 5),
        topTopics,
        buyingSignals: [...new Set(buyingSignals)].slice(0, 5),
        nextAction,
        requiresResponse,
        urgency: hasUrgent ? 'high' : 'normal',
        moodBaseline: profile?.mood_baseline ?? null,
        communicationStyle: profile?.communication_style ?? null,
        personalitySummary: profile?.personality_summary ?? null,
        insights: insights.slice(0, 8).map((i: any) => ({ key: i.insight_key, value: i.insight_value, confidence: i.confidence })),
        analysedAt: analyses[0]?.whatsapp_timestamp ?? conv.last_message_at,
      },
    });
  });

  // ── POST /api/conversations/:id/summarize ─────────────────────────────────

  fastify.post('/api/conversations/:id/summarize', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/summarize?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' });
    }
  });

  // ── POST /api/conversations/:id/followup ──────────────────────────────────

  fastify.post('/api/conversations/:id/followup', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/followup?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' });
    }
  });

  // ── POST /api/conversations/:id/ask ──────────────────────────────────────

  fastify.post('/api/conversations/:id/ask', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { question } = request.body as { question?: string };

    if (!question?.trim()) return reply.code(400).send({ error: 'question is required' });

    const conv = await db.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!conv.rows.length) return reply.code(404).send({ error: 'Not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${intelligenceUrl}/internal/conversations/${id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, question }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Intelligence service error' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Intelligence service unavailable' });
    }
  });

  // ── Archive / unarchive ───────────────────────────────────────────────────
  fastify.patch('/api/conversations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { is_archived?: boolean };

    if (typeof body?.is_archived !== 'boolean') {
      return reply.code(400).send({ error: 'is_archived (boolean) required' });
    }

    const result = await db.query(
      `UPDATE conversations SET is_archived = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [body.is_archived, id, userId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Conversation not found' });
    return reply.send({ ok: true });
  });
}
