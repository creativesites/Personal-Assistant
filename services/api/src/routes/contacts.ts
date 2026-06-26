import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function contactsRoutes(fastify: FastifyInstance): Promise<void> {
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
