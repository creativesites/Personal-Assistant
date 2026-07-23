import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { requireFeature } from '../lib/entitlements';

const gate = [authenticate, requireFeature('enterprise_api')];

const createWebhookBody = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  secret: z.string().max(255).optional(),
  events: z.array(z.string().min(1)).min(1),
});

const updateWebhookBody = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  secret: z.string().max(255).nullable().optional(),
  events: z.array(z.string().min(1)).optional(),
  is_active: z.boolean().optional(),
});

const createApiKeyBody = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string().min(1)).min(1),
});

const dataRetentionBody = z.object({
  raw_messages_days: z.number().int().min(1).max(3650),
  message_analyses_days: z.number().int().min(1).max(3650),
  // 0 = keep forever, per the column's meaning in db/migrations/0019_enterprise.sql
  contact_insights_days: z.number().int().min(0).max(3650),
  ai_suggestions_days: z.number().int().min(1).max(3650),
});

const whiteLabelBody = z.object({
  brand_name: z.string().min(1).max(255),
  logo_url: z.string().url().optional(),
  primary_color: z.string().max(20).optional(),
  custom_domain: z.string().max(255).optional(),
  brand_voice_lock: z.boolean().optional(),
});

const crmConnectBody = z.object({
  provider: z.string().min(1).max(100),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_expires_at: z.string().datetime().optional(),
  workspace_id: z.string().optional(),
});

const byokBody = z.object({
  provider: z.string().min(1).max(100),
  api_key: z.string().min(1),
});

export async function enterpriseRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Webhooks ──────────────────────────────────────────────────────────────────

  // GET /api/webhooks — list webhooks for user
  fastify.get(
    '/api/webhooks',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `SELECT id, name, url, events, is_active, created_at, updated_at
         FROM webhooks
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      );

      return reply.send({ webhooks: rows });
    },
  );

  // POST /api/webhooks — create a webhook
  fastify.post(
    '/api/webhooks',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof createWebhookBody>;
      try {
        body = createWebhookBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [webhook] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO webhooks (user_id, name, url, secret, events)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [userId, body.name, body.url, body.secret ?? null, JSON.stringify(body.events)],
      );

      return reply.code(201).send({ webhook: { id: webhook.id, createdAt: webhook.created_at } });
    },
  );

  // PATCH /api/webhooks/:id — update a webhook
  fastify.patch(
    '/api/webhooks/:id',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      let body: z.infer<typeof updateWebhookBody>;
      try {
        body = updateWebhookBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name); }
      if (body.url !== undefined) { updates.push(`url = $${idx++}`); values.push(body.url); }
      if (body.secret !== undefined) { updates.push(`secret = $${idx++}`); values.push(body.secret); }
      if (body.events !== undefined) { updates.push(`events = $${idx++}`); values.push(JSON.stringify(body.events)); }
      if (body.is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(body.is_active); }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      values.push(id, userId);

      const { rows: [updated] } = await db.query(
        `UPDATE webhooks SET ${updates.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING id, name, url, events, is_active, updated_at`,
        values,
      );
      if (!updated) return reply.code(404).send({ error: 'Webhook not found' });

      return reply.send({ webhook: updated });
    },
  );

  // DELETE /api/webhooks/:id — delete a webhook
  fastify.delete(
    '/api/webhooks/:id',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rowCount } = await db.query(
        `DELETE FROM webhooks WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!rowCount) return reply.code(404).send({ error: 'Webhook not found' });

      return reply.send({ ok: true });
    },
  );

  // GET /api/webhooks/:id/deliveries — recent deliveries (last 50)
  fastify.get(
    '/api/webhooks/:id/deliveries',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [webhook] } = await db.query(
        `SELECT id FROM webhooks WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!webhook) return reply.code(404).send({ error: 'Webhook not found' });

      const { rows } = await db.query(
        `SELECT id, event_type, status_code, response_body, error_message, created_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [id],
      );

      return reply.send({ deliveries: rows });
    },
  );

  // POST /api/webhooks/:id/test — send a test ping payload
  fastify.post(
    '/api/webhooks/:id/test',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [webhook] } = await db.query<{ url: string; secret: string | null }>(
        `SELECT url, secret FROM webhooks WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!webhook) return reply.code(404).send({ error: 'Webhook not found' });

      const payload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test ping from Zuri.' },
      };

      const payloadStr = JSON.stringify(payload);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (webhook.secret) {
        const sig = crypto.createHmac('sha256', webhook.secret).update(payloadStr).digest('hex');
        headers['X-Zuri-Signature'] = `sha256=${sig}`;
      }

      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let errorMessage: string | null = null;

      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadStr,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        responseBody = await res.text().catch(() => null);
      } catch (err: any) {
        errorMessage = err.message;
      }

      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, status_code, response_body, error_message)
         VALUES ($1, 'webhook.test', $2, $3, $4)`,
        [id, statusCode, responseBody, errorMessage],
      );

      return reply.send({
        ok: !errorMessage && statusCode !== null && statusCode < 400,
        statusCode,
        errorMessage,
      });
    },
  );

  // ─── API Keys ──────────────────────────────────────────────────────────────────

  // GET /api/api-keys — list API keys (never return key_hash)
  fastify.get(
    '/api/api-keys',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `SELECT id, name, key_prefix, scopes, last_used_at, created_at
         FROM api_keys
         WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [userId],
      );

      return reply.send({ apiKeys: rows });
    },
  );

  // POST /api/api-keys — create an API key
  fastify.post(
    '/api/api-keys',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof createApiKeyBody>;
      try {
        body = createApiKeyBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Generate key: 'zuri_live_' + 32 hex chars
      const suffix = crypto.randomBytes(16).toString('hex');
      const fullKey = `zuri_live_${suffix}`;
      const keyPrefix = fullKey.slice(0, 16); // 'zuri_live_' + first 6 hex chars

      // Store bcrypt hash of the full key
      const keyHash = await bcrypt.hash(fullKey, 10);

      const { rows: [apiKey] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [userId, body.name, keyHash, keyPrefix, JSON.stringify(body.scopes)],
      );

      // Return the full key ONCE — it cannot be retrieved again
      return reply.code(201).send({
        apiKey: {
          id: apiKey.id,
          name: body.name,
          key: fullKey,
          keyPrefix,
          scopes: body.scopes,
          createdAt: apiKey.created_at,
        },
        warning: 'Store this key securely — it will not be shown again.',
      });
    },
  );

  // DELETE /api/api-keys/:id — revoke an API key
  fastify.delete(
    '/api/api-keys/:id',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rowCount } = await db.query(
        `UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [id, userId],
      );
      if (!rowCount) return reply.code(404).send({ error: 'API key not found' });

      return reply.send({ ok: true });
    },
  );

  // ─── Data Retention ────────────────────────────────────────────────────────────

  // GET /api/data-retention — get user's retention policy (or defaults if not set)
  fastify.get(
    '/api/data-retention',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [policy] } = await db.query(
        `SELECT raw_messages_days, message_analyses_days, contact_insights_days, ai_suggestions_days, updated_at
         FROM data_retention_policies
         WHERE user_id = $1`,
        [userId],
      );

      // Return policy or sensible defaults — must match the column defaults
      // in db/migrations/0019_enterprise.sql, not values that happen to look
      // plausible (these were previously swapped/wrong).
      return reply.send({
        policy: policy ?? {
          raw_messages_days: 365,
          message_analyses_days: 730,
          contact_insights_days: 0,
          ai_suggestions_days: 180,
          updated_at: null,
        },
        isDefault: !policy,
      });
    },
  );

  // PUT /api/data-retention — upsert retention policy
  fastify.put(
    '/api/data-retention',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof dataRetentionBody>;
      try {
        body = dataRetentionBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [policy] } = await db.query(
        `INSERT INTO data_retention_policies
           (user_id, raw_messages_days, message_analyses_days, contact_insights_days, ai_suggestions_days)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE
           SET raw_messages_days = EXCLUDED.raw_messages_days,
               message_analyses_days = EXCLUDED.message_analyses_days,
               contact_insights_days = EXCLUDED.contact_insights_days,
               ai_suggestions_days = EXCLUDED.ai_suggestions_days,
               updated_at = NOW()
         RETURNING raw_messages_days, message_analyses_days, contact_insights_days, ai_suggestions_days, updated_at`,
        [
          userId,
          body.raw_messages_days,
          body.message_analyses_days,
          body.contact_insights_days,
          body.ai_suggestions_days,
        ],
      );

      return reply.send({ policy });
    },
  );

  // ─── White Label ───────────────────────────────────────────────────────────────

  // GET /api/whitelabel — get white-label config (or null)
  fastify.get(
    '/api/whitelabel',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [config] } = await db.query(
        `SELECT brand_name, logo_url, primary_color, custom_domain, brand_voice_lock, updated_at
         FROM whitelabel_configs
         WHERE user_id = $1`,
        [userId],
      );

      return reply.send({ config: config ?? null });
    },
  );

  // PUT /api/whitelabel — upsert white-label config
  fastify.put(
    '/api/whitelabel',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof whiteLabelBody>;
      try {
        body = whiteLabelBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [cfg] } = await db.query(
        `INSERT INTO whitelabel_configs (user_id, brand_name, logo_url, primary_color, custom_domain, brand_voice_lock)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE
           SET brand_name = EXCLUDED.brand_name,
               logo_url = EXCLUDED.logo_url,
               primary_color = EXCLUDED.primary_color,
               custom_domain = EXCLUDED.custom_domain,
               brand_voice_lock = EXCLUDED.brand_voice_lock,
               updated_at = NOW()
         RETURNING brand_name, logo_url, primary_color, custom_domain, brand_voice_lock, updated_at`,
        [
          userId,
          body.brand_name,
          body.logo_url ?? null,
          body.primary_color ?? null,
          body.custom_domain ?? null,
          body.brand_voice_lock ?? false,
        ],
      );

      return reply.send({ config: cfg });
    },
  );

  // ─── CRM Integrations ──────────────────────────────────────────────────────────

  // GET /api/crm — list active CRM integrations (never return tokens)
  fastify.get(
    '/api/crm',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `SELECT id, provider, workspace_id, token_expires_at, is_active, created_at, updated_at
         FROM crm_integrations
         WHERE user_id = $1 AND is_active = true
         ORDER BY provider ASC`,
        [userId],
      );

      return reply.send({ integrations: rows });
    },
  );

  // POST /api/crm/connect — connect a CRM
  fastify.post(
    '/api/crm/connect',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof crmConnectBody>;
      try {
        body = crmConnectBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [integration] } = await db.query<{ id: string; updated_at: string }>(
        `INSERT INTO crm_integrations
           (user_id, provider, access_token, refresh_token, token_expires_at, workspace_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (user_id, provider) DO UPDATE
           SET access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               token_expires_at = EXCLUDED.token_expires_at,
               workspace_id = EXCLUDED.workspace_id,
               is_active = true,
               updated_at = NOW()
         RETURNING id, updated_at`,
        [
          userId,
          body.provider,
          body.access_token,
          body.refresh_token ?? null,
          body.token_expires_at ?? null,
          body.workspace_id ?? null,
        ],
      );

      return reply.code(201).send({ integration: { id: integration.id, updatedAt: integration.updated_at } });
    },
  );

  // DELETE /api/crm/:provider — disconnect a CRM (soft delete)
  fastify.delete(
    '/api/crm/:provider',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { provider } = request.params as { provider: string };

      const { rowCount } = await db.query(
        `UPDATE crm_integrations SET is_active = false, updated_at = NOW()
         WHERE user_id = $1 AND provider = $2 AND is_active = true`,
        [userId, provider],
      );
      if (!rowCount) return reply.code(404).send({ error: 'CRM integration not found' });

      return reply.send({ ok: true });
    },
  );

  // ─── BYOK (Bring Your Own Key) ─────────────────────────────────────────────────
  // Note: Old base64 BYOK endpoints have been removed to avoid route collision.
  // The new cryptographically secure BYOK routing system is fully implemented in routes/byok.ts.
}

