import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { requireFeature } from '../lib/entitlements'

// Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
// — a superset read of the same business_events table Studio's "Zuri
// Noticed" card already reads (GET /api/studio/insights's recentEvents,
// capped at 10). This is the first-class, paginated version of that same
// feed, promoting the pattern out of being just an Overview-tab card.

// Business Documents Overhaul, "actionable feed" pass — a real one-tap
// action per event type, computed deterministically from the event's own
// payload (no LLM call needed to decide *what* action to offer, only the
// ask_ai action's target prompt actually reaches a model, and only once
// the user taps it). Three action shapes:
//   - merge_contacts: duplicate_contact_detected already carries both
//     contact ids/names — the frontend calls the existing
//     POST /api/contacts/:id/merge directly.
//   - send_proactive: a linked proactive_queue row already has a ready
//     draft_message (dormant_customer_alert) — the frontend calls the
//     existing POST /api/proactive/:id/send directly.
//   - ask_ai: no ready draft/endpoint exists yet — hands the user off to
//     Studio's AI Business Advisor chat with a prefilled prompt (same
//     "Ask AI" one-tap pattern Studio's own insight cards already use),
//     via a ?tab=overview&prompt= deep link.
type BusinessEventAction =
  | { type: 'merge_contacts'; contactAId: string; contactAName: string; contactBId: string; contactBName: string }
  | { type: 'send_proactive'; proactiveId: string; draftMessage: string }
  | { type: 'ask_ai'; prompt: string }
  | null

function computeAction(
  eventType: string, payload: Record<string, any>, contactName: string | null,
  proactiveId: string | null, draftMessage: string | null,
): BusinessEventAction {
  if (proactiveId && draftMessage) {
    return { type: 'send_proactive', proactiveId, draftMessage }
  }

  switch (eventType) {
    case 'duplicate_contact_detected':
      if (payload.contactAId && payload.contactBId) {
        return {
          type: 'merge_contacts',
          contactAId: payload.contactAId, contactAName: payload.contactAName ?? 'Contact A',
          contactBId: payload.contactBId, contactBName: payload.contactBName ?? 'Contact B',
        }
      }
      return null
    case 'contact_gone_quiet':
      return contactName
        ? { type: 'ask_ai', prompt: `Draft a friendly check-in message to ${contactName} — they've gone quiet.` }
        : null
    case 'low_stock_alert':
      return payload.name ? { type: 'ask_ai', prompt: `Help me plan a reorder for "${payload.name}" — it's out of stock.` } : null
    case 'thin_margin_alert':
      return payload.name ? { type: 'ask_ai', prompt: `Should I raise the price on "${payload.name}"? Its margin is thin.` } : null
    case 'supplier_flag_alert':
      return payload.company
        ? { type: 'ask_ai', prompt: `Should I consider replacing or renegotiating with supplier "${payload.company}"?` }
        : null
    case 'unmet_demand_alert':
      return payload.name
        ? { type: 'ask_ai', prompt: `${payload.interestedCount ?? 'Several'} contacts have shown interest in "${payload.name}" but nobody's bought it — should I stock it?` }
        : null
    case 'invoice_gap':
      return {
        type: 'ask_ai',
        prompt: contactName ? `Draft an invoice for ${contactName} — they have no invoice on file.` : 'Draft an invoice — a project has no invoice on file.',
      }
    case 'career_opportunity_detected':
      return payload.title
        ? { type: 'ask_ai', prompt: `Tell me more about this opportunity: "${payload.title}"${payload.companyOrOrg ? ` at ${payload.companyOrOrg}` : ''}.` }
        : null
    default:
      return null
  }
}

export async function businessFeedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/business-feed',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { cursor, limit: limitRaw, eventType, status } = request.query as {
        cursor?: string; limit?: string; eventType?: string; status?: string
      }
      const limit = Math.min(parseInt(limitRaw ?? '30', 10) || 30, 100)
      // Dismissed events are hidden by default (same convention as
      // Catalog's secondary items) — pass ?status=dismissed to see them.
      const statusFilter = status ? 'be.status = $4' : `be.status != 'dismissed'`

      // LEFT JOIN the linked proactive_queue row (Reality Engine's
      // business_event_id column, migration 0077) when one exists with a
      // real draft_message ready to send — dormant_customer_alert writes
      // one; invoice_gap deliberately doesn't (it needs a generated
      // document, not a WhatsApp message), so it falls through to the
      // ask_ai action computed below instead.
      const { rows } = await db.query(
        `SELECT be.id, be.event_type, be.confidence, be.evidence, be.payload, be.status,
                be.bundle_id, be.created_at,
                COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
                pq.id AS proactive_id, pq.draft_message
         FROM business_events be
         LEFT JOIN contacts c ON c.id = be.contact_id
         LEFT JOIN proactive_queue pq
           ON pq.business_event_id = be.id AND pq.status = 'pending' AND pq.draft_message IS NOT NULL
          WHERE be.user_id = $1 AND ($2::timestamptz IS NULL OR be.created_at < $2)
            AND ($3::text IS NULL OR be.event_type = $3)
            AND be.created_at > NOW() - INTERVAL '3 days'
            AND (be.confidence IS NULL OR be.confidence >= 0.8)
            AND ${statusFilter}
         ORDER BY be.created_at DESC
         LIMIT $${status ? 5 : 4}`,
        status
          ? [userId, cursor ?? null, eventType ?? null, status, limit]
          : [userId, cursor ?? null, eventType ?? null, limit],
      )

      return reply.send({
        events: rows.map((r: any) => ({
          id: r.id,
          eventType: r.event_type,
          confidence: r.confidence !== null ? parseFloat(r.confidence) : null,
          evidence: r.evidence ?? [],
          payload: r.payload ?? {},
          status: r.status,
          bundleId: r.bundle_id,
          contactName: r.contact_name,
          createdAt: r.created_at,
          action: computeAction(r.event_type, r.payload ?? {}, r.contact_name, r.proactive_id, r.draft_message),
        })),
        nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null,
      })
    },
  )

  fastify.post(
    '/api/business-feed/:id/dismiss',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        `UPDATE business_events SET status = 'dismissed' WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Event not found' })
      return reply.send({ ok: true })
    },
  )
}
