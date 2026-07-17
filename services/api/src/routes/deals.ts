import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { resolveInvoiceGapNudges } from '../lib/reality-engine'
import { reserveStock } from '../lib/stock'
import { publishInboxEvent } from '../lib/inbox-events'
import { recordBusinessEvent, checkMilestoneCrossing } from '../lib/business-feed'

// Default task template for a project auto-suggested off a closed deal —
// Platform Polish Phase 1 (docs/PLATFORM_POLISH_PLAN.md §3.1). Deliberately
// generic (no per-service workflow to copy, unlike services.ts's
// start-project, which reads a specific service's own stages) since a deal
// isn't tied to one catalog item.
const DEFAULT_DEAL_PROJECT_TASKS = ['Kick off with client', 'Deliver', 'Invoice & close out']

const STAGES = ['discovery', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const

// Deals is the one canonical pipeline entity (see docs/RELATIONSHIP_OS_PLAN.md
// §3/§5.9) — contacts.pipeline_stage is kept as a denormalized cache of the
// contact's most recent open deal's stage, synced here rather than via a
// DB trigger (no other table in this codebase uses triggers).
const DEAL_STAGE_TO_PIPELINE_STAGE: Record<string, string> = {
  discovery: 'new_lead',
  qualified: 'qualified',
  proposal: 'proposal',
  negotiation: 'negotiation',
  closed_won: 'won',
  closed_lost: 'lost',
}

const createBody = z.object({
  contactId: z.string().uuid(),
  title: z.string().min(1).max(255),
  stage: z.enum(STAGES).optional(),
  valueCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  productIds: z.array(z.string()).optional(),
})

const patchBody = z.object({
  title: z.string().min(1).max(255).optional(),
  stage: z.enum(STAGES).optional(),
  valueCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  productIds: z.array(z.string()).optional(),
})

type DealRow = {
  id: string
  contact_id: string
  contact_name: string | null
  title: string
  stage: string
  value_cents: string
  currency: string
  probability: number
  expected_close_date: string | null
  product_ids: string[]
  source: string
  entered_stage_at: string
  created_at: string
  updated_at: string
}

function toApiShape(d: DealRow) {
  return {
    id: d.id,
    contactId: d.contact_id,
    contactName: d.contact_name,
    title: d.title,
    stage: d.stage,
    valueCents: parseInt(d.value_cents, 10),
    currency: d.currency,
    probability: d.probability,
    expectedCloseDate: d.expected_close_date,
    productIds: d.product_ids,
    source: d.source,
    enteredStageAt: d.entered_stage_at,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

const SELECT_DEAL = `
  SELECT d.id, d.contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name,
         d.title, d.stage, d.value_cents, d.currency, d.probability, d.expected_close_date,
         d.product_ids, d.source, d.entered_stage_at, d.created_at, d.updated_at
  FROM deals d
  JOIN contacts c ON c.id = d.contact_id
`

// Deal closing won records a revenue event, same as any other deal-closed
// attribution already read by services/api/src/routes/analytics.ts.
async function recordWonRevenue(userId: string, contactId: string, valueCents: number, currency: string) {
  if (valueCents <= 0) return
  await db.query(
    `INSERT INTO revenue_events (user_id, contact_id, event_type, amount_cents, currency, description, attributed_to_ai)
     VALUES ($1, $2, 'deal_closed', $3, $4, 'Deal closed won', false)`,
    [userId, contactId, valueCents, currency],
  )
}

export async function dealsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/deals — list, optionally filtered by contact or stage ───────
  fastify.get(
    '/api/deals',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as { contactId?: string; stage?: string; openOnly?: string }

      const filters: string[] = ['d.user_id = $1']
      const params: unknown[] = [userId]
      let idx = 2

      if (query.contactId) {
        filters.push(`d.contact_id = $${idx++}`)
        params.push(query.contactId)
      }
      if (query.stage) {
        filters.push(`d.stage = $${idx++}`)
        params.push(query.stage)
      }
      if (query.openOnly === 'true') {
        filters.push(`d.stage NOT IN ('closed_won', 'closed_lost')`)
      }

      const { rows } = await db.query<DealRow>(
        `${SELECT_DEAL} WHERE ${filters.join(' AND ')} ORDER BY d.updated_at DESC`,
        params,
      )

      return reply.send({ deals: rows.map(toApiShape) })
    },
  )

  // ── POST /api/deals — create a deal (manual or opportunity-linked) ──────
  fastify.post(
    '/api/deals',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [contact] } = await db.query<{ id: string }>(
        `SELECT id FROM contacts WHERE id = $1 AND user_id = $2`,
        [body.contactId, userId],
      )
      if (!contact) return reply.code(404).send({ error: 'Contact not found' })

      const stage = body.stage ?? 'discovery'
      const { rows: [created] } = await db.query<{ id: string }>(
        `INSERT INTO deals (user_id, contact_id, title, stage, value_cents, currency, probability, expected_close_date, product_ids)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ZMW'), COALESCE($7, 50), $8, COALESCE($9, '[]'))
         RETURNING id`,
        [
          userId,
          body.contactId,
          body.title,
          stage,
          body.valueCents ?? 0,
          body.currency ?? null,
          body.probability ?? null,
          body.expectedCloseDate ?? null,
          body.productIds ? JSON.stringify(body.productIds) : null,
        ],
      )

      await db.query(
        `UPDATE contacts SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2`,
        [DEAL_STAGE_TO_PIPELINE_STAGE[stage], body.contactId],
      )

      const { rows: [deal] } = await db.query<DealRow>(`${SELECT_DEAL} WHERE d.id = $1`, [created.id])
      return reply.code(201).send({ deal: toApiShape(deal) })
    },
  )

  // ── PATCH /api/deals/:id ──────────────────────────────────────────────────
  fastify.patch(
    '/api/deals/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      const { rows: [existing] } = await db.query<{ contact_id: string; stage: string; value_cents: string; currency: string; title: string; product_ids: string[] }>(
        `SELECT contact_id, stage, value_cents, currency, title, product_ids FROM deals WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Deal not found' })

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1
      if (body.title !== undefined) { updates.push(`title = $${idx++}`); values.push(body.title) }
      if (body.stage !== undefined) {
        updates.push(`stage = $${idx++}`); values.push(body.stage)
        updates.push(`entered_stage_at = NOW()`)
      }
      if (body.valueCents !== undefined) { updates.push(`value_cents = $${idx++}`); values.push(body.valueCents) }
      if (body.currency !== undefined) { updates.push(`currency = $${idx++}`); values.push(body.currency) }
      if (body.probability !== undefined) { updates.push(`probability = $${idx++}`); values.push(body.probability) }
      if (body.expectedCloseDate !== undefined) { updates.push(`expected_close_date = $${idx++}`); values.push(body.expectedCloseDate) }
      if (body.productIds !== undefined) { updates.push(`product_ids = $${idx++}`); values.push(JSON.stringify(body.productIds)) }

      if (updates.length === 0) return reply.code(400).send({ error: 'No fields to update' })

      updates.push('updated_at = NOW()')
      values.push(id, userId)

      await db.query(
        `UPDATE deals SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        values,
      )

      if (body.stage !== undefined) {
        await db.query(
          `UPDATE contacts SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2`,
          [DEAL_STAGE_TO_PIPELINE_STAGE[body.stage], existing.contact_id],
        )
        if (body.stage === 'closed_won') {
          const finalValueCents = body.valueCents ?? parseInt(existing.value_cents, 10)
          const finalCurrency = body.currency ?? existing.currency
          await recordWonRevenue(userId, existing.contact_id, finalValueCents, finalCurrency)
          // Reality Engine Layer 1 (docs/REALITY_ENGINE_PLAN.md §7, Hook B)
          // — a deal closing won resolves the matching invoice-gap nudge
          // immediately rather than leaving it until the daily sweep.
          await resolveInvoiceGapNudges(userId, { dealId: id }, 'Deal closed won')
            .catch(() => { /* best-effort — the stage update itself already succeeded */ })

          // Business Feed (docs/PLATFORM_POLISH_PLAN.md §7.2) —
          // milestone-counter-crossing for "the Nth deal closed."
          const { rows: [{ n: closedCount }] } = await db.query<{ n: string }>(
            `SELECT COUNT(*)::int AS n FROM deals WHERE user_id = $1 AND stage = 'closed_won'`,
            [userId],
          )
          const dealMilestone = checkMilestoneCrossing(parseInt(closedCount, 10))
          if (dealMilestone) {
            await recordBusinessEvent(userId, 'milestone_deal_closed', {
              evidence: [`${dealMilestone}th deal closed`], payload: { count: dealMilestone },
            }).catch(() => {})
          }

          // Platform Polish Phase 1 (docs/PLATFORM_POLISH_PLAN.md §3) — the
          // "everything connects" chain. Stock reservation is safe to do
          // without a click (cheap to release); a project is structurally
          // significant, so it's only ever suggested.
          const productIds = existing.product_ids ?? []
          for (const productId of productIds) {
            await reserveStock(userId, productId, 1, `Reserved from deal "${existing.title}" closing won`)
              .catch(() => { /* best-effort — a missing/archived product shouldn't block the deal close */ })
          }

          const { rows: [existingProject] } = await db.query<{ id: string }>(
            `SELECT id FROM projects WHERE deal_id = $1 LIMIT 1`, [id],
          )
          if (!existingProject) {
            const summary = `Start a project to deliver "${existing.title}"?`
            const { rows: [bundle] } = await db.query<{ id: string }>(
              `INSERT INTO action_bundles (user_id, contact_id, summary, actions, confidence, evidence)
               VALUES ($1, $2, $3, $4::jsonb, 1.0, $5::jsonb) RETURNING id`,
              [
                userId, existing.contact_id, summary,
                JSON.stringify([{ type: 'start_project', params: [id, existing.contact_id, existing.title] }]),
                JSON.stringify([`Deal "${existing.title}" closed won with no linked project yet`]),
              ],
            )
            await publishInboxEvent(userId, 'bundle:ready', { bundleId: bundle.id, contactId: existing.contact_id, summary })
          }
        }
      }

      const { rows: [deal] } = await db.query<DealRow>(`${SELECT_DEAL} WHERE d.id = $1`, [id])
      return reply.send({ deal: toApiShape(deal) })
    },
  )

  // ── POST /api/deals/:id/start-project — one-click action for the
  // action_bundles suggestion above (and reachable directly). Mirrors
  // services.ts's start-project pattern, but there's no per-service
  // workflow to copy for a plain deal, so it seeds a generic default
  // template instead of reading service_workflow_stages.
  fastify.post(
    '/api/deals/:id/start-project',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [deal] } = await db.query<{ contact_id: string; title: string }>(
        `SELECT contact_id, title FROM deals WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!deal) return reply.code(404).send({ error: 'Deal not found' })

      const { rows: [existingProject] } = await db.query<{ id: string }>(
        `SELECT id FROM projects WHERE deal_id = $1 LIMIT 1`, [id],
      )
      if (existingProject) return reply.send({ projectId: existingProject.id, alreadyExisted: true })

      const { rows: [project] } = await db.query<{ id: string }>(
        `INSERT INTO projects (user_id, contact_id, deal_id, title, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [userId, deal.contact_id, id, deal.title],
      )
      for (const title of DEFAULT_DEAL_PROJECT_TASKS) {
        await db.query('INSERT INTO project_tasks (project_id, title) VALUES ($1, $2)', [project.id, title])
      }

      return reply.code(201).send({ projectId: project.id, taskCount: DEFAULT_DEAL_PROJECT_TASKS.length })
    },
  )
}
