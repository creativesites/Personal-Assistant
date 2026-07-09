import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// ─── Memory transparency & bulk controls — Phase 5 of docs/MEMORY_ENGINE_PLAN.md ──
//
// Cross-cutting endpoints that don't belong to any single memory type's own
// route file (business-facts.ts, agents.ts's memories routes, contacts.ts's
// insights route): exporting everything at once, and clearing everything
// at once. Both operate across business_facts, contact_insights, and
// agent_memories — relationship_memory is included in export (read-only,
// derived data) but not clear-all, since it's recomputed automatically from
// message history rather than something a user "created" that needs undoing.

export async function memoryRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/memory/export ────────────────────────────────────────────────
  fastify.get(
    '/api/memory/export',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const [businessFacts, contactInsights, relationshipMemory, agentMemories] = await Promise.all([
        db.query(
          `SELECT category, fact_key, fact_value, confidence, evidence_count,
                  source, is_approved, created_at
           FROM business_facts WHERE user_id = $1 AND is_active = TRUE
           ORDER BY fact_key`,
          [userId],
        ),
        db.query(
          `SELECT ci.insight_key, ci.insight_value, ci.confidence, ci.supporting_text, ci.created_at,
                  COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
           FROM contact_insights ci
           JOIN contacts c ON c.id = ci.contact_id
           WHERE ci.user_id = $1 AND ci.is_active = TRUE
           ORDER BY contact_name, ci.confidence DESC`,
          [userId],
        ),
        db.query(
          `SELECT rm.outstanding_promises, rm.conversation_themes, rm.important_dates,
                  rm.missed_followups_count,
                  COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
           FROM relationship_memory rm
           JOIN contacts c ON c.id = rm.contact_id
           WHERE rm.user_id = $1`,
          [userId],
        ),
        db.query(
          `SELECT am.memory_type, am.memory_key, am.memory_value, am.situation, am.action_taken,
                  am.outcome, am.worked, am.confidence, am.evidence_count, am.created_at,
                  a.name AS agent_name,
                  COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
           FROM agent_memories am
           JOIN agents a ON a.id = am.agent_id
           LEFT JOIN contacts c ON c.id = am.contact_id
           WHERE am.user_id = $1 AND am.is_active = TRUE
           ORDER BY a.name, am.confidence DESC`,
          [userId],
        ),
      ])

      return reply.send({
        exportedAt: new Date().toISOString(),
        businessFacts: businessFacts.rows,
        contactInsights: contactInsights.rows,
        relationshipMemory: relationshipMemory.rows,
        agentMemories: agentMemories.rows,
      })
    },
  )

  // ── POST /api/memory/clear-all — soft-deletes every AI-generated memory
  //     across business facts, contact insights, and agent memories.
  //     Does not touch messages/conversations/contacts themselves, and does
  //     not touch relationship_memory (recomputed automatically, not user data). ──
  fastify.post(
    '/api/memory/clear-all',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const [facts, insights, agentMemories] = await Promise.all([
        db.query("UPDATE business_facts SET is_active = FALSE, is_approved = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE", [userId]),
        db.query('UPDATE contact_insights SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE', [userId]),
        db.query('UPDATE agent_memories SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE', [userId]),
      ])

      return reply.send({
        ok: true,
        cleared: {
          businessFacts: facts.rowCount ?? 0,
          contactInsights: insights.rowCount ?? 0,
          agentMemories: agentMemories.rowCount ?? 0,
        },
      })
    },
  )
}
