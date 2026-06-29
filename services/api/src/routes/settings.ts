import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET auto-response settings ────────────────────────────────────────────
  fastify.get('/api/settings/auto-response', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: [row] } = await db.query(
      `SELECT
         enabled, business_hours_start, business_hours_end, timezone, active_days,
         send_delay_seconds, approval_mode,
         respond_to_leads, respond_to_customers, respond_to_new_contacts,
         skip_groups, skip_broadcasts,
         escalation_keywords, escalation_notify_email,
         greeting_message, away_message,
         smart_followup_enabled, learn_from_corrections
       FROM auto_response_settings WHERE user_id = $1`,
      [userId],
    );

    if (!row) {
      return reply.send({
        enabled: false,
        businessHoursStart: '09:00',
        businessHoursEnd: '18:00',
        timezone: 'UTC',
        activeDays: [1, 2, 3, 4, 5],
        sendDelaySeconds: 30,
        approvalMode: 'preview',
        respondToLeads: true,
        respondToCustomers: true,
        respondToNewContacts: false,
        skipGroups: true,
        skipBroadcasts: true,
        escalationKeywords: [],
        escalationNotifyEmail: null,
        greetingMessage: null,
        awayMessage: null,
        smartFollowupEnabled: false,
        learnFromCorrections: true,
      });
    }

    return reply.send({
      enabled: row.enabled,
      businessHoursStart: row.business_hours_start,
      businessHoursEnd: row.business_hours_end,
      timezone: row.timezone,
      activeDays: row.active_days,
      sendDelaySeconds: row.send_delay_seconds,
      approvalMode: row.approval_mode,
      respondToLeads: row.respond_to_leads,
      respondToCustomers: row.respond_to_customers,
      respondToNewContacts: row.respond_to_new_contacts,
      skipGroups: row.skip_groups,
      skipBroadcasts: row.skip_broadcasts,
      escalationKeywords: row.escalation_keywords ?? [],
      escalationNotifyEmail: row.escalation_notify_email,
      greetingMessage: row.greeting_message,
      awayMessage: row.away_message,
      smartFollowupEnabled: row.smart_followup_enabled,
      learnFromCorrections: row.learn_from_corrections,
    });
  });

  // ── PUT auto-response settings ────────────────────────────────────────────
  fastify.put('/api/settings/auto-response', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as Record<string, unknown>;

    const validApprovalModes = ['auto', 'preview', 'manual'];
    if (body.approvalMode !== undefined && !validApprovalModes.includes(body.approvalMode as string)) {
      return reply.code(400).send({ error: 'Invalid approvalMode' });
    }

    await db.query(
      `INSERT INTO auto_response_settings (
         user_id, enabled, business_hours_start, business_hours_end, timezone, active_days,
         send_delay_seconds, approval_mode,
         respond_to_leads, respond_to_customers, respond_to_new_contacts,
         skip_groups, skip_broadcasts,
         escalation_keywords, escalation_notify_email,
         greeting_message, away_message,
         smart_followup_enabled, learn_from_corrections
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled                 = EXCLUDED.enabled,
         business_hours_start    = EXCLUDED.business_hours_start,
         business_hours_end      = EXCLUDED.business_hours_end,
         timezone                = EXCLUDED.timezone,
         active_days             = EXCLUDED.active_days,
         send_delay_seconds      = EXCLUDED.send_delay_seconds,
         approval_mode           = EXCLUDED.approval_mode,
         respond_to_leads        = EXCLUDED.respond_to_leads,
         respond_to_customers    = EXCLUDED.respond_to_customers,
         respond_to_new_contacts = EXCLUDED.respond_to_new_contacts,
         skip_groups             = EXCLUDED.skip_groups,
         skip_broadcasts         = EXCLUDED.skip_broadcasts,
         escalation_keywords     = EXCLUDED.escalation_keywords,
         escalation_notify_email = EXCLUDED.escalation_notify_email,
         greeting_message        = EXCLUDED.greeting_message,
         away_message            = EXCLUDED.away_message,
         smart_followup_enabled  = EXCLUDED.smart_followup_enabled,
         learn_from_corrections  = EXCLUDED.learn_from_corrections,
         updated_at              = NOW()`,
      [
        userId,
        body.enabled ?? false,
        body.businessHoursStart ?? '09:00',
        body.businessHoursEnd ?? '18:00',
        body.timezone ?? 'UTC',
        body.activeDays ?? [1, 2, 3, 4, 5],
        body.sendDelaySeconds ?? 30,
        body.approvalMode ?? 'preview',
        body.respondToLeads ?? true,
        body.respondToCustomers ?? true,
        body.respondToNewContacts ?? false,
        body.skipGroups ?? true,
        body.skipBroadcasts ?? true,
        body.escalationKeywords ?? [],
        body.escalationNotifyEmail ?? null,
        body.greetingMessage ?? null,
        body.awayMessage ?? null,
        body.smartFollowupEnabled ?? false,
        body.learnFromCorrections ?? true,
      ],
    );

    return reply.send({ ok: true });
  });
}
