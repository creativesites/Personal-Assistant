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
      `SELECT rhl.health_score, rhl.previous_score, rhl.change_reason,
              rhl.contributing_factors, rhl.logged_at
       FROM relationship_health_logs rhl
       JOIN relationships r ON r.id = rhl.relationship_id
       WHERE r.contact_id = $1 AND r.user_id = $2
       ORDER BY rhl.logged_at DESC
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
          previousScore: h.previous_score,
          changeReason: h.change_reason,
          factors: h.contributing_factors,
          recordedAt: h.logged_at,
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

  fastify.get('/api/contacts/:id/clock', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows } = await db.query(
      `SELECT rc.id, rc.clock_type, rc.avg_days_between_messages,
              rc.std_dev_days, rc.peak_hours, rc.typical_day_of_week,
              rc.is_active, rc.is_manually_configured, rc.check_interval_days,
              rc.last_checked_at, rc.last_nudge_at, rc.next_check_at, rc.nudge_count,
              rc.created_at, rc.updated_at
       FROM relationship_clocks rc
       JOIN contacts co ON co.id = rc.contact_id
       WHERE rc.contact_id = $1 AND rc.user_id = $2 AND co.user_id = $2
       ORDER BY rc.clock_type ASC`,
      [id, userId],
    );

    return reply.send({
      clocks: rows.map((r: any) => ({
        id: r.id,
        clockType: r.clock_type,
        avgDaysBetweenMessages: r.avg_days_between_messages ? parseFloat(r.avg_days_between_messages) : null,
        stdDevDays: r.std_dev_days ? parseFloat(r.std_dev_days) : null,
        peakHours: r.peak_hours,
        isActive: r.is_active,
        isManuallyConfigured: r.is_manually_configured,
        checkIntervalDays: r.check_interval_days,
        lastCheckedAt: r.last_checked_at,
        lastNudgeAt: r.last_nudge_at,
        nextCheckAt: r.next_check_at,
        nudgeCount: r.nudge_count,
      })),
    });
  });

  fastify.put('/api/contacts/:id/clock/:clockType', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, clockType } = request.params as { id: string; clockType: string };
    const body = request.body as { isActive?: boolean; checkIntervalDays?: number };

    const validClockTypes = ['dormancy_watch', 'weekly_touchpoint', 'daily_checkin', 'post_event_followup'];
    if (!validClockTypes.includes(clockType)) {
      return reply.code(400).send({ error: 'Invalid clock type' });
    }

    const { rowCount } = await db.query(
      `UPDATE relationship_clocks
       SET is_active = COALESCE($3, is_active),
           check_interval_days = COALESCE($4, check_interval_days),
           is_manually_configured = TRUE,
           updated_at = NOW()
       WHERE contact_id = $1 AND user_id = $2 AND clock_type = $5`,
      [id, userId, body.isActive ?? null, body.checkIntervalDays ?? null, clockType],
    );

    if (!rowCount) return reply.code(404).send({ error: 'Clock not found' });
    return reply.send({ ok: true });
  });
}
