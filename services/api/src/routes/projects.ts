import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { requireAnyFeature } from '../lib/entitlements'
const requireFeature = (area: string) => {
  if (area === 'business_os') return requireAnyFeature(['business_os', 'career_os'])
  return requireAnyFeature([area as any])
}
import { assignDocumentNumber, computeTotals, formatDocument, lineItemSchema, PHASE_0_TYPES } from './documents'

// Business OS Phase F — lightweight project management. See
// docs/BUSINESS_OS_PLAN.md §11. Deliberately two tables, no Gantt/dependency
// graph. documents.deal_id already exists, so a project's invoices/
// quotations are found via documents.deal_id = projects.deal_id — no new
// FK on documents.

const STATUSES = ['active', 'on_hold', 'completed', 'cancelled'] as const
const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const
const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const

const createProjectBody = z.object({
  title: z.string().min(1).max(255),
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  status: z.enum(STATUSES).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedBudgetCents: z.number().int().nonnegative().optional().nullable(),
  budgetCurrency: z.string().length(3).optional().nullable(),
})

const patchProjectBody = z.object({
  title: z.string().min(1).max(255).optional(),
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  status: z.enum(STATUSES).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedBudgetCents: z.number().int().nonnegative().optional().nullable(),
  budgetCurrency: z.string().length(3).optional().nullable(),
})

const createTaskBody = z.object({
  title: z.string().min(1).max(255),
  dueDate: z.string().optional().nullable(),
  assignedTo: z.string().max(255).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().max(30).optional(),
  sortOrder: z.number().int().optional(),
})

const patchTaskBody = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: z.string().optional().nullable(),
  assignedTo: z.string().max(255).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().max(30).optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const reorderTasksBody = z.object({
  taskIds: z.array(z.string().uuid()),
})

const createMilestoneBody = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  paymentAmountCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  requiresClientApproval: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const patchMilestoneBody = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  completionPct: z.number().int().min(0).max(100).optional(),
  paymentAmountCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  requiresClientApproval: z.boolean().optional(),
  approved: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const createTimeEntryBody = z.object({
  taskId: z.string().uuid().optional().nullable(),
  personLabel: z.string().max(255).optional().nullable(),
  durationMinutes: z.number().int().positive(),
  isBillable: z.boolean().optional(),
  note: z.string().optional().nullable(),
})

const startTimeEntryBody = z.object({
  taskId: z.string().uuid().optional().nullable(),
  personLabel: z.string().max(255).optional().nullable(),
  isBillable: z.boolean().optional(),
})

const patchTimeEntryBody = z.object({
  personLabel: z.string().max(255).optional().nullable(),
  durationMinutes: z.number().int().positive().optional(),
  isBillable: z.boolean().optional(),
  note: z.string().optional().nullable(),
})

// Convenience origination — "generate a document from within a project"
// (docs/SERVICES_PROJECTS_PLAN.md §11.2). Pre-fills projectId and inherits
// contactId/dealId from the project, then delegates to the same create
// logic POST /api/documents uses (assignDocumentNumber/computeTotals).
const createProjectDocumentBody = z.object({
  documentType: z.enum(PHASE_0_TYPES),
  title: z.string().max(255).optional(),
  currency: z.string().length(3).optional(),
  items: z.array(lineItemSchema).min(1),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  validUntil: z.string().optional(),
  dueDate: z.string().optional(),
})

function projectApiShape(r: any) {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name ?? null,
    dealId: r.deal_id,
    dealTitle: r.deal_title ?? null,
    title: r.title,
    status: r.status,
    startDate: r.start_date,
    dueDate: r.due_date,
    taskCount: r.task_count !== undefined ? Number(r.task_count) : undefined,
    doneTaskCount: r.done_task_count !== undefined ? Number(r.done_task_count) : undefined,
    overdueTaskCount: r.overdue_task_count !== undefined ? Number(r.overdue_task_count) : undefined,
    unpaidInvoiceCount: r.unpaid_invoice_count !== undefined ? Number(r.unpaid_invoice_count) : undefined,
    pendingQuotationCount: r.pending_quotation_count !== undefined ? Number(r.pending_quotation_count) : undefined,
    estimatedBudgetCents: r.estimated_budget_cents !== null && r.estimated_budget_cents !== undefined ? Number(r.estimated_budget_cents) : null,
    budgetCurrency: r.budget_currency ?? null,
    careerOpportunityId: r.career_opportunity_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function taskApiShape(r: any) {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    dueDate: r.due_date,
    assignedTo: r.assigned_to,
    priority: r.priority,
    category: r.category,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }
}

function milestoneApiShape(r: any) {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    targetDate: r.target_date,
    status: r.status,
    completionPct: r.completion_pct,
    paymentAmountCents: r.payment_amount_cents !== null ? Number(r.payment_amount_cents) : null,
    currency: r.currency,
    requiresClientApproval: r.requires_client_approval,
    approvedAt: r.approved_at,
    completedAt: r.completed_at,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

function timeEntryApiShape(r: any) {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    personLabel: r.person_label,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMinutes: r.duration_minutes,
    isBillable: r.is_billable,
    note: r.note,
    createdAt: r.created_at,
  }
}

const PROJECT_LIST_SELECT = `
  SELECT p.*,
         COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
         d.title AS deal_title,
         COUNT(DISTINCT pt.id) AS task_count,
         COUNT(DISTINCT pt.id) FILTER (WHERE pt.status = 'done') AS done_task_count,
         COUNT(DISTINCT pt.id) FILTER (WHERE pt.status != 'done' AND pt.due_date < CURRENT_DATE) AS overdue_task_count,
         COUNT(DISTINCT doc.id) FILTER (WHERE doc.document_type = 'invoice' AND doc.status NOT IN ('paid', 'archived')) AS unpaid_invoice_count,
         COUNT(DISTINCT doc.id) FILTER (WHERE doc.document_type = 'quotation' AND doc.status NOT IN ('accepted', 'rejected', 'expired', 'archived')) AS pending_quotation_count
  FROM projects p
  LEFT JOIN contacts co ON co.id = p.contact_id
  LEFT JOIN deals d ON d.id = p.deal_id
  LEFT JOIN project_tasks pt ON pt.project_id = p.id
  LEFT JOIN documents doc ON doc.user_id = p.user_id
    AND (doc.project_id = p.id OR (doc.project_id IS NULL AND doc.deal_id = p.deal_id))
`

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/projects',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { status } = request.query as { status?: string }

      const filters = ['p.user_id = $1']
      const params: unknown[] = [userId]
      if (status) { filters.push('p.status = $2'); params.push(status) }

      const { rows } = await db.query(
        `${PROJECT_LIST_SELECT}
         WHERE ${filters.join(' AND ')}
         GROUP BY p.id, co.custom_name, co.display_name, co.phone_number, d.title
         ORDER BY p.updated_at DESC`,
        params,
      )

      return reply.send({ projects: rows.map(projectApiShape) })
    },
  )

  fastify.get(
    '/api/projects/:id',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [project] } = await db.query(
        `${PROJECT_LIST_SELECT}
         WHERE p.id = $1 AND p.user_id = $2
         GROUP BY p.id, co.custom_name, co.display_name, co.phone_number, d.title`,
        [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { rows: tasks } = await db.query(
        `SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY due_date ASC NULLS LAST, created_at ASC`,
        [id],
      )

      // documents.project_id (migration 0075) is the direct link; deal_id is
      // the legacy path for documents created before it existed. Union both
      // so nothing generated pre-migration gets orphaned (see docs/
      // SERVICES_PROJECTS_PLAN.md §11.2).
      const { rows: documents } = await db.query(
        `SELECT id, document_type, document_number, title, status, total_cents, currency, created_at
         FROM documents
         WHERE user_id = $2 AND (project_id = $1 OR (project_id IS NULL AND deal_id = $3))
         ORDER BY created_at DESC`,
        [id, userId, project.deal_id],
      )

      const { rows: milestones } = await db.query(
        `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY sort_order, target_date ASC NULLS LAST, created_at ASC`,
        [id],
      )

      const { rows: timeEntries } = await db.query(
        `SELECT * FROM project_time_entries WHERE project_id = $1 ORDER BY started_at DESC NULLS LAST, created_at DESC`,
        [id],
      )

      const { rows: [budgetDocs] } = await db.query(
        `SELECT
           COALESCE(SUM(total_cents) FILTER (WHERE document_type = 'invoice'), 0) AS invoiced_cents,
           COALESCE(SUM(total_cents) FILTER (WHERE document_type = 'invoice' AND status = 'paid'), 0) AS paid_cents,
           COALESCE(SUM(total_cents) FILTER (WHERE document_type = 'purchase_order'), 0) AS purchase_cost_cents
         FROM documents
         WHERE user_id = $2 AND (project_id = $1 OR (project_id IS NULL AND deal_id = $3))`,
        [id, userId, project.deal_id],
      )

      const { rows: [timeTotals] } = await db.query(
        `SELECT
           COALESCE(SUM(duration_minutes), 0) AS labor_minutes,
           COALESCE(SUM(duration_minutes) FILTER (WHERE is_billable), 0) AS billable_minutes
         FROM project_time_entries WHERE project_id = $1`,
        [id],
      )

      // Goal linking (docs/NEURAL_LAYER_PLAN.md §4.4) is a generic
      // polymorphic join (goal_linked_entities) — this was previously a
      // write-only affordance (linking a project to a goal succeeded, but
      // nothing ever read it back). Support one visible linked goal for now.
      const { rows: [linkedGoal] } = await db.query(
        `SELECT g.id, g.title, g.goal_type, g.status
         FROM goal_linked_entities e
         JOIN goal_profiles g ON g.id = e.goal_id
         WHERE e.entity_type = 'project' AND e.entity_id = $1
         ORDER BY e.created_at DESC LIMIT 1`,
        [id],
      )

      return reply.send({
        project: projectApiShape(project),
        tasks: tasks.map(taskApiShape),
        documents: documents.map((d: any) => ({
          id: d.id, documentType: d.document_type, documentNumber: d.document_number,
          title: d.title, status: d.status, totalCents: Number(d.total_cents), currency: d.currency,
          createdAt: d.created_at,
        })),
        milestones: milestones.map(milestoneApiShape),
        timeEntries: timeEntries.map(timeEntryApiShape),
        budget: {
          estimatedCents: project.estimated_budget_cents !== null ? Number(project.estimated_budget_cents) : null,
          currency: project.budget_currency ?? null,
          invoicedCents: Number(budgetDocs.invoiced_cents),
          paidCents: Number(budgetDocs.paid_cents),
          purchaseCostCents: Number(budgetDocs.purchase_cost_cents),
          laborMinutes: Number(timeTotals.labor_minutes),
          billableMinutes: Number(timeTotals.billable_minutes),
        },
        linkedGoal: linkedGoal
          ? { id: linkedGoal.id, title: linkedGoal.title, goalType: linkedGoal.goal_type, status: linkedGoal.status }
          : null,
      })
    },
  )

  fastify.post(
    '/api/projects',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createProjectBody.parse(request.body)

      const { rows: [project] } = await db.query(
        `INSERT INTO projects (user_id, contact_id, deal_id, title, status, start_date, due_date, estimated_budget_cents, budget_currency)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6, $7, $8, $9)
         RETURNING *`,
        [userId, body.contactId ?? null, body.dealId ?? null, body.title, body.status ?? null,
          body.startDate ?? null, body.dueDate ?? null, body.estimatedBudgetCents ?? null, body.budgetCurrency ?? null],
      )

      return reply.code(201).send({ project: projectApiShape(project) })
    },
  )

  fastify.patch(
    '/api/projects/:id',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchProjectBody.parse(request.body)

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3
      if (body.title !== undefined) { sets.push(`title = $${idx++}`); values.push(body.title) }
      if (body.contactId !== undefined) { sets.push(`contact_id = $${idx++}`); values.push(body.contactId) }
      if (body.dealId !== undefined) { sets.push(`deal_id = $${idx++}`); values.push(body.dealId) }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status) }
      if (body.startDate !== undefined) { sets.push(`start_date = $${idx++}`); values.push(body.startDate) }
      if (body.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); values.push(body.dueDate) }
      if (body.estimatedBudgetCents !== undefined) { sets.push(`estimated_budget_cents = $${idx++}`); values.push(body.estimatedBudgetCents) }
      if (body.budgetCurrency !== undefined) { sets.push(`budget_currency = $${idx++}`); values.push(body.budgetCurrency) }

      const { rowCount } = await db.query(
        `UPDATE projects SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Project not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/projects/:id',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rowCount } = await db.query(
        'DELETE FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Project not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Tasks ──────────────────────────────────────────────────────────────

  fastify.post(
    '/api/projects/:id/tasks',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createTaskBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { rows: [task] } = await db.query(
        `INSERT INTO project_tasks (project_id, title, due_date, assigned_to, priority, category, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id,
          body.title,
          body.dueDate ?? null,
          body.assignedTo ?? null,
          body.priority ?? 'medium',
          body.category ?? 'general',
          body.sortOrder ?? 0,
        ],
      )

      return reply.code(201).send({ task: taskApiShape(task) })
    },
  )

  fastify.patch(
    '/api/projects/:id/tasks/:taskId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, taskId } = request.params as { id: string; taskId: string }
      const body = patchTaskBody.parse(request.body)

      const sets: string[] = []
      const values: unknown[] = [taskId, id]
      let idx = 3
      if (body.title !== undefined) { sets.push(`title = $${idx++}`); values.push(body.title) }
      if (body.status !== undefined) {
        sets.push(`status = $${idx++}`); values.push(body.status)
        // Zuri Neural Layer Phase 3 (docs/NEURAL_LAYER_PLAN.md §4.7) — the
        // Reflection Engine's "you completed N tasks this week" highlight
        // needs to know *when* a task was done, not just its current status.
        sets.push(`completed_at = ${body.status === 'done' ? 'NOW()' : 'NULL'}`)
      }
      if (body.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); values.push(body.dueDate) }
      if (body.assignedTo !== undefined) { sets.push(`assigned_to = $${idx++}`); values.push(body.assignedTo) }
      if (body.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(body.priority) }
      if (body.category !== undefined) { sets.push(`category = $${idx++}`); values.push(body.category) }
      if (body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(body.sortOrder) }
      if (sets.length === 0) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE project_tasks SET ${sets.join(', ')}
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $${idx})`,
        [...values, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Task not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/projects/:id/tasks/:taskId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, taskId } = request.params as { id: string; taskId: string }

      const { rowCount } = await db.query(
        `DELETE FROM project_tasks
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $3)`,
        [taskId, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Task not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.post(
    '/api/projects/:id/tasks/reorder',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const { taskIds } = reorderTasksBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      for (let i = 0; i < taskIds.length; i++) {
        await db.query(
          'UPDATE project_tasks SET sort_order = $1 WHERE id = $2 AND project_id = $3',
          [i, taskIds[i], id]
        )
      }

      return reply.send({ ok: true })
    },
  )

  // ── Documents (convenience origination) ──────────────────────────────────

  fastify.post(
    '/api/projects/:id/documents',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createProjectDocumentBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id, contact_id, deal_id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(body.items)
      const documentNumber = await assignDocumentNumber(userId, body.documentType)
      const title = body.title ?? `${body.documentType[0].toUpperCase()}${body.documentType.slice(1)} ${documentNumber}`

      const structuredData = {
        items: computedItems,
        notes: body.notes ?? null,
        terms: body.terms ?? null,
        validUntil: body.validUntil ?? null,
        dueDate: body.dueDate ?? null,
        manualContact: null,
      }

      const { rows: [doc] } = await db.query(
        `INSERT INTO documents
           (user_id, contact_id, deal_id, project_id,
            document_type, document_category, document_number, title, status, structured_data,
            currency, subtotal_cents, discount_cents, tax_cents, total_cents, requested_by, ai_generated)
         VALUES ($1,$2,$3,$4,$5,'sales',$6,$7,'draft',$8,$9,$10,$11,$12,$13,'user',false)
         RETURNING *`,
        [
          userId, project.contact_id, project.deal_id, id, body.documentType, documentNumber, title,
          JSON.stringify(structuredData), body.currency ?? 'ZMW', subtotalCents, discountCents, taxCents, totalCents,
        ],
      )

      await db.query(
        `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', '{}')`,
        [doc.id],
      )

      return reply.code(201).send({ document: formatDocument(doc) })
    },
  )

  // ── Milestones (docs/SERVICES_PROJECTS_PLAN.md §11.3) ───────────────────

  fastify.post(
    '/api/projects/:id/milestones',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createMilestoneBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { rows: [milestone] } = await db.query(
        `INSERT INTO project_milestones
           (project_id, title, description, target_date, payment_amount_cents, currency, requires_client_approval, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, FALSE), COALESCE($8, 0))
         RETURNING *`,
        [id, body.title, body.description ?? null, body.targetDate ?? null,
          body.paymentAmountCents ?? null, body.currency ?? null, body.requiresClientApproval ?? null, body.sortOrder ?? null],
      )

      return reply.code(201).send({ milestone: milestoneApiShape(milestone) })
    },
  )

  fastify.patch(
    '/api/projects/:id/milestones/:milestoneId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, milestoneId } = request.params as { id: string; milestoneId: string }
      const body = patchMilestoneBody.parse(request.body)

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [milestoneId, id]
      let idx = 3
      if (body.title !== undefined) { sets.push(`title = $${idx++}`); values.push(body.title) }
      if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description) }
      if (body.targetDate !== undefined) { sets.push(`target_date = $${idx++}`); values.push(body.targetDate) }
      if (body.status !== undefined) {
        sets.push(`status = $${idx++}`); values.push(body.status)
        sets.push(`completed_at = ${body.status === 'completed' ? 'NOW()' : 'NULL'}`)
      }
      if (body.completionPct !== undefined) { sets.push(`completion_pct = $${idx++}`); values.push(body.completionPct) }
      if (body.paymentAmountCents !== undefined) { sets.push(`payment_amount_cents = $${idx++}`); values.push(body.paymentAmountCents) }
      if (body.currency !== undefined) { sets.push(`currency = $${idx++}`); values.push(body.currency) }
      if (body.requiresClientApproval !== undefined) { sets.push(`requires_client_approval = $${idx++}`); values.push(body.requiresClientApproval) }
      if (body.approved !== undefined) { sets.push(`approved_at = ${body.approved ? 'NOW()' : 'NULL'}`) }
      if (body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(body.sortOrder) }
      if (sets.length === 1) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE project_milestones SET ${sets.join(', ')}
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $${idx})`,
        [...values, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Milestone not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/projects/:id/milestones/:milestoneId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, milestoneId } = request.params as { id: string; milestoneId: string }

      const { rowCount } = await db.query(
        `DELETE FROM project_milestones
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $3)`,
        [milestoneId, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Milestone not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Time tracking (docs/SERVICES_PROJECTS_PLAN.md §11.4) ────────────────

  fastify.post(
    '/api/projects/:id/time-entries',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createTimeEntryBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { rows: [entry] } = await db.query(
        `INSERT INTO project_time_entries
           (project_id, task_id, user_id, person_label, ended_at, duration_minutes, is_billable, note)
         VALUES ($1, $2, $3, $4, NOW(), $5, COALESCE($6, TRUE), $7)
         RETURNING *`,
        [id, body.taskId ?? null, userId, body.personLabel ?? null, body.durationMinutes, body.isBillable ?? null, body.note ?? null],
      )

      return reply.code(201).send({ timeEntry: timeEntryApiShape(entry) })
    },
  )

  fastify.post(
    '/api/projects/:id/time-entries/start',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = startTimeEntryBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      try {
        const { rows: [entry] } = await db.query(
          `INSERT INTO project_time_entries (project_id, task_id, user_id, person_label, started_at, is_billable)
           VALUES ($1, $2, $3, $4, NOW(), COALESCE($5, TRUE))
           RETURNING *`,
          [id, body.taskId ?? null, userId, body.personLabel ?? null, body.isBillable ?? null],
        )
        return reply.code(201).send({ timeEntry: timeEntryApiShape(entry) })
      } catch (err: any) {
        // uq_time_entry_running (migration 0075) — at most one running timer per user per project.
        if (err?.code === '23505') return reply.code(409).send({ error: 'A timer is already running for this project' })
        throw err
      }
    },
  )

  fastify.post(
    '/api/projects/:id/time-entries/:entryId/stop',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, entryId } = request.params as { id: string; entryId: string }

      const { rows: [entry] } = await db.query(
        `UPDATE project_time_entries
         SET ended_at = NOW(),
             duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60))
         WHERE id = $1 AND project_id = $2 AND ended_at IS NULL
           AND project_id IN (SELECT id FROM projects WHERE user_id = $3)
         RETURNING *`,
        [entryId, id, userId],
      )
      if (!entry) return reply.code(404).send({ error: 'Running time entry not found' })

      return reply.send({ timeEntry: timeEntryApiShape(entry) })
    },
  )

  fastify.patch(
    '/api/projects/:id/time-entries/:entryId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, entryId } = request.params as { id: string; entryId: string }
      const body = patchTimeEntryBody.parse(request.body)

      const sets: string[] = []
      const values: unknown[] = [entryId, id]
      let idx = 3
      if (body.personLabel !== undefined) { sets.push(`person_label = $${idx++}`); values.push(body.personLabel) }
      if (body.durationMinutes !== undefined) { sets.push(`duration_minutes = $${idx++}`); values.push(body.durationMinutes) }
      if (body.isBillable !== undefined) { sets.push(`is_billable = $${idx++}`); values.push(body.isBillable) }
      if (body.note !== undefined) { sets.push(`note = $${idx++}`); values.push(body.note) }
      if (sets.length === 0) return reply.send({ ok: true })

      const { rowCount } = await db.query(
        `UPDATE project_time_entries SET ${sets.join(', ')}
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $${idx})`,
        [...values, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Time entry not found' })

      return reply.send({ ok: true })
    },
  )

  fastify.delete(
    '/api/projects/:id/time-entries/:entryId',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, entryId } = request.params as { id: string; entryId: string }

      const { rowCount } = await db.query(
        `DELETE FROM project_time_entries
         WHERE id = $1 AND project_id = $2
           AND project_id IN (SELECT id FROM projects WHERE user_id = $3)`,
        [entryId, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Time entry not found' })

      return reply.send({ ok: true })
    },
  )
}
