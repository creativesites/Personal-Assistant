import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function contactsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/contacts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [contact] } = await db.query(
      `SELECT
        co.id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS name,
        co.avatar_url,
        co.phone_number,
        co.last_message_at,
        r.id AS relationship_id,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.importance_tier, 3) AS importance_tier,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.health_trend, 'stable') AS health_trend,
        r.last_interaction_at,
        r.notes,
        cp.personality_summary,
        cp.communication_style,
        cp.emotional_patterns,
        cp.known_triggers,
        cp.current_life_context,
        cp.mood_baseline,
        cp.updated_at AS profile_updated_at
      FROM contacts co
      LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
      LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $2
      WHERE co.id = $1 AND co.user_id = $2`,
      [id, userId],
    );

    if (!contact) return reply.code(404).send({ error: 'Contact not found' });

    const { rows: insights } = await db.query(
      `SELECT insight_key, insight_value, confidence, supporting_text, created_at
       FROM contact_insights
       WHERE contact_id = $1 AND user_id = $2 AND is_active = TRUE
       ORDER BY confidence DESC, created_at DESC
       LIMIT 20`,
      [id, userId],
    );

    const { rows: healthLogs } = await db.query(
      `SELECT health_score, health_trend, factors, recorded_at
       FROM relationship_health_logs
       WHERE contact_id = $1 AND user_id = $2
       ORDER BY recorded_at DESC
       LIMIT 10`,
      [id, userId],
    );

    const { rows: [msgStats] } = await db.query(
      `SELECT
        COUNT(*) AS total_messages,
        COUNT(*) FILTER (WHERE sender_type = 'user') AS sent,
        COUNT(*) FILTER (WHERE sender_type = 'contact') AS received,
        MAX(whatsapp_timestamp) AS last_message_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.contact_id = $1 AND c.user_id = $2`,
      [id, userId],
    );

    return reply.send({
      contact: {
        id: contact.id,
        name: contact.name,
        avatarUrl: contact.avatar_url,
        phoneNumber: contact.phone_number,
        lastMessageAt: contact.last_message_at,
        relationship: {
          type: contact.relationship_type,
          importanceTier: contact.importance_tier,
          healthScore: contact.health_score,
          healthTrend: contact.health_trend,
          lastInteractionAt: contact.last_interaction_at,
          notes: contact.notes,
        },
        profile: contact.personality_summary ? {
          personalitySummary: contact.personality_summary,
          communicationStyle: contact.communication_style,
          emotionalPatterns: contact.emotional_patterns,
          knownTriggers: contact.known_triggers,
          currentLifeContext: contact.current_life_context,
          moodBaseline: contact.mood_baseline,
          updatedAt: contact.profile_updated_at,
        } : null,
        insights: insights.map((i: any) => ({
          key: i.insight_key,
          value: i.insight_value,
          confidence: i.confidence,
          supportingText: i.supporting_text,
          createdAt: i.created_at,
        })),
        healthHistory: healthLogs.map((h: any) => ({
          score: h.health_score,
          trend: h.health_trend,
          factors: h.factors,
          recordedAt: h.recorded_at,
        })),
        stats: {
          totalMessages: parseInt(msgStats?.total_messages || '0'),
          sent: parseInt(msgStats?.sent || '0'),
          received: parseInt(msgStats?.received || '0'),
        },
      },
    });
  });

  fastify.get('/api/contacts', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `SELECT
        co.id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS name,
        co.avatar_url,
        co.last_message_at,
        r.id AS relationship_id,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.importance_tier, 3) AS importance_tier,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.health_trend, 'stable') AS health_trend,
        r.last_interaction_at,
        cp.personality_summary,
        cp.mood_baseline
      FROM contacts co
      LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
      LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $1
      WHERE co.user_id = $1 AND co.is_group = false
      ORDER BY r.importance_tier ASC NULLS LAST, co.last_message_at DESC NULLS LAST
      LIMIT 200`,
      [userId],
    );

    return reply.send({
      contacts: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatar_url,
        lastMessageAt: r.last_message_at,
        relationship: {
          type: r.relationship_type,
          importanceTier: r.importance_tier,
          healthScore: r.health_score,
          healthTrend: r.health_trend,
          lastInteractionAt: r.last_interaction_at,
        },
        profile: r.personality_summary
          ? {
              personalitySummary: r.personality_summary,
              moodBaseline: r.mood_baseline,
            }
          : null,
      })),
    });
  });
}
