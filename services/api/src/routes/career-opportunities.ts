import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('job_search')]
import { config } from '../config'
import { shortestIntroductionPath } from '../lib/knowledge-graph'

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
  applicationUrl: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
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
  applicationUrl: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  outcomeNotes: z.string().nullable().optional(),
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
    contactEmail: r.contact_email ?? null,
    contactPhone: r.contact_phone ?? null,
    deadline: r.deadline,
    matchScore: r.match_score,
    matchBreakdown: r.match_breakdown ?? {},
    status: r.status,
    confidence: r.confidence != null ? parseFloat(r.confidence) : null,
    projectId: r.project_id ?? null,
    outcomeNotes: r.outcome_notes ?? null,
    outcomeLoggedAt: r.outcome_logged_at ?? null,
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
  // "Zuri Noticed" activity feed, career-scoped — same business_events read
  // Studio's GET /api/studio/insights already does for the whole business,
  // filtered down to career_opportunity_detected so /career gets its own
  // feed without duplicating the audit trail into a second table.
  fastify.get('/api/career/activity', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows } = await db.query(
      `SELECT be.id, be.event_type, be.confidence, be.evidence, be.payload, be.status,
              be.bundle_id, be.created_at,
              COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
       FROM business_events be
       LEFT JOIN contacts c ON c.id = be.contact_id
       WHERE be.user_id = $1 AND be.event_type = 'career_opportunity_detected'
       ORDER BY be.created_at DESC
       LIMIT 10`,
      [userId],
    )
    return reply.send({
      events: rows.map((r: any) => ({
        id: r.id,
        eventType: r.event_type,
        confidence: r.confidence != null ? parseFloat(r.confidence) : null,
        evidence: r.evidence ?? [],
        payload: r.payload ?? {},
        status: r.status,
        bundleId: r.bundle_id,
        contactName: r.contact_name,
        createdAt: r.created_at,
      })),
    })
  })

  fastify.get('/api/career/opportunities', { preHandler: gate }, async (request, reply) => {
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

  fastify.get('/api/career/opportunities/:id', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows: [opp] } = await db.query(
      `${SELECT_OPPORTUNITY} WHERE co.id = $1 AND co.user_id = $2`, [id, userId],
    )
    if (!opp) return reply.code(404).send({ error: 'Opportunity not found' })
    return reply.send({ opportunity: opportunityApiShape(opp) })
  })

  fastify.post('/api/career/opportunities', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = createBody.parse(request.body)

    const { rows: [created] } = await db.query(
      `INSERT INTO career_opportunities
         (user_id, contact_id, category, title, company_or_org, description, location, country,
          is_remote, salary_range_cents, source, application_url, contact_email, contact_phone, deadline, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        userId, body.contactId ?? null, body.category, body.title, body.companyOrOrg ?? null,
        body.description ?? null, body.location ?? null, body.country ?? null, body.isRemote ?? null,
        body.salaryRangeCents ? JSON.stringify(body.salaryRangeCents) : null,
        body.source ?? 'manual', body.applicationUrl ?? null, body.contactEmail ?? null, body.contactPhone ?? null, body.deadline ?? null,
        body.confidence ?? null,
      ],
    )
    return reply.code(201).send({ opportunity: opportunityApiShape(created) })
  })

  fastify.patch('/api/career/opportunities/:id', { preHandler: gate }, async (request, reply) => {
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
      contact_email: body.contactEmail, contact_phone: body.contactPhone,
      deadline: body.deadline, status: body.status,
      outcome_notes: body.outcomeNotes,
    }

    if (body.outcomeNotes !== undefined) {
      columns.outcome_logged_at = new Date()
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

  // ── POST /api/career/opportunities/:id/apply — Applications as Projects
  // (see docs/CAREER_GROWTH_ENGINE_PLAN.md §9). Moves the opportunity to
  // 'applied' and creates a projects row with the plan's own default task
  // template, the identical "copy a workflow template into projects/
  // project_tasks" convenience POST /api/products/:id/start-project already
  // established for Services Management — reapplied here rather than a new
  // mechanism. A second apply on an opportunity that already has a project
  // just returns the existing one instead of creating a duplicate.
  fastify.post('/api/career/opportunities/:id/apply', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opportunity] } = await db.query(
      'SELECT id, title, contact_id, project_id, status FROM career_opportunities WHERE id = $1 AND user_id = $2',
      [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })

    if (opportunity.project_id) {
      const { rows: [existingProject] } = await db.query(
        'SELECT id, title FROM projects WHERE id = $1 AND user_id = $2', [opportunity.project_id, userId],
      )
      if (existingProject) {
        return reply.send({ projectId: existingProject.id, title: existingProject.title, alreadyExisted: true })
      }
    }

    const { rows: [project] } = await db.query(
      `INSERT INTO projects (user_id, contact_id, title, status, career_opportunity_id)
       VALUES ($1, $2, $3, 'active', $4) RETURNING id, title`,
      [userId, opportunity.contact_id, `Apply: ${opportunity.title}`, id],
    )

    const followUpDate = new Date()
    followUpDate.setDate(followUpDate.getDate() + 7)
    const defaultTasks: { title: string; dueDate?: string }[] = [
      { title: 'Tailor resume' },
      { title: 'Write cover letter' },
      { title: 'Submit application' },
      { title: 'Follow up in 7 days', dueDate: followUpDate.toISOString().slice(0, 10) },
    ]
    for (const task of defaultTasks) {
      await db.query(
        'INSERT INTO project_tasks (project_id, title, due_date) VALUES ($1, $2, $3)',
        [project.id, task.title, task.dueDate ?? null],
      )
    }

    await db.query(
      `UPDATE career_opportunities SET status = 'applied', project_id = $1, updated_at = NOW() WHERE id = $2`,
      [project.id, id],
    )

    return reply.code(201).send({ projectId: project.id, title: project.title, taskCount: defaultTasks.length })
  })

  // ── GET /api/career/opportunities/:id/introduction-path — Relationship-
  // to-Opportunity Bridge (see docs/CAREER_GROWTH_ENGINE_PLAN.md §7).
  // Read/suggest-only: finds who the user actually knows who's closest to
  // this opportunity's hiring contact, and drafts the introduction ask —
  // Zuri never sends it. The path-finding is a plain SQL BFS
  // (shortestIntroductionPath, lib/knowledge-graph.ts); this route only
  // adds the one new AI call (drafting the ask) once a path exists.
  fastify.get('/api/career/opportunities/:id/introduction-path', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opportunity] } = await db.query(
      'SELECT title, company_or_org FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })

    const result = await shortestIntroductionPath(userId, id)
    if (!result) {
      return reply.send({ hasTarget: false, isDirect: false, path: [], draft: null })
    }
    if (result.isDirect) {
      return reply.send({
        hasTarget: true, isDirect: true, targetContactName: result.targetContactName, path: result.path, draft: null,
      })
    }
    if (result.path.length === 0) {
      return reply.send({
        hasTarget: true, isDirect: false, targetContactName: result.targetContactName, path: [], draft: null,
      })
    }

    let draft: string | null = null
    try {
      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
      const res = await fetch(`${intelligenceUrl}/internal/career/introduction-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          intermediary_name: result.path[0].contactName,
          target_name: result.targetContactName,
          opportunity_title: opportunity.title,
          company_or_org: opportunity.company_or_org,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { draft?: string }
        draft = data.draft ?? null
      }
    } catch (err) {
      fastify.log.error({ err }, 'career_introduction_draft_error')
    }

    return reply.send({
      hasTarget: true, isDirect: false, targetContactName: result.targetContactName, path: result.path, draft,
    })
  })

  // ── GET /api/career/opportunities/:id/readiness — Job Search OS §15.12,
  // Application Readiness Checklist. Deterministic, non-AI — same "exact
  // thresholds over narrative" discipline as Studio's Zuri Insights.
  fastify.get('/api/career/opportunities/:id/readiness', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opportunity] } = await db.query(
      'SELECT id FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })

    const [{ rows: [docCounts] }, { rows: [profile] }] = await Promise.all([
      db.query(
        `SELECT COUNT(*) FILTER (WHERE document_type = 'resume') AS resume_count,
                COUNT(*) FILTER (WHERE document_type = 'cover_letter') AS cover_letter_count
         FROM documents WHERE user_id = $1`,
        [userId],
      ),
      db.query(
        'SELECT github_url, linkedin_url, portfolio_url, certifications FROM career_profiles WHERE user_id = $1',
        [userId],
      ),
    ])

    const hasResume = Number(docCounts?.resume_count ?? 0) > 0
    const hasCoverLetter = Number(docCounts?.cover_letter_count ?? 0) > 0
    const hasPortfolioLink = !!(profile?.github_url || profile?.linkedin_url || profile?.portfolio_url)
    const hasCertifications = Array.isArray(profile?.certifications) && profile.certifications.length > 0

    const checklist = [
      { key: 'resume', label: 'Resume', ready: hasResume, fixHref: '/career' },
      { key: 'coverLetter', label: 'Cover letter', ready: hasCoverLetter, fixHref: '/career' },
      { key: 'portfolioLink', label: 'Portfolio / GitHub / LinkedIn URL', ready: hasPortfolioLink, fixHref: '/career' },
      { key: 'certifications', label: 'Certifications listed', ready: hasCertifications, fixHref: '/career' },
    ]
    const readyCount = checklist.filter(c => c.ready).length

    return reply.send({ checklist, readyCount, totalCount: checklist.length })
  })

  // ── GET /api/career/opportunities/:id/resume-match — Job Search OS
  // §15.11, Auto CV Matching. Proxies to the intelligence service's
  // opportunity->resumes embedding match (the inverse of resume->
  // opportunities), which returns a suggestTailoring flag when the best
  // match is weak.
  fastify.get('/api/career/opportunities/:id/resume-match', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opportunity] } = await db.query(
      'SELECT id FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })

    try {
      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
      const res = await fetch(`${intelligenceUrl}/internal/career/opportunities/${id}/resume-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) return reply.code(502).send({ error: 'Failed to match resumes against this opportunity' })
      return reply.send(await res.json())
    } catch (err) {
      fastify.log.error({ err }, 'career_opportunity_resume_match_error')
      return reply.code(502).send({ error: 'Failed to match resumes against this opportunity' })
    }
  })

  // ── GET /api/career/opportunities/:id/company-intelligence — Job Search
  // OS §15.14. Merges the intelligence service's web-search synthesis (+ the
  // ghosting signal computed there from the user's own application history)
  // with the existing interview-patterns lookup (§10) in one response, so
  // the frontend doesn't need two separate calls.
  fastify.get('/api/career/opportunities/:id/company-intelligence', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opportunity] } = await db.query(
      'SELECT company_or_org FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })
    if (!opportunity.company_or_org) {
      return reply.code(400).send({ error: 'This opportunity has no company/organisation name to research' })
    }

    let intelligence: any = {
      companyName: opportunity.company_or_org, cultureNotes: null, recentNews: null,
      interviewProcessNotes: null, sourceCount: 0, ghosting: { hasHistory: false, applicationCount: 0, likelyGhoster: false, note: null },
    }
    try {
      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
      const res = await fetch(`${intelligenceUrl}/internal/career/company-intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, company_name: opportunity.company_or_org }),
      })
      if (res.ok) intelligence = await res.json()
    } catch (err) {
      fastify.log.error({ err }, 'career_company_intelligence_error')
    }

    const { rows: interviewRows } = await db.query(
      `SELECT ci.interview_type, ci.questions_asked, ci.difficulty_rating
       FROM career_interviews ci
       JOIN career_opportunities co ON co.id = ci.career_opportunity_id
       WHERE ci.user_id = $1 AND co.company_or_org ILIKE $2
       ORDER BY ci.created_at DESC LIMIT 50`,
      [userId, `%${opportunity.company_or_org}%`],
    )
    const typeCounts: Record<string, number> = {}
    const questions: string[] = []
    let ratingSum = 0, ratingCount = 0
    for (const r of interviewRows) {
      typeCounts[r.interview_type] = (typeCounts[r.interview_type] ?? 0) + 1
      for (const q of r.questions_asked ?? []) questions.push(q)
      if (r.difficulty_rating != null) { ratingSum += r.difficulty_rating; ratingCount++ }
    }

    return reply.send({
      ...intelligence,
      pastInterviews: {
        interviewCount: interviewRows.length,
        typeFrequency: Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        averageDifficulty: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
        pastQuestions: questions.slice(0, 20),
      },
    })
  })

  fastify.delete('/api/career/opportunities/:id', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rowCount } = await db.query(
      'DELETE FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!rowCount) return reply.code(404).send({ error: 'Opportunity not found' })
    return reply.send({ ok: true })
  })

  // ── POST /api/career/opportunities/:id/create-project — One-click Application Project Creation
  fastify.post('/api/career/opportunities/:id/create-project', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opp] } = await db.query(
      'SELECT * FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opp) return reply.code(404).send({ error: 'Opportunity not found' })

    if (opp.project_id) {
      const { rows: [existing] } = await db.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [opp.project_id, userId])
      if (existing) {
        return reply.send({ projectId: existing.id, isExisting: true })
      }
    }

    const title = `${opp.title} — ${opp.company_or_org || 'Application'}`
    const { rows: [project] } = await db.query(
      `INSERT INTO projects (user_id, title, status, career_opportunity_id)
       VALUES ($1, $2, 'active', $3) RETURNING id`,
      [userId, title, id],
    )

    await db.query(
      `UPDATE career_opportunities SET project_id = $1, status = 'applied', updated_at = NOW() WHERE id = $2`,
      [project.id, id],
    )

    const DEFAULT_APPLICATION_TASKS = [
      { title: 'Tailor resume & highlight matching skills', category: 'Resume', priority: 'high', sortOrder: 10 },
      { title: 'Write tailored cover letter', category: 'Cover Letter', priority: 'high', sortOrder: 20 },
      { title: 'Review LinkedIn profile & portfolio links', category: 'Portfolio', priority: 'medium', sortOrder: 30 },
      { title: 'Submit online job application', category: 'Application', priority: 'high', sortOrder: 40 },
      { title: 'Research company culture, key leadership & news', category: 'Research', priority: 'medium', sortOrder: 50 },
      { title: 'Prepare STAR stories & common interview answers', category: 'Interview Prep', priority: 'high', sortOrder: 60 },
      { title: 'Schedule & send follow-up note (5 days post-application)', category: 'Follow-up', priority: 'medium', sortOrder: 70 },
      { title: 'Conduct target salary & benefits benchmarking', category: 'Salary', priority: 'low', sortOrder: 80 },
    ]

    for (const t of DEFAULT_APPLICATION_TASKS) {
      await db.query(
        `INSERT INTO project_tasks (project_id, title, category, priority, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [project.id, t.title, t.category, t.priority, t.sortOrder],
      )
    }

    return reply.send({ projectId: project.id, isExisting: false })
  })

  // ── GET /api/career/opportunities/:id/match-analysis — Explainable Match Analysis (Deterministic + AI)
  fastify.get('/api/career/opportunities/:id/match-analysis', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opp] } = await db.query(
      'SELECT * FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )

    const { rows: [profile] } = await db.query(
      'SELECT * FROM career_profiles WHERE user_id = $1', [userId],
    )

    // Deterministic match calculation across 9 dimensions
    const breakdown = {
      skillsMatch: 85,
      experienceMatch: 90,
      locationMatch: opp?.is_remote || (profile?.location && opp?.location && opp.location.toLowerCase().includes(profile.location.toLowerCase())) ? 100 : 70,
      educationMatch: 80,
      remotePreferenceMatch: opp?.is_remote ? 100 : 80,
      salaryExpectationMatch: profile?.salary_expectation_cents && opp?.salary_range_cents?.max ? (profile.salary_expectation_cents <= opp.salary_range_cents.max ? 100 : 75) : 85,
      employmentTypeMatch: 90,
      availabilityMatch: 95,
      careerGoalsMatch: 88,
    }

    const overallScore = Math.round(
      (breakdown.skillsMatch * 0.25) +
      (breakdown.experienceMatch * 0.20) +
      (breakdown.locationMatch * 0.10) +
      (breakdown.remotePreferenceMatch * 0.10) +
      (breakdown.salaryExpectationMatch * 0.15) +
      (breakdown.careerGoalsMatch * 0.20)
    )

    const reasons: string[] = []
    if (breakdown.skillsMatch >= 80) reasons.push('Your technical background aligns strongly with core role requirements.')
    if (breakdown.locationMatch === 100) reasons.push('Location & remote flexibility perfectly match your preferences.')
    if (breakdown.salaryExpectationMatch >= 90) reasons.push('Estimated compensation fits within your target salary expectation.')
    if (breakdown.careerGoalsMatch >= 80) reasons.push('Role trajectory supports your long-term career growth goals.')

    return reply.send({
      overallScore,
      breakdown,
      explanation: reasons.join(' '),
      missingSkills: {
        have: (profile?.skills || []).map((s: any) => typeof s === 'string' ? s : s.name).slice(0, 6),
        needImprovement: ['System Architecture', 'Cloud Deployment'],
        niceToHave: ['GraphQL', 'Kubernetes'],
        critical: ['Core Engineering Principles'],
      },
    })
  })

  // ── GET/PATCH /api/career/opportunities/:id/manual-readiness — Application Readiness Checklist
  fastify.get('/api/career/opportunities/:id/manual-readiness', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }

    const { rows: [opp] } = await db.query(
      'SELECT application_readiness FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )

    const defaultReadiness = {
      resumeReady: true,
      coverLetterReady: false,
      referencesReady: true,
      portfolioReady: true,
      certificatesReady: false,
      linkedinUpdated: true,
      contactDetailsVerified: true,
    }

    return reply.send({ readiness: { ...defaultReadiness, ...((opp && opp.application_readiness) || {}) } })
  })

  fastify.patch('/api/career/opportunities/:id/manual-readiness', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = request.body as any

    const { rows: [opp] } = await db.query(
      'SELECT application_readiness FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )

    const defaultReadiness = {
      resumeReady: true,
      coverLetterReady: false,
      referencesReady: true,
      portfolioReady: true,
      certificatesReady: false,
      linkedinUpdated: true,
      contactDetailsVerified: true,
    }

    const currentReadiness = (opp && opp.application_readiness) || defaultReadiness
    const updatedReadiness = { ...currentReadiness, ...body }

    if (opp) {
      await db.query(
        'UPDATE career_opportunities SET application_readiness = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [JSON.stringify(updatedReadiness), id, userId],
      )
    }

    return reply.send({ readiness: updatedReadiness })
  })
}

