import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

// Zuri Career & Growth Engine, Phase 4 — Interview Memory (see
// docs/CAREER_GROWTH_ENGINE_PLAN.md §10). scheduled_at also writes a
// calendar_events row, reusing the existing calendar integration rather than
// a parallel scheduling system — calendar_events requires a calendar_id
// (every user gets a default "My Calendar" row at signup, see auth.ts), a
// real schema detail the plan's own prose glossed over.

const INTERVIEW_TYPES = ['phone_screen', 'technical', 'behavioral', 'case', 'panel', 'final'] as const
const OUTCOMES = ['pending', 'passed', 'failed', 'withdrawn'] as const

const createBody = z.object({
  interviewType: z.enum(INTERVIEW_TYPES).default('phone_screen'),
  scheduledAt: z.string().optional(),
  questionsAsked: z.array(z.string()).optional(),
  userNotes: z.string().max(4000).optional(),
})

const patchBody = z.object({
  interviewType: z.enum(INTERVIEW_TYPES).optional(),
  scheduledAt: z.string().nullable().optional(),
  questionsAsked: z.array(z.string()).optional(),
  userNotes: z.string().max(4000).nullable().optional(),
  aiFeedback: z.string().max(4000).nullable().optional(),
  difficultyRating: z.number().int().min(1).max(5).nullable().optional(),
  outcome: z.enum(OUTCOMES).optional(),
})

function interviewApiShape(r: any) {
  return {
    id: r.id,
    careerOpportunityId: r.career_opportunity_id,
    roundNumber: r.round_number,
    interviewType: r.interview_type,
    scheduledAt: r.scheduled_at,
    calendarEventId: r.calendar_event_id,
    questionsAsked: r.questions_asked ?? [],
    userNotes: r.user_notes,
    aiFeedback: r.ai_feedback,
    difficultyRating: r.difficulty_rating,
    outcome: r.outcome,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function defaultCalendarId(userId: string): Promise<string | null> {
  const { rows: [cal] } = await db.query(
    'SELECT id FROM calendars WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
    [userId],
  )
  return cal?.id ?? null
}

export async function careerInterviewsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/opportunities/:id/interviews', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows } = await db.query(
      'SELECT * FROM career_interviews WHERE career_opportunity_id = $1 AND user_id = $2 ORDER BY round_number ASC',
      [id, userId],
    )
    return reply.send({ interviews: rows.map(interviewApiShape) })
  })

  fastify.post('/api/career/opportunities/:id/interviews', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = createBody.parse(request.body)

    const { rows: [opportunity] } = await db.query(
      'SELECT id, title, company_or_org FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' })

    const { rows: [maxRound] } = await db.query(
      'SELECT COALESCE(MAX(round_number), 0) AS max_round FROM career_interviews WHERE career_opportunity_id = $1',
      [id],
    )
    const roundNumber = (maxRound.max_round ?? 0) + 1

    let calendarEventId: string | null = null
    if (body.scheduledAt) {
      const calendarId = await defaultCalendarId(userId)
      if (calendarId) {
        const { rows: [event] } = await db.query(
          `INSERT INTO calendar_events (calendar_id, user_id, title, description, start_time, status)
           VALUES ($1, $2, $3, $4, $5, 'confirmed') RETURNING id`,
          [
            calendarId, userId,
            `Interview: ${opportunity.title}${opportunity.company_or_org ? ` (${opportunity.company_or_org})` : ''}`,
            `Round ${roundNumber} — ${body.interviewType.replace(/_/g, ' ')}`,
            body.scheduledAt,
          ],
        )
        calendarEventId = event.id
      }
    }

    const { rows: [created] } = await db.query(
      `INSERT INTO career_interviews
         (user_id, career_opportunity_id, round_number, interview_type, scheduled_at, calendar_event_id, questions_asked, user_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        userId, id, roundNumber, body.interviewType, body.scheduledAt ?? null, calendarEventId,
        JSON.stringify(body.questionsAsked ?? []), body.userNotes ?? null,
      ],
    )
    return reply.code(201).send({ interview: interviewApiShape(created) })
  })

  fastify.patch('/api/career/interviews/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const body = patchBody.parse(request.body)

    const { rows: [existing] } = await db.query(
      'SELECT id, calendar_event_id, career_opportunity_id, round_number, interview_type FROM career_interviews WHERE id = $1 AND user_id = $2',
      [id, userId],
    )
    if (!existing) return reply.code(404).send({ error: 'Interview not found' })

    if (body.scheduledAt !== undefined) {
      if (existing.calendar_event_id) {
        await db.query(
          'UPDATE calendar_events SET start_time = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [body.scheduledAt, existing.calendar_event_id, userId],
        )
      } else if (body.scheduledAt) {
        const calendarId = await defaultCalendarId(userId)
        if (calendarId) {
          const { rows: [opportunity] } = await db.query(
            'SELECT title, company_or_org FROM career_opportunities WHERE id = $1', [existing.career_opportunity_id],
          )
          const { rows: [event] } = await db.query(
            `INSERT INTO calendar_events (calendar_id, user_id, title, description, start_time, status)
             VALUES ($1, $2, $3, $4, $5, 'confirmed') RETURNING id`,
            [
              calendarId, userId,
              `Interview: ${opportunity?.title ?? ''}${opportunity?.company_or_org ? ` (${opportunity.company_or_org})` : ''}`,
              `Round ${existing.round_number} — ${(body.interviewType ?? existing.interview_type).replace(/_/g, ' ')}`,
              body.scheduledAt,
            ],
          )
          await db.query('UPDATE career_interviews SET calendar_event_id = $1 WHERE id = $2', [event.id, id])
        }
      }
    }

    const columns: Record<string, unknown> = {
      interview_type: body.interviewType, scheduled_at: body.scheduledAt,
      user_notes: body.userNotes, ai_feedback: body.aiFeedback,
      difficulty_rating: body.difficultyRating, outcome: body.outcome,
    }
    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [id, userId]
    let idx = 3
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}`)
      values.push(value)
    }
    if (body.questionsAsked !== undefined) {
      sets.push(`questions_asked = $${idx++}::jsonb`)
      values.push(JSON.stringify(body.questionsAsked))
    }

    const { rows: [updated] } = await db.query(
      `UPDATE career_interviews SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    )
    return reply.send({ interview: interviewApiShape(updated) })
  })

  fastify.delete('/api/career/interviews/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    const { rows: [existing] } = await db.query(
      'SELECT calendar_event_id FROM career_interviews WHERE id = $1 AND user_id = $2', [id, userId],
    )
    if (!existing) return reply.code(404).send({ error: 'Interview not found' })
    await db.query('DELETE FROM career_interviews WHERE id = $1 AND user_id = $2', [id, userId])
    if (existing.calendar_event_id) {
      await db.query('DELETE FROM calendar_events WHERE id = $1 AND user_id = $2', [existing.calendar_event_id, userId])
    }
    return reply.send({ ok: true })
  })

  // ── GET /api/career/interview-patterns?company=X — "Company X tends to
  // ask system design first" (§10), a plain SQL aggregation over the user's
  // own past interviews for that company, not a new prediction model.
  fastify.get('/api/career/interview-patterns', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { company } = z.object({ company: z.string().min(1) }).parse(request.query)

    const { rows } = await db.query(
      `SELECT ci.interview_type, ci.questions_asked, ci.outcome, ci.difficulty_rating
       FROM career_interviews ci
       JOIN career_opportunities co ON co.id = ci.career_opportunity_id
       WHERE ci.user_id = $1 AND co.company_or_org ILIKE $2
       ORDER BY ci.created_at DESC LIMIT 50`,
      [userId, `%${company}%`],
    )

    const typeCounts: Record<string, number> = {}
    const questions: string[] = []
    let ratingSum = 0
    let ratingCount = 0
    for (const r of rows) {
      typeCounts[r.interview_type] = (typeCounts[r.interview_type] ?? 0) + 1
      for (const q of r.questions_asked ?? []) questions.push(q)
      if (r.difficulty_rating != null) { ratingSum += r.difficulty_rating; ratingCount++ }
    }

    return reply.send({
      interviewCount: rows.length,
      typeFrequency: Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      averageDifficulty: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      pastQuestions: questions.slice(0, 20),
    })
  })
}
