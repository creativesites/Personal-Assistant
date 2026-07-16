import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Zuri Career & Growth Engine, Phase 1 (see docs/CAREER_GROWTH_ENGINE_PLAN.md
// §5) — one Opportunity object spanning jobs/contracts/consulting/grants/
// speaking/etc., only the workflow differs per category. Phase 1 ships
// manual entry + the status lifecycle; passive WhatsApp detection (Phase 2)
// creates rows through the same POST endpoint via the action-bundle
// executor, and applications-as-projects (Phase 4) is a later PATCH-driven
// addition, not built here.

const CATEGORIES = [
  'job', 'contract', 'consulting', 'investment', 'speaking', 'partnership',
  'collaboration', 'freelance', 'board_position', 'research', 'mentorship',
  'grant', 'scholarship', 'tender', 'supplier_opportunity', 'acquisition',
] as const

const STATUSES = [
  'detected', 'shortlisted', 'applied', 'interviewing',
  'offered', 'accepted', 'rejected', 'withdrawn', 'archived',
] as const

const SOURCES = ['whatsapp_detected', 'manual', 'web_search', 'referral'] as const

const salaryRangeSchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
}).partial()

const createBody = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(255),
  companyOrOrg: z.string().max(255).optional(),
  description: z.string().optional(),
  location: z.string().max(255).optional(),
  country: z.string().max(50).optional(),
  isRemote: z.boolean().optional(),
  salaryRangeCents: salaryRangeSchema.optional(),
  source: z.enum(SOURCES).optional(),
  contactId: z.string().uuid().optional(),
  applicationUrl: z.string().url().optional(),
  deadline: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
})

const patchBody = z.object({
  category: z.enum(CATEGORIES).optional(),
  title: z.string().min(1).max(255).optional(),
  companyOrOrg: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  country: z.string().max(50).nullable().optional(),
  isRemote: z.boolean().nullable().optional(),
  salaryRangeCents: salaryRangeSchema.nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  applicationUrl: z.string().url().nullable().optional(),
  deadline: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
})

function opportunityApiShape(r: any) {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    companyOrOrg: r.company_or_org,
    description: r.description,
    location: r.location,
    country: r.country,
    isRemote: r.is_remote,
    salaryRangeCents: r.salary_range_cents ?? null,
    source: r.source,
    contactId: r.contact_id,
    contactName: r.contact_name ?? undefined,
    applicationUrl: r.application_url,
    deadline: r.deadline,
    matchScore: r.match_score,
    matchBreakdown: r.match_breakdown ?? {},
    status: r.status,
    confidence: r.confidence != null ? parseFloat(r.confidence) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SELECT_OPPORTUNITY = `
  SELECT co.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
  FROM career_opportunities co
  LEFT JOIN contacts c ON c.id = co.contact_id
`

export async function careerOpportunitiesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/opportunities', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { status, category } = request.query as { status?: string; category?: string }

    const conditions = ['co.user_id = $1']
    const values: unknown[] = [userId]
    let idx = 2
    if (status) { conditions.push(`co.status = $${idx++}`); values.push(status) }
    if (category) { conditions.push(`co.category = $${idx++}`); values.push(category) }

    const { rows } = await db.query(
      `${SELECT_OPPORTUNITY} WHERE ${conditions.join(' AND ')} ORDER BY co.created_at DESC`,
      values,
    )
    return reply.send({ opportunities: rows.map(opportunityApiShape) })
  })

  fastify.get('/api/career/opportunities/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows: [opp] } = await db.query(
      `${SELECT_OPPORTUNITY} WHERE co.id = $1 AND co.user_id = $2`, [id, userId],
    )
    if (!opp) return reply.code(404).send({ error: 'Opportunity not found' })
    return reply.send({ opportunity: opportunityApiShape(opp) })
  })

  fastify.post('/api/career/opportunities', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = createBody.parse(request.body)

    const { rows: [created] } = await db.query(
      `INSERT INTO career_opportunities
         (user_id, contact_id, category, title, company_or_org, description, location, country,
          is_remote, salary_range_cents, source, application_url, deadline, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId, body.contactId ?? null, body.category, body.title, body.companyOrOrg ?? null,
        body.description ?? null, body.location ?? null, body.country ?? null, body.isRemote ?? null,
        body.salaryRangeCents ? JSON.stringify(body.salaryRangeCents) : null,
        body.source ?? 'manual', body.applicationUrl ?? null, body.deadline ?? null,
        body.confidence ?? null,
      ],
    )
    return reply.code(201).send({ opportunity: opportunityApiShape(created) })
  })

  fastify.patch('/api/career/opportunities/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = patchBody.parse(request.body)

    const { rows: [existing] } = await db.query(
      'SELECT id FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!existing) return reply.code(404).send({ error: 'Opportunity not found' })

    const columns: Record<string, unknown> = {
      category: body.category, title: body.title, company_or_org: body.companyOrOrg,
      description: body.description, location: body.location, country: body.country,
      is_remote: body.isRemote, contact_id: body.contactId, application_url: body.applicationUrl,
      deadline: body.deadline, status: body.status,
    }

    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [id, userId]
    let idx = 3
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}`)
      values.push(value)
    }
    if (body.salaryRangeCents !== undefined) {
      sets.push(`salary_range_cents = $${idx++}::jsonb`)
      values.push(body.salaryRangeCents ? JSON.stringify(body.salaryRangeCents) : null)
    }

    const { rows: [updated] } = await db.query(
      `UPDATE career_opportunities SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    )
    return reply.send({ opportunity: opportunityApiShape(updated) })
  })

  fastify.delete('/api/career/opportunities/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rowCount } = await db.query(
      'DELETE FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!rowCount) return reply.code(404).send({ error: 'Opportunity not found' })
    return reply.send({ ok: true })
  })
}
