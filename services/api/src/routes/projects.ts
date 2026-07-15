import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

// Business OS Phase F — lightweight project management. See
// docs/BUSINESS_OS_PLAN.md §11. Deliberately two tables, no Gantt/dependency
// graph. documents.deal_id already exists, so a project's invoices/
// quotations are found via documents.deal_id = projects.deal_id — no new
// FK on documents.

const STATUSES = ['active', 'on_hold', 'completed', 'cancelled'] as const
const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const

const createProjectBody = z.object({
  title: z.string().min(1).max(255),
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  status: z.enum(STATUSES).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
})

const patchProjectBody = z.object({
  title: z.string().min(1).max(255).optional(),
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  status: z.enum(STATUSES).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
})

const createTaskBody = z.object({
  title: z.string().min(1).max(255),
  dueDate: z.string().optional().nullable(),
  assignedTo: z.string().max(255).optional().nullable(),
})

const patchTaskBody = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: z.string().optional().nullable(),
  assignedTo: z.string().max(255).optional().nullable(),
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
  LEFT JOIN documents doc ON doc.deal_id = p.deal_id AND doc.user_id = p.user_id
`

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/projects',
    { preHandler: [authenticate, requireMarketingAccess] },
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
    { preHandler: [authenticate, requireMarketingAccess] },
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

      const { rows: documents } = await db.query(
        `SELECT id, document_type, document_number, title, status, total_cents, currency, created_at
         FROM documents WHERE deal_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
        [project.deal_id, userId],
      )

      return reply.send({
        project: projectApiShape(project),
        tasks: tasks.map(taskApiShape),
        documents: documents.map((d: any) => ({
          id: d.id, documentType: d.document_type, documentNumber: d.document_number,
          title: d.title, status: d.status, totalCents: Number(d.total_cents), currency: d.currency,
          createdAt: d.created_at,
        })),
      })
    },
  )

  fastify.post(
    '/api/projects',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createProjectBody.parse(request.body)

      const { rows: [project] } = await db.query(
        `INSERT INTO projects (user_id, contact_id, deal_id, title, status, start_date, due_date)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6, $7)
         RETURNING *`,
        [userId, body.contactId ?? null, body.dealId ?? null, body.title, body.status ?? null,
          body.startDate ?? null, body.dueDate ?? null],
      )

      return reply.code(201).send({ project: projectApiShape(project) })
    },
  )

  fastify.patch(
    '/api/projects/:id',
    { preHandler: [authenticate, requireMarketingAccess] },
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
    { preHandler: [authenticate, requireMarketingAccess] },
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
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = createTaskBody.parse(request.body)

      const { rows: [project] } = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId],
      )
      if (!project) return reply.code(404).send({ error: 'Project not found' })

      const { rows: [task] } = await db.query(
        `INSERT INTO project_tasks (project_id, title, due_date, assigned_to)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, body.title, body.dueDate ?? null, body.assignedTo ?? null],
      )

      return reply.code(201).send({ task: taskApiShape(task) })
    },
  )

  fastify.patch(
    '/api/projects/:id/tasks/:taskId',
    { preHandler: [authenticate, requireMarketingAccess] },
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
    { preHandler: [authenticate, requireMarketingAccess] },
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
}
