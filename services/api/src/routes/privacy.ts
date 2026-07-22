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
}
