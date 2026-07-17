import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// CV Studio Phase 1 (docs/CV_STUDIO_PLAN.md §3, §10, §18) — the CV-as-a-
// view-over-profile object model. A tailored variant is a new career_cvs
// row with source_cv_id set (mirrors documents.source_document_id's
// version-chain convention) — its own section visibility/ordering/summary
// override lives in structured_content, but employment/education/
// certification facts are always read live from the Phase 1 entry tables,
// never copied here. This is deliberately CRUD-only scaffolding: the
// wizard (Phase 4) and Web Editor (Phase 7) are what actually populate
// structured_content meaningfully — every PATCH here already writes a new
// career_cv_versions row (§10's "every save = a new version"), so those
// later phases get working version history for free.

const TEMPLATE_KEYS = ['professional', 'modern', 'executive', 'creative'] as const
const PAGE_SIZES = ['A4', 'Letter'] as const
const SECTION_TYPES = [
  'summary', 'employment', 'education', 'certifications', 'skills',
  'projects', 'awards', 'volunteer', 'memberships', 'publications', 'references',
] as const

function cvApiShape(r: any) {
  return {
    id: r.id,
    title: r.title,
    templateKey: r.template_key,
    pageSize: r.page_size,
    isMaster: r.is_master,
    careerOpportunityId: r.career_opportunity_id,
    sourceCvId: r.source_cv_id,
    structuredContent: r.structured_content ?? {},
    currentVersion: r.current_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function sectionApiShape(r: any) {
  return {
    id: r.id, sectionType: r.section_type, isVisible: r.is_visible,
    sortOrder: r.sort_order, customHeading: r.custom_heading,
  }
}

function projectLinkApiShape(r: any) {
  return {
    id: r.id, projectId: r.project_id, sortOrder: r.sort_order,
    customDescriptionOverride: r.custom_description_override,
    projectTitle: r.project_title ?? undefined,
  }
}

async function writeVersionSnapshot(cvId: string, structuredContent: unknown): Promise<number> {
  const { rows: [cv] } = await db.query('SELECT current_version FROM career_cvs WHERE id = $1', [cvId])
  const nextVersion = (cv?.current_version ?? 0) + 1
  await db.query(
    'INSERT INTO career_cv_versions (cv_id, version_number, snapshot) VALUES ($1, $2, $3::jsonb)',
    [cvId, nextVersion, JSON.stringify(structuredContent ?? {})],
  )
  await db.query('UPDATE career_cvs SET current_version = $1 WHERE id = $2', [nextVersion, cvId])
  return nextVersion
}

export async function careerCvsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/cvs', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows } = await db.query(
      'SELECT * FROM career_cvs WHERE user_id = $1 ORDER BY is_master DESC, created_at DESC', [userId],
    )
    return reply.send({ cvs: rows.map(cvApiShape) })
  })

  fastify.get('/api/career/cvs/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows: [cv] } = await db.query('SELECT * FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!cv) return reply.code(404).send({ error: 'CV not found' })

    const [{ rows: sections }, { rows: projectLinks }] = await Promise.all([
      db.query('SELECT * FROM career_cv_sections WHERE cv_id = $1 ORDER BY sort_order ASC', [id]),
      db.query(
        `SELECT l.*, p.title AS project_title FROM career_cv_project_links l
         JOIN projects p ON p.id = l.project_id WHERE l.cv_id = $1 ORDER BY l.sort_order ASC`,
        [id],
      ),
    ])

    return reply.send({
      cv: cvApiShape(cv),
      sections: sections.map(sectionApiShape),
      projectLinks: projectLinks.map(projectLinkApiShape),
    })
  })

  const createBody = z.object({
    title: z.string().min(1).max(255),
    templateKey: z.enum(TEMPLATE_KEYS).optional(),
    pageSize: z.enum(PAGE_SIZES).optional(),
    isMaster: z.boolean().optional(),
    careerOpportunityId: z.string().uuid().nullable().optional(),
    sourceCvId: z.string().uuid().nullable().optional(),
  })

  fastify.post('/api/career/cvs', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = createBody.parse(request.body)

    // "Create Variant" (§8) — copy the source CV's section visibility/
    // ordering into the new row rather than starting from a blank slate.
    let sourceSections: any[] = []
    if (body.sourceCvId) {
      const { rows: [source] } = await db.query(
        'SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [body.sourceCvId, userId],
      )
      if (!source) return reply.code(404).send({ error: 'Source CV not found' })
      const { rows } = await db.query(
        'SELECT section_type, is_visible, sort_order, custom_heading FROM career_cv_sections WHERE cv_id = $1',
        [body.sourceCvId],
      )
      sourceSections = rows
    }

    const { rows: [created] } = await db.query(
      `INSERT INTO career_cvs (user_id, title, template_key, page_size, is_master, career_opportunity_id, source_cv_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId, body.title, body.templateKey ?? 'professional', body.pageSize ?? 'A4',
        body.isMaster ?? false, body.careerOpportunityId ?? null, body.sourceCvId ?? null,
      ],
    )

    if (sourceSections.length > 0) {
      for (const s of sourceSections) {
        await db.query(
          `INSERT INTO career_cv_sections (cv_id, section_type, is_visible, sort_order, custom_heading)
           VALUES ($1, $2, $3, $4, $5)`,
          [created.id, s.section_type, s.is_visible, s.sort_order, s.custom_heading],
        )
      }
    }

    return reply.code(201).send({ cv: cvApiShape(created) })
  })

  const patchBody = z.object({
    title: z.string().min(1).max(255).optional(),
    templateKey: z.enum(TEMPLATE_KEYS).optional(),
    pageSize: z.enum(PAGE_SIZES).optional(),
    careerOpportunityId: z.string().uuid().nullable().optional(),
    structuredContent: z.record(z.any()).optional(),
  })

  fastify.patch('/api/career/cvs/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = patchBody.parse(request.body)

    const { rows: [existing] } = await db.query('SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!existing) return reply.code(404).send({ error: 'CV not found' })

    const columns: Record<string, unknown> = {
      title: body.title, template_key: body.templateKey, page_size: body.pageSize,
      career_opportunity_id: body.careerOpportunityId,
    }
    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [id, userId]
    let idx = 3
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}`)
      values.push(value)
    }
    if (body.structuredContent !== undefined) {
      sets.push(`structured_content = $${idx++}::jsonb`)
      values.push(JSON.stringify(body.structuredContent))
    }

    const { rows: [updated] } = await db.query(
      `UPDATE career_cvs SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    )

    // Every save writes a new version (§10) — the wizard/editor phases
    // inherit working version history without building it themselves.
    if (body.structuredContent !== undefined) {
      await writeVersionSnapshot(id, updated.structured_content)
      const { rows: [refreshed] } = await db.query('SELECT * FROM career_cvs WHERE id = $1', [id])
      return reply.send({ cv: cvApiShape(refreshed) })
    }

    return reply.send({ cv: cvApiShape(updated) })
  })

  fastify.delete('/api/career/cvs/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rowCount } = await db.query('DELETE FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!rowCount) return reply.code(404).send({ error: 'CV not found' })
    return reply.send({ ok: true })
  })

  // ── Sections — whole-list replace, same convention as Services
  // Management's PUT .../workflow-stages (a template is edited as one
  // ordered set, not incrementally).
  fastify.put('/api/career/cvs/:id/sections', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = z.object({
      sections: z.array(z.object({
        sectionType: z.enum(SECTION_TYPES),
        isVisible: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        customHeading: z.string().max(255).nullable().optional(),
      })),
    }).parse(request.body)

    const { rows: [cv] } = await db.query('SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!cv) return reply.code(404).send({ error: 'CV not found' })

    await db.query('DELETE FROM career_cv_sections WHERE cv_id = $1', [id])
    for (const [index, s] of body.sections.entries()) {
      await db.query(
        `INSERT INTO career_cv_sections (cv_id, section_type, is_visible, sort_order, custom_heading)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, s.sectionType, s.isVisible ?? true, s.sortOrder ?? index, s.customHeading ?? null],
      )
    }

    const { rows } = await db.query('SELECT * FROM career_cv_sections WHERE cv_id = $1 ORDER BY sort_order ASC', [id])
    return reply.send({ sections: rows.map(sectionApiShape) })
  })

  // ── Project links — checkbox-picker over the user's own projects (§4
  // Step 8). Whole-list replace, same reasoning as sections above.
  fastify.put('/api/career/cvs/:id/project-links', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = z.object({
      projectLinks: z.array(z.object({
        projectId: z.string().uuid(),
        sortOrder: z.number().int().optional(),
        customDescriptionOverride: z.string().nullable().optional(),
      })),
    }).parse(request.body)

    const { rows: [cv] } = await db.query('SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!cv) return reply.code(404).send({ error: 'CV not found' })

    await db.query('DELETE FROM career_cv_project_links WHERE cv_id = $1', [id])
    for (const [index, l] of body.projectLinks.entries()) {
      await db.query(
        `INSERT INTO career_cv_project_links (cv_id, project_id, sort_order, custom_description_override)
         VALUES ($1, $2, $3, $4)`,
        [id, l.projectId, l.sortOrder ?? index, l.customDescriptionOverride ?? null],
      )
    }

    const { rows } = await db.query(
      `SELECT l.*, p.title AS project_title FROM career_cv_project_links l
       JOIN projects p ON p.id = l.project_id WHERE l.cv_id = $1 ORDER BY l.sort_order ASC`,
      [id],
    )
    return reply.send({ projectLinks: rows.map(projectLinkApiShape) })
  })

  // ── Version history (§10) — restore/duplicate/compare, all non-
  // destructive.
  fastify.get('/api/career/cvs/:id/versions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows: [cv] } = await db.query('SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!cv) return reply.code(404).send({ error: 'CV not found' })

    const { rows } = await db.query(
      'SELECT id, version_number, snapshot, created_at FROM career_cv_versions WHERE cv_id = $1 ORDER BY version_number DESC',
      [id],
    )
    return reply.send({
      versions: rows.map(r => ({ id: r.id, versionNumber: r.version_number, snapshot: r.snapshot, createdAt: r.created_at })),
    })
  })

  fastify.post('/api/career/cvs/:id/versions/:versionNumber/restore', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id, versionNumber } = request.params as { id: string; versionNumber: string }

    const { rows: [cv] } = await db.query('SELECT id FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!cv) return reply.code(404).send({ error: 'CV not found' })

    const { rows: [version] } = await db.query(
      'SELECT snapshot FROM career_cv_versions WHERE cv_id = $1 AND version_number = $2',
      [id, Number(versionNumber)],
    )
    if (!version) return reply.code(404).send({ error: 'Version not found' })

    // Restore = a new version copying the old snapshot forward — never
    // destructive, per §10.
    await db.query(
      'UPDATE career_cvs SET structured_content = $1::jsonb WHERE id = $2',
      [JSON.stringify(version.snapshot), id],
    )
    const newVersion = await writeVersionSnapshot(id, version.snapshot)

    const { rows: [updated] } = await db.query('SELECT * FROM career_cvs WHERE id = $1', [id])
    return reply.send({ cv: cvApiShape(updated), restoredAsVersion: newVersion })
  })

  // ── Duplicate — a new career_cvs row with source_cv_id set, same
  // "Create Variant" path POST /api/career/cvs already implements.
  fastify.post('/api/career/cvs/:id/duplicate', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = z.object({ title: z.string().min(1).max(255).optional() }).parse(request.body ?? {})

    const { rows: [source] } = await db.query('SELECT * FROM career_cvs WHERE id = $1 AND user_id = $2', [id, userId])
    if (!source) return reply.code(404).send({ error: 'CV not found' })

    const { rows: [created] } = await db.query(
      `INSERT INTO career_cvs (user_id, title, template_key, page_size, is_master, career_opportunity_id, source_cv_id, structured_content)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7::jsonb) RETURNING *`,
      [
        userId, body.title ?? `${source.title} (copy)`, source.template_key, source.page_size,
        source.career_opportunity_id, id, JSON.stringify(source.structured_content ?? {}),
      ],
    )

    const { rows: sections } = await db.query('SELECT * FROM career_cv_sections WHERE cv_id = $1', [id])
    for (const s of sections) {
      await db.query(
        `INSERT INTO career_cv_sections (cv_id, section_type, is_visible, sort_order, custom_heading)
         VALUES ($1, $2, $3, $4, $5)`,
        [created.id, s.section_type, s.is_visible, s.sort_order, s.custom_heading],
      )
    }
    const { rows: links } = await db.query('SELECT * FROM career_cv_project_links WHERE cv_id = $1', [id])
    for (const l of links) {
      await db.query(
        `INSERT INTO career_cv_project_links (cv_id, project_id, sort_order, custom_description_override)
         VALUES ($1, $2, $3, $4)`,
        [created.id, l.project_id, l.sort_order, l.custom_description_override],
      )
    }

    return reply.code(201).send({ cv: cvApiShape(created) })
  })
}
