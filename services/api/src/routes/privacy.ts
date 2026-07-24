import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';

const INTELLIGENCE_URL = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';

export async function privacyRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/privacy/assistant ─────────────────────────────────────────────
  fastify.get(
    '/api/privacy/assistant',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        const response = await fetch(`${INTELLIGENCE_URL}/internal/relationship-health/privacy-assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        if (!response.ok) {
          throw new Error(`Intelligence service returned status ${response.status}`);
        }

        const data = await response.json();
        return reply.send(data);
      } catch (err) {
        fastify.log.error(err, 'Error calling privacy-assistant microservice');
        return reply.code(500).send({ error: 'Failed to run AI privacy detection' });
      }
    }
  );

  // ── POST /api/privacy/bulk-apply ───────────────────────────────────────────
  fastify.post(
    '/api/privacy/bulk-apply',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { contactIds } = request.body as { contactIds: string[] };

      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return reply.code(400).send({ error: 'contactIds must be a non-empty array' });
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Update contacts privacy settings
        const defaultPrivateSettings = JSON.stringify({
          analyze_messages: false,
          generate_replies: false,
          store_intelligence: false,
          relationship_analysis: false,
        });

        await client.query(
          `UPDATE contacts
           SET privacy_settings = $1::jsonb
           WHERE id = ANY($2::uuid[]) AND user_id = $3`,
          [defaultPrivateSettings, contactIds, userId]
        );

        // Update relationships configuration
        await client.query(
          `UPDATE relationships
           SET relationship_category = 'personal',
               privacy_level = 'strict',
               analysis_mode = 'none',
               updated_at = NOW()
           WHERE contact_id = ANY($1::uuid[]) AND user_id = $2`,
          [contactIds, userId]
        );

        await client.query('COMMIT');
        return reply.send({ ok: true, count: contactIds.length });
      } catch (err) {
        await client.query('ROLLBACK');
        fastify.log.error(err, 'Error running bulk privacy apply');
        return reply.code(500).send({ error: 'Failed to bulk apply privacy settings' });
      } finally {
        client.release();
      }
    }
  );

  // ── PUT /api/contacts/:id/privacy-settings ─────────────────────────────────
  fastify.put(
    '/api/contacts/:id/privacy-settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id: contactId } = request.params as { id: string };
      const {
        relationshipCategory,
        privacyLevel,
        analysisMode,
        privacySettings,
      } = request.body as {
        relationshipCategory?: string;
        privacyLevel?: string;
        analysisMode?: string;
        privacySettings?: {
          analyze_messages?: boolean;
          generate_replies?: boolean;
          store_intelligence?: boolean;
          relationship_analysis?: boolean;
        };
      };

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // 1. Check contact ownership
        const { rows: [contact] } = await client.query(
          `SELECT id, privacy_settings FROM contacts WHERE id = $1 AND user_id = $2`,
          [contactId, userId]
        );

        if (!contact) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Contact not found' });
        }

        // 2. Update contact privacy settings
        if (privacySettings) {
          const mergedSettings = {
            ...contact.privacy_settings,
            ...privacySettings,
          };
          await client.query(
            `UPDATE contacts
             SET privacy_settings = $1::jsonb
             WHERE id = $2`,
            [JSON.stringify(mergedSettings), contactId]
          );
        }

        // 3. Update relationship details if provided
        if (relationshipCategory || privacyLevel || analysisMode) {
          const updates: string[] = [];
          const params: any[] = [];
          let paramIdx = 1;

          if (relationshipCategory) {
            updates.push(`relationship_category = $${paramIdx++}`);
            params.push(relationshipCategory);
          }
          if (privacyLevel) {
            updates.push(`privacy_level = $${paramIdx++}`);
            params.push(privacyLevel);
          }
          if (analysisMode) {
            updates.push(`analysis_mode = $${paramIdx++}`);
            params.push(analysisMode);
          }

          params.push(contactId);
          params.push(userId);
          const contactIdParamIdx = paramIdx++;
          const userIdParamIdx = paramIdx++;

          await client.query(
            `UPDATE relationships
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE contact_id = $${contactIdParamIdx} AND user_id = $${userIdParamIdx}`,
            params
          );
        }

        await client.query('COMMIT');

        // Fetch updated data to return
        const { rows: [updatedContact] } = await db.query(
          `SELECT c.id, c.privacy_settings, r.relationship_category, r.privacy_level, r.analysis_mode
           FROM contacts c
           LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = c.user_id
           WHERE c.id = $1`,
          [contactId]
        );

        return reply.send({
          ok: true,
          contact: {
            id: updatedContact.id,
            privacySettings: updatedContact.privacy_settings,
            relationshipCategory: updatedContact.relationship_category,
            privacyLevel: updatedContact.privacy_level,
            analysisMode: updatedContact.analysis_mode,
          },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        fastify.log.error(err, 'Error updating contact privacy settings');
        return reply.code(500).send({ error: 'Failed to update privacy settings' });
      } finally {
        client.release();
      }
    }
  );

  // ── GET /api/export/contacts.csv ───────────────────────────────────────────
  fastify.get(
    '/api/export/contacts.csv',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `SELECT id, COALESCE(custom_name, display_name, phone_number) AS name, phone_number,
                COALESCE(lead_score, 0) AS lead_score, COALESCE(pipeline_stage, 'lead') AS pipeline_stage,
                COALESCE(role, 'contact') AS role, created_at
         FROM contacts
         WHERE user_id = $1 AND is_active = TRUE
         ORDER BY created_at DESC`,
        [userId]
      );

      const header = 'ID,Name,Phone Number,Lead Score,Pipeline Stage,Role,Created At\n';
      const csvRows = rows.map(r => {
        const cleanName = `"${(r.name || '').replace(/"/g, '""')}"`;
        const cleanPhone = `"${(r.phone_number || '').replace(/"/g, '""')}"`;
        return `${r.id},${cleanName},${cleanPhone},${r.lead_score},${r.pipeline_stage},${r.role},${r.created_at}`;
      }).join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="zuri_contacts.csv"');
      return reply.send(header + csvRows);
    }
  );

  // ── GET /api/export/conversations.csv ──────────────────────────────────────
  fastify.get(
    '/api/export/conversations.csv',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows } = await db.query(
        `SELECT c.id, COALESCE(ct.custom_name, ct.display_name, ct.phone_number) AS contact_name,
                ct.phone_number, c.unread_count, c.last_message_preview, c.last_message_at,
                c.assigned_user_id, c.created_at
         FROM conversations c
         LEFT JOIN contacts ct ON ct.id = c.contact_id
         WHERE c.user_id = $1
         ORDER BY c.last_message_at DESC NULLS LAST`,
        [userId]
      );

      const header = 'Conversation ID,Contact Name,Phone Number,Unread Count,Last Message Preview,Last Message At,Assigned User ID,Created At\n';
      const csvRows = rows.map(r => {
        const cleanName = `"${(r.contact_name || '').replace(/"/g, '""')}"`;
        const cleanPhone = `"${(r.phone_number || '').replace(/"/g, '""')}"`;
        const cleanPreview = `"${(r.last_message_preview || '').replace(/"/g, '""')}"`;
        return `${r.id},${cleanName},${cleanPhone},${r.unread_count || 0},${cleanPreview},${r.last_message_at || ''},${r.assigned_user_id || ''},${r.created_at}`;
      }).join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="zuri_conversations.csv"');
      return reply.send(header + csvRows);
    }
  );

  // ── GET /api/export/full-workspace ──────────────────────────────────────────
  fastify.get(
    '/api/export/full-workspace',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const [
        userRes,
        contactsRes,
        conversationsRes,
        documentsRes,
        businessFactsRes,
        insightsRes,
        catalogRes
      ] = await Promise.all([
        db.query(`SELECT id, email, full_name, mode, created_at FROM users WHERE id = $1`, [userId]),
        db.query(`SELECT id, custom_name, display_name, phone_number, lead_score, pipeline_stage, role, created_at FROM contacts WHERE user_id = $1 AND is_active = TRUE`, [userId]),
        db.query(`SELECT id, contact_id, unread_count, last_message_preview, last_message_at, created_at FROM conversations WHERE user_id = $1`, [userId]),
        db.query(`SELECT id, doc_type, doc_number, title, total_amount, currency, status, created_at FROM documents WHERE user_id = $1`, [userId]),
        db.query(`SELECT fact_key, fact_value, category, confidence FROM business_facts WHERE user_id = $1 AND is_active = TRUE`, [userId]),
        db.query(`SELECT insight_key, insight_value, supporting_text FROM contact_insights WHERE user_id = $1 AND is_active = TRUE`, [userId]),
        db.query(`SELECT name, sku, price, currency, category FROM products WHERE user_id = $1`, [userId])
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        user: userRes.rows[0] || null,
        contacts: contactsRes.rows,
        conversations: conversationsRes.rows,
        documents: documentsRes.rows,
        business_facts: businessFactsRes.rows,
        contact_insights: insightsRes.rows,
        catalog_products: catalogRes.rows
      };

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', 'attachment; filename="zuri_workspace_export.json"');
      return reply.send(JSON.stringify(payload, null, 2));
    }
  );

  // ── POST /api/privacy/delete-account-request ─────────────────────────────
  fastify.post(
    '/api/privacy/delete-account-request',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future

      await db.query(
        `UPDATE users SET scheduled_deletion_at = $1 WHERE id = $2`,
        [scheduledAt.toISOString(), userId]
      );

      return reply.send({
        ok: true,
        message: 'Account and workspace data scheduled for permanent deletion.',
        scheduledDeletionAt: scheduledAt.toISOString(),
        gracePeriodDays: 7
      });
    }
  );

  // ── POST /api/privacy/cancel-account-deletion ────────────────────────────
  fastify.post(
    '/api/privacy/cancel-account-deletion',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      await db.query(
        `UPDATE users SET scheduled_deletion_at = NULL WHERE id = $1`,
        [userId]
      );

      return reply.send({
        ok: true,
        message: 'Account deletion request canceled successfully. Your workspace remains active.'
      });
    }
  );

  // ── GET /api/privacy/account-status ──────────────────────────────────────
  fastify.get(
    '/api/privacy/account-status',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [user] } = await db.query<{ scheduled_deletion_at: string | null }>(
        `SELECT scheduled_deletion_at FROM users WHERE id = $1`,
        [userId]
      );

      const scheduledAt = user?.scheduled_deletion_at ? new Date(user.scheduled_deletion_at) : null;
      const isScheduled = !!scheduledAt && scheduledAt > new Date();
      const daysRemaining = scheduledAt ? Math.max(0, Math.ceil((scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

      return reply.send({
        isScheduled,
        scheduledDeletionAt: scheduledAt?.toISOString() || null,
        daysRemaining
      });
    }
  );
}
