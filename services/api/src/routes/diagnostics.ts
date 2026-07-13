import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Distinguishes "the AI pipeline isn't running/succeeding" from "this page
// has a bug" — every /analytics ("Intelligence") page depends on
// message_analyses/contact_profiles/opportunities actually being populated
// by the intelligence service's per-message LLM pass. If totalMessages is
// high but analyzedMessages is 0, that's an LLM/worker outage, not a query bug.
export async function diagnosticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/diagnostics/ai-pipeline', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const [messageStats, contactStats, opportunityCount] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total_messages,
           COUNT(ma.id) AS analyzed_messages,
           MAX(ma.analyzed_at) AS last_analyzed_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN message_analyses ma ON ma.message_id = m.id
         WHERE c.user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT
           COUNT(DISTINCT co.id) AS total_contacts,
           COUNT(DISTINCT cp.contact_id) AS contacts_with_profile
         FROM contacts co
         LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $1
         WHERE co.user_id = $1 AND co.is_group = false AND co.archived_at IS NULL`,
        [userId],
      ),
      db.query(`SELECT COUNT(*) AS count FROM opportunities WHERE user_id = $1`, [userId]),
    ])

    const m = messageStats.rows[0]
    const c = contactStats.rows[0]
    const totalMessages = parseInt(m.total_messages, 10)
    const analyzedMessages = parseInt(m.analyzed_messages, 10)
    const totalContacts = parseInt(c.total_contacts, 10)
    const contactsWithProfile = parseInt(c.contacts_with_profile, 10)

    return reply.send({
      totalMessages,
      analyzedMessages,
      coveragePct: totalMessages > 0 ? Math.round((analyzedMessages / totalMessages) * 100) : null,
      lastAnalyzedAt: m.last_analyzed_at,
      totalContacts,
      contactsWithProfile,
      profileCoveragePct: totalContacts > 0 ? Math.round((contactsWithProfile / totalContacts) * 100) : null,
      opportunityCount: parseInt(opportunityCount.rows[0].count, 10),
    })
  })
}
