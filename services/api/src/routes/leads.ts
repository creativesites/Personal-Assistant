import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function leadsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── List leads ─────────────────────────────────────────────────────────────
  fastify.get('/api/leads', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    // Query 1: All leads with aggregated base fields
    const { rows: leads } = await db.query(
      `SELECT
        co.id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS name,
        co.phone_number,
        co.avatar_url,
        co.email,
        co.company,
        co.job_title,
        co.industry,
        co.customer_status,
        co.pipeline_stage,
        co.lead_score,
        co.last_message_at,
        co.created_at,
        cp.personality_summary,
        cp.communication_style,
        cp.buying_behaviour,
        cp.pain_points,
        cp.goals,
        cp.preferences,
        cp.relationship_stage,
        cp.mood_baseline,
        cp.current_life_context,
        COALESCE(r.health_score, 70)       AS health_score,
        COALESCE(r.health_trend, 'stable') AS health_trend,
        r.last_interaction_at,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ct.tag ORDER BY ct.tag), NULL) AS tags
      FROM contacts co
      LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $1
      LEFT JOIN relationships r     ON r.contact_id  = co.id AND r.user_id  = $1
      LEFT JOIN contact_tags ct     ON ct.contact_id = co.id AND ct.user_id = $1
      WHERE co.user_id = $1
        AND co.is_group = false
        AND co.archived_at IS NULL
        AND (
          co.customer_status IN ('lead', 'prospect', 'customer')
          OR co.pipeline_stage IS NOT NULL
          OR co.lead_score > 0
        )
      GROUP BY co.id, cp.id, r.id
      ORDER BY co.lead_score DESC NULLS LAST, co.last_message_at DESC NULLS LAST
      LIMIT 200`,
      [userId],
    );

    if (leads.length === 0) {
      return reply.send({ leads: [] });
    }

    const leadIds = leads.map((l: any) => l.id);

    // Query 2: Active insights for all leads
    const { rows: insights } = await db.query(
      `SELECT
        contact_id,
        insight_key,
        insight_value,
        confidence,
        supporting_text,
        created_at
       FROM contact_insights
       WHERE contact_id = ANY($1::uuid[])
         AND user_id = $2
         AND is_active = TRUE
       ORDER BY confidence DESC NULLS LAST`,
      [leadIds, userId],
    );

    // Query 3: Recent messages + AI analysis per lead (last 10 messages per contact)
    const { rows: messages } = await db.query(
      `SELECT DISTINCT ON (m.conversation_id, m.whatsapp_timestamp)
        c.contact_id,
        m.id                AS message_id,
        m.sender_type,
        m.body,
        m.whatsapp_timestamp,
        ma.intent,
        ma.response_urgency,
        ma.requires_response,
        ma.entities,
        ma.topics,
        ma.promises_detected,
        ma.sentiment,
        ma.importance_score
       FROM (
         SELECT id, conversation_id FROM (
           SELECT m2.id, m2.conversation_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY m2.conversation_id
                    ORDER BY m2.whatsapp_timestamp DESC
                  ) AS rn
           FROM messages m2
           WHERE m2.body IS NOT NULL AND m2.is_deleted = false
         ) ranked WHERE rn <= 10
       ) m_top
       JOIN messages m          ON m.id = m_top.id
       JOIN conversations c     ON c.id = m.conversation_id AND c.user_id = $2
       LEFT JOIN message_analyses ma ON ma.message_id = m.id
       WHERE c.contact_id = ANY($1::uuid[])
       ORDER BY m.conversation_id, m.whatsapp_timestamp DESC`,
      [leadIds, userId],
    );

    // Build lookup maps
    const insightsByContact: Record<string, any[]> = {};
    for (const ins of insights) {
      if (!insightsByContact[ins.contact_id]) insightsByContact[ins.contact_id] = [];
      insightsByContact[ins.contact_id].push({
        key: ins.insight_key,
        value: ins.insight_value,
        confidence: parseFloat(ins.confidence ?? '0'),
        supportingText: ins.supporting_text,
        createdAt: ins.created_at,
      });
    }

    const messagesByContact: Record<string, any[]> = {};
    for (const msg of messages) {
      if (!messagesByContact[msg.contact_id]) messagesByContact[msg.contact_id] = [];
      messagesByContact[msg.contact_id].push({
        id: msg.message_id,
        senderType: msg.sender_type,
        body: msg.body,
        timestamp: msg.whatsapp_timestamp,
        analysis: msg.intent ? {
          intent: msg.intent,
          responseUrgency: msg.response_urgency,
          requiresResponse: msg.requires_response,
          entities: msg.entities ?? [],
          topics: msg.topics ?? [],
          promisesDetected: msg.promises_detected ?? [],
          sentiment: msg.sentiment,
          importanceScore: msg.importance_score ? parseFloat(msg.importance_score) : null,
        } : null,
      });
    }

    // Derive computed fields per lead
    const enriched = leads.map((lead: any) => {
      const leadMsgs = messagesByContact[lead.id] ?? [];
      const leadInsights = insightsByContact[lead.id] ?? [];

      // Determine if there are unread/unreplied contact messages
      const contactMessages = leadMsgs.filter((m: any) => m.senderType === 'contact');
      const lastContactMsg = contactMessages[0] ?? null;

      const hasRequiresResponse = leadMsgs.some(
        (m: any) => m.senderType === 'contact' && m.analysis?.requiresResponse,
      );

      const urgencyRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      const maxUrgency = leadMsgs
        .filter((m: any) => m.senderType === 'contact' && m.analysis?.responseUrgency)
        .reduce((best: string, m: any) => {
          const rank = urgencyRank[m.analysis.responseUrgency] ?? 0;
          return rank > (urgencyRank[best] ?? 0) ? m.analysis.responseUrgency : best;
        }, 'low');

      // Extract what the lead explicitly asked about or expressed interest in
      const interestInsights = leadInsights.filter((i: any) =>
        ['asked_about', 'interested_in', 'product_interest', 'service_interest',
         'budget_mentioned', 'quantity_requested', 'timeline_mentioned',
         'delivery_urgency', 'price_sensitivity', 'competitor_mentioned',
         'decision_signal', 'quantity_volume'].some(k => i.key.includes(k)),
      );

      // All product/service related entities from messages
      const mentionedProducts: string[] = [];
      for (const msg of leadMsgs) {
        const entities: any[] = msg.analysis?.entities ?? [];
        for (const ent of entities) {
          if (ent.type === 'product' && ent.text && !mentionedProducts.includes(ent.text)) {
            mentionedProducts.push(ent.text);
          }
        }
      }

      // Topics mentioned in messages
      const allTopics: string[] = [];
      for (const msg of leadMsgs) {
        const topics: string[] = msg.analysis?.topics ?? [];
        for (const t of topics) {
          if (!allTopics.includes(t)) allTopics.push(t);
        }
      }

      // Derive next best action based on data
      let nextAction: string | null = null;
      if (hasRequiresResponse || maxUrgency === 'urgent' || maxUrgency === 'high') {
        nextAction = 'Respond to message';
      } else if (lead.pipeline_stage === 'proposal' || lead.pipeline_stage === 'negotiation') {
        nextAction = 'Follow up on proposal';
      } else if (lead.pipeline_stage === 'qualified') {
        nextAction = 'Schedule discovery call';
      } else if (!lead.last_message_at) {
        nextAction = 'Send introduction';
      } else {
        const daysSinceMsg = lead.last_message_at
          ? Math.floor((Date.now() - new Date(lead.last_message_at).getTime()) / 86400000)
          : null;
        if (daysSinceMsg !== null && daysSinceMsg > 7) {
          nextAction = 'Re-engage contact';
        }
      }

      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phone_number,
        avatarUrl: lead.avatar_url,
        email: lead.email,
        company: lead.company,
        jobTitle: lead.job_title,
        industry: lead.industry,
        customerStatus: lead.customer_status,
        pipelineStage: lead.pipeline_stage,
        leadScore: lead.lead_score ?? 0,
        lastMessageAt: lead.last_message_at,
        createdAt: lead.created_at,
        tags: lead.tags ?? [],
        relationship: {
          healthScore: lead.health_score,
          healthTrend: lead.health_trend,
          lastInteractionAt: lead.last_interaction_at,
        },
        profile: {
          personalitySummary: lead.personality_summary,
          communicationStyle: lead.communication_style,
          buyingBehaviour: lead.buying_behaviour,
          painPoints: lead.pain_points,
          goals: lead.goals,
          preferences: lead.preferences,
          relationshipStage: lead.relationship_stage,
          moodBaseline: lead.mood_baseline,
          currentLifeContext: lead.current_life_context,
        },
        insights: leadInsights,
        interestInsights,
        mentionedProducts,
        mentionedTopics: allTopics.slice(0, 10),
        recentMessages: leadMsgs.slice(0, 5),
        lastContactMessage: lastContactMsg,
        hasRequiresResponse,
        maxUrgency,
        nextAction,
        messageCount: leadMsgs.length,
      };
    });

    return reply.send({ leads: enriched });
  });

  // ── Update lead stage ──────────────────────────────────────────────────────
  fastify.patch('/api/leads/:id/stage', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { pipelineStage?: string; customerStatus?: string };

    const validStages = [
      'new_lead', 'contacted', 'qualified', 'proposal',
      'negotiation', 'won', 'lost', null,
    ];
    // Matches CUSTOMER_STATUS_OPTIONS in apps/web/.../contacts/[id]/page.tsx —
    // this validator used to be narrower than what the Contacts UI could
    // actually set, silently rejecting valid statuses written from there.
    const validStatuses = [
      'contact', 'lead', 'prospect', 'customer', 'vip',
      'supplier', 'employee', 'partner', 'personal', 'churned',
    ];

    if (body.pipelineStage !== undefined && !validStages.includes(body.pipelineStage)) {
      return reply.code(400).send({ error: 'Invalid pipeline stage' });
    }
    if (body.customerStatus !== undefined && !validStatuses.includes(body.customerStatus)) {
      return reply.code(400).send({ error: 'Invalid customer status' });
    }

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id, userId];
    let idx = 3;

    if ('pipelineStage' in body) {
      sets.push(`pipeline_stage = $${idx++}`);
      values.push(body.pipelineStage ?? null);
    }
    if ('customerStatus' in body) {
      sets.push(`customer_status = $${idx++}`);
      values.push(body.customerStatus);
    }

    const { rowCount } = await db.query(
      `UPDATE contacts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
      values,
    );

    if (!rowCount) return reply.code(404).send({ error: 'Lead not found' });
    return reply.send({ ok: true });
  });

  // ── Update lead score ─────────────────────────────────────────────────────
  fastify.patch('/api/leads/:id/score', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { leadScore?: number };

    if (body.leadScore === undefined || body.leadScore < 0 || body.leadScore > 100) {
      return reply.code(400).send({ error: 'leadScore must be 0–100' });
    }

    const { rowCount } = await db.query(
      `UPDATE contacts SET lead_score = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId, body.leadScore],
    );

    if (!rowCount) return reply.code(404).send({ error: 'Lead not found' });
    return reply.send({ ok: true });
  });
}
