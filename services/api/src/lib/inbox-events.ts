import { db } from './db';
import { redis } from './redis';

type PriorityRow = {
  sla_minutes: number | null;
  latest_intent: string | null;
  latest_urgency: string | null;
  latest_sentiment: string | null;
  lead_score: number | null;
  requires_response: boolean | null;
};

export function deriveInboxPriority(row: PriorityRow): string | null {
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

export function formatConversationRow(r: any) {
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
      isGroup: r.is_group,
    },
    relationshipType: r.relationship_type,
    healthScore: r.health_score,
    importanceTier: r.importance_tier,
    leadScore: Math.min(100, Math.round(priorityRow.lead_score ?? 0)),
    slaMinutes: priorityRow.sla_minutes ? Math.round(priorityRow.sla_minutes) : null,
    sentiment: r.latest_sentiment ?? null,
    aiPriority: deriveInboxPriority(priorityRow),
  };
}

export async function getInboxConversation(userId: string, conversationId: string) {
  const { rows: [row] } = await db.query(
    `WITH latest_contact_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
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
      co.id AS contact_id,
      COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
      co.avatar_url,
      co.phone_number,
      co.is_group,
      COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
      COALESCE(r.health_score, 70) AS health_score,
      COALESCE(r.importance_tier, 3) AS importance_tier,
      COALESCE(ls.lead_score, 0) AS lead_score,
      lcm.sla_minutes,
      lcm.intent AS latest_intent,
      lcm.response_urgency AS latest_urgency,
      lcm.sentiment AS latest_sentiment,
      lcm.requires_response
    FROM conversations c
    JOIN contacts co ON co.id = c.contact_id
    LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
    LEFT JOIN lead_scores ls ON ls.contact_id = co.id
    LEFT JOIN latest_contact_msg lcm ON lcm.conversation_id = c.id
    WHERE c.user_id = $1 AND c.id = $2 AND c.is_archived = false`,
    [userId, conversationId],
  );

  return row ? formatConversationRow(row) : null;
}

import { bufferInboxEvent } from './event-buffer';

export async function publishInboxEvent(userId: string, event: string, payload: unknown): Promise<void> {
  try {
    const buffered = await bufferInboxEvent(userId, event, payload);
    await redis.publish(`${event}:${userId}`, JSON.stringify(buffered)).catch(() => {});
  } catch (err) {
    // Realtime is best-effort; HTTP/DB mutations remain authoritative.
    console.error(`[publishInboxEvent] Error publishing event ${event} for user ${userId}:`, err);
  }
}
