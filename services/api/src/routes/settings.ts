import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { config } from '../config';
import { authenticate } from '../plugins/authenticate';
import { publishInboxEvent } from '../lib/inbox-events';

const RULE_TYPES = ['relationship_type', 'tag', 'customer_status'] as const;

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
         smart_followup_enabled, learn_from_corrections,
         inclusion_mode
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
        inclusionMode: false,
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
      inclusionMode: row.inclusion_mode,
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

    // Partial PUTs (e.g. the Inbox toggle sending only `{ enabled }`) must not
    // wipe everything else back to defaults. Pass through `undefined` as NULL
    // and let SQL fall back to the existing stored value first, the hardcoded
    // default only on a genuinely first-ever row — never JS `?? default`
    // before the query runs, which is what caused the bug this replaces.
    await db.query(
      `INSERT INTO auto_response_settings (
         user_id, enabled, business_hours_start, business_hours_end, timezone, active_days,
         send_delay_seconds, approval_mode,
         respond_to_leads, respond_to_customers, respond_to_new_contacts,
         skip_groups, skip_broadcasts,
         escalation_keywords, escalation_notify_email,
         greeting_message, away_message,
         smart_followup_enabled, learn_from_corrections,
         inclusion_mode
       ) VALUES (
         $1,
         COALESCE($2, false),
         COALESCE($3::time, '09:00'::time),
         COALESCE($4::time, '18:00'::time),
         COALESCE($5, 'UTC'),
         COALESCE($6, ARRAY[1,2,3,4,5]),
         COALESCE($7, 30),
         COALESCE($8, 'preview'),
         COALESCE($9, true),
         COALESCE($10, true),
         COALESCE($11, false),
         COALESCE($12, true),
         COALESCE($13, true),
         COALESCE($14, ARRAY[]::text[]),
         $15,
         $16,
         $17,
         COALESCE($18, false),
         COALESCE($19, true),
         COALESCE($20, false)
       )
       ON CONFLICT (user_id) DO UPDATE SET
         enabled                 = COALESCE($2, auto_response_settings.enabled),
         business_hours_start    = COALESCE($3::time, auto_response_settings.business_hours_start),
         business_hours_end      = COALESCE($4::time, auto_response_settings.business_hours_end),
         timezone                = COALESCE($5, auto_response_settings.timezone),
         active_days             = COALESCE($6, auto_response_settings.active_days),
         send_delay_seconds      = COALESCE($7, auto_response_settings.send_delay_seconds),
         approval_mode           = COALESCE($8, auto_response_settings.approval_mode),
         respond_to_leads        = COALESCE($9, auto_response_settings.respond_to_leads),
         respond_to_customers    = COALESCE($10, auto_response_settings.respond_to_customers),
         respond_to_new_contacts = COALESCE($11, auto_response_settings.respond_to_new_contacts),
         skip_groups             = COALESCE($12, auto_response_settings.skip_groups),
         skip_broadcasts         = COALESCE($13, auto_response_settings.skip_broadcasts),
         escalation_keywords     = COALESCE($14, auto_response_settings.escalation_keywords),
         escalation_notify_email = COALESCE($15, auto_response_settings.escalation_notify_email),
         greeting_message        = COALESCE($16, auto_response_settings.greeting_message),
         away_message            = COALESCE($17, auto_response_settings.away_message),
         smart_followup_enabled  = COALESCE($18, auto_response_settings.smart_followup_enabled),
         learn_from_corrections  = COALESCE($19, auto_response_settings.learn_from_corrections),
         inclusion_mode          = COALESCE($20, auto_response_settings.inclusion_mode),
         updated_at              = NOW()`,
      [
        userId,
        body.enabled ?? null,
        body.businessHoursStart ?? null,
        body.businessHoursEnd ?? null,
        body.timezone ?? null,
        body.activeDays ?? null,
        body.sendDelaySeconds ?? null,
        body.approvalMode ?? null,
        body.respondToLeads ?? null,
        body.respondToCustomers ?? null,
        body.respondToNewContacts ?? null,
        body.skipGroups ?? null,
        body.skipBroadcasts ?? null,
        body.escalationKeywords ?? null,
        body.escalationNotifyEmail ?? null,
        body.greetingMessage ?? null,
        body.awayMessage ?? null,
        body.smartFollowupEnabled ?? null,
        body.learnFromCorrections ?? null,
        body.inclusionMode ?? null,
      ],
    );

    await publishInboxEvent(userId, 'agent:default-updated', {});

    return reply.send({ ok: true });
  });

  // ── Auto-reply exclusions (docs/AUTO_REPLY_AGENTS_PLAN.md §4) ────────────
  // Two independent lists, both consulted by
  // AutoResponseService.check_eligibility() for every trust level:
  //   - explicit per-contact opt-outs (auto_reply_exclusions)
  //   - rule-based opt-outs matched against relationship_type/tag/customer_status
  //     (auto_reply_exclusion_rules)

  fastify.get('/api/settings/auto-response/exclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: contacts } = await db.query(
      `SELECT e.id, e.contact_id, e.reason, e.created_at,
              COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
              c.avatar_url
       FROM auto_reply_exclusions e
       JOIN contacts c ON c.id = e.contact_id
       WHERE e.user_id = $1
       ORDER BY e.created_at DESC`,
      [userId],
    );

    const { rows: rules } = await db.query(
      `SELECT id, rule_type, rule_value, source_text, created_at
       FROM auto_reply_exclusion_rules
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return reply.send({
      contacts: contacts.map((r: any) => ({
        id: r.id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        avatarUrl: r.avatar_url,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      rules: rules.map((r: any) => ({
        id: r.id,
        ruleType: r.rule_type,
        ruleValue: r.rule_value,
        sourceText: r.source_text,
        createdAt: r.created_at,
      })),
    });
  });

  fastify.post('/api/settings/auto-response/exclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      contactId: z.string().uuid().optional(),
      contactIds: z.array(z.string().uuid()).optional(),
      reason: z.string().max(500).optional(),
    }).parse(request.body);

    const contactIds = body.contactIds || (body.contactId ? [body.contactId] : []);
    if (contactIds.length === 0) {
      return reply.code(400).send({ error: 'No contactId or contactIds provided' });
    }

    const ids: string[] = [];
    for (const cId of contactIds) {
      const { rows: [contact] } = await db.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [cId, userId],
      );
      if (!contact) continue;

      const { rows: [row] } = await db.query(
        `INSERT INTO auto_reply_exclusions (user_id, contact_id, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, contact_id) DO UPDATE SET reason = EXCLUDED.reason
         RETURNING id`,
        [userId, cId, body.reason ?? null],
      );
      ids.push(row.id);
    }

    return reply.code(201).send({ ids, id: ids[0] });
  });

  fastify.delete('/api/settings/auto-response/exclusions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query('DELETE FROM auto_reply_exclusions WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.send({ ok: true });
  });

  // ── Auto-reply inclusions ───────────────────────────
  fastify.get('/api/settings/auto-response/inclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: contacts } = await db.query(
      `SELECT i.id, i.contact_id, i.created_at,
              COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
              c.avatar_url
       FROM auto_reply_inclusions i
       JOIN contacts c ON c.id = i.contact_id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC`,
      [userId],
    );

    return reply.send({
      contacts: contacts.map((r: any) => ({
        id: r.id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        avatarUrl: r.avatar_url,
        createdAt: r.created_at,
      })),
    });
  });

  fastify.post('/api/settings/auto-response/inclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      contactId: z.string().uuid().optional(),
      contactIds: z.array(z.string().uuid()).optional(),
    }).parse(request.body);

    const contactIds = body.contactIds || (body.contactId ? [body.contactId] : []);
    if (contactIds.length === 0) {
      return reply.code(400).send({ error: 'No contactId or contactIds provided' });
    }

    const ids: string[] = [];
    for (const cId of contactIds) {
      const { rows: [contact] } = await db.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [cId, userId],
      );
      if (!contact) continue;

      const { rows: [row] } = await db.query(
        `INSERT INTO auto_reply_inclusions (user_id, contact_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, contact_id) DO NOTHING
         RETURNING id`,
        [userId, cId],
      );
      if (row) ids.push(row.id);
    }

    return reply.code(201).send({ ids, id: ids[0] });
  });

  fastify.delete('/api/settings/auto-response/inclusions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query('DELETE FROM auto_reply_inclusions WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.send({ ok: true });
  });

  // ── Privacy exclusions ──────────────────────────────
  fastify.get('/api/settings/privacy/exclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: contacts } = await db.query(
      `SELECT p.id, p.contact_id, p.created_at,
              COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
              c.avatar_url
       FROM privacy_exclusions p
       JOIN contacts c ON c.id = p.contact_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId],
    );

    return reply.send({
      contacts: contacts.map((r: any) => ({
        id: r.id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        avatarUrl: r.avatar_url,
        createdAt: r.created_at,
      })),
    });
  });

  fastify.post('/api/settings/privacy/exclusions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      contactId: z.string().uuid().optional(),
      contactIds: z.array(z.string().uuid()).optional(),
    }).parse(request.body);

    const contactIds = body.contactIds || (body.contactId ? [body.contactId] : []);
    if (contactIds.length === 0) {
      return reply.code(400).send({ error: 'No contactId or contactIds provided' });
    }

    const ids: string[] = [];
    for (const cId of contactIds) {
      const { rows: [contact] } = await db.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [cId, userId],
      );
      if (!contact) continue;

      const { rows: [row] } = await db.query(
        `INSERT INTO privacy_exclusions (user_id, contact_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, contact_id) DO NOTHING
         RETURNING id`,
        [userId, cId],
      );
      if (row) ids.push(row.id);
    }

    return reply.code(201).send({ ids, id: ids[0] });
  });

  fastify.delete('/api/settings/privacy/exclusions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query('DELETE FROM privacy_exclusions WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.send({ ok: true });
  });

  fastify.post('/api/settings/auto-response/exclusion-rules', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      ruleType: z.enum(RULE_TYPES),
      ruleValue: z.string().min(1).max(100),
      sourceText: z.string().max(2000).optional(),
    }).parse(request.body);

    const { rows: [row] } = await db.query(
      `INSERT INTO auto_reply_exclusion_rules (user_id, rule_type, rule_value, source_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, rule_type, rule_value) DO UPDATE SET source_text = EXCLUDED.source_text
       RETURNING id`,
      [userId, body.ruleType, body.ruleValue, body.sourceText ?? null],
    );

    return reply.code(201).send({ id: row.id });
  });

  fastify.delete('/api/settings/auto-response/exclusion-rules/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query('DELETE FROM auto_reply_exclusion_rules WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.send({ ok: true });
  });

  // Preview how many contacts a rule would currently match, without saving —
  // shown before confirming a plain-English instruction (plan §4).
  fastify.get('/api/settings/auto-response/exclusion-rules/preview', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { ruleType, ruleValue } = z.object({
      ruleType: z.enum(RULE_TYPES),
      ruleValue: z.string().min(1).max(100),
    }).parse(request.query);

    let countQuery: string;
    if (ruleType === 'relationship_type') {
      countQuery = `SELECT COUNT(*) AS count FROM relationships WHERE user_id = $1 AND relationship_type ILIKE $2`;
    } else if (ruleType === 'tag') {
      countQuery = `SELECT COUNT(DISTINCT contact_id) AS count FROM contact_tags WHERE user_id = $1 AND tag ILIKE $2`;
    } else {
      countQuery = `SELECT COUNT(*) AS count FROM contacts WHERE user_id = $1 AND customer_status = $2`;
    }

    const { rows: [{ count }] } = await db.query<{ count: string }>(countQuery, [userId, ruleValue]);
    return reply.send({ matchCount: parseInt(count, 10) });
  });

  // Plain-English instruction -> parsed rule/contact, preview only (plan §4).
  fastify.post('/api/settings/auto-response/exclusions/parse', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { instruction } = z.object({ instruction: z.string().min(3).max(500) }).parse(request.body);

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/auto-reply/parse-exclusion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, instruction }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Failed to parse instruction' });
      const data = await res.json() as
        | { type: 'contact'; contactId: string; contactName: string }
        | { type: 'rule'; ruleType: string; ruleValue: string; matchCount: number }
        | { type: 'unknown' };
      return reply.send(data);
    } catch (err) {
      fastify.log.error({ err }, 'exclusion_parse_error');
      return reply.code(502).send({ error: 'Failed to parse instruction' });
    }
  });
}
