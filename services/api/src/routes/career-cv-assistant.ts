import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('cv_studio')]
import { config } from '../config'

// CV Studio (docs/CV_STUDIO_PLAN.md §6) — the rewrite-only AI Assistant
// proxy. Every button in the wizard (Improve/Shorten/tone/ATS-optimise/fix
// grammar/remove repetition/responsibilities-to-achievements/rewrite-for-
// industry) calls the same operation-parameterized endpoint; "Add Metrics"
// and "suggest grouping" are two small, distinct operations that ask a
// question or re-bucket existing data rather than rewriting text.

const REWRITE_OPERATIONS = [
  'improve_wording', 'shorten', 'tone_professional', 'tone_executive', 'tone_graduate',
  'ats_optimise', 'fix_grammar', 'remove_repetition', 'responsibilities_to_achievements',
  'rewrite_for_industry',
] as const

async function callIntelligence<T>(path: string, body: unknown): Promise<T> {
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
  const res = await fetch(`${intelligenceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || `Intelligence service returned ${res.status}`)
  return res.json() as Promise<T>
}

export async function careerCvAssistantRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/career/cv-assistant/rewrite', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({
      text: z.string().min(1).max(4000),
      operation: z.enum(REWRITE_OPERATIONS),
      industry: z.string().max(100).optional(),
    }).parse(request.body)

    try {
      const result = await callIntelligence<{ rewritten: string }>('/internal/career/cv-assistant/rewrite', {
        user_id: userId, text: body.text, operation: body.operation, industry: body.industry ?? null,
      })
      return reply.send(result)
    } catch (err) {
      fastify.log.error({ err }, 'cv_assistant_rewrite_error')
      return reply.code(502).send({ error: 'Failed to rewrite this text' })
    }
  })

  fastify.post('/api/career/cv-assistant/suggest-metric', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({ text: z.string().min(1).max(2000) }).parse(request.body)

    try {
      const result = await callIntelligence<{ question: string }>('/internal/career/cv-assistant/suggest-metric', {
        user_id: userId, text: body.text,
      })
      return reply.send(result)
    } catch (err) {
      fastify.log.error({ err }, 'cv_assistant_suggest_metric_error')
      return reply.code(502).send({ error: 'Failed to suggest a metric prompt' })
    }
  })

  fastify.post('/api/career/cv-assistant/suggest-skill-grouping', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({ skills: z.array(z.string()).min(1).max(100) }).parse(request.body)

    try {
      const result = await callIntelligence<{ groups: { groupName: string; skills: string[] }[] }>(
        '/internal/career/cv-assistant/suggest-skill-grouping', { user_id: userId, skills: body.skills },
      )
      return reply.send(result)
    } catch (err) {
      fastify.log.error({ err }, 'cv_assistant_suggest_skill_grouping_error')
      return reply.code(502).send({ error: 'Failed to suggest skill grouping' })
    }
  })
}
