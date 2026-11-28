/**
 * Reply drafts (reply engine v3) and AI routing settings, for the phone and
 * the web (docs/ZURI_AI_PLAN.md Parts A–B).
 *
 *   POST /api/conversations/:id/reply-drafts   draft the owner's next reply
 *   POST /api/reply-drafts/:draftId/outcome    sent / edited / dismissed
 *   GET  /api/ai/routing                       model chain per job
 *   PUT  /api/ai/routing                       set (or reset) one job's chain
 *   POST /api/ai/routing/test                  check models with a tiny call
 *
 * Drafting runs in the intelligence service (reply/engine.py). Each option is
 * one suggested_replies row; a draft groups them by draft_id.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { getEffectiveScope } from '../lib/org-scope'

const INTELLIGENCE = () => process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000'
const JOBS = ['reply_draft', 'auto_reply', 'chat_summary', 'analysis', 'networking_coach'] as const
const MODEL_RE = /^(anthropic|gemini|openai|deepseek)\/[A-Za-z0-9._:-]{2,80}$/

const draftBody = z.object({
  answer: z.object({ questionId: z.string().uuid().optional(), text: z.string().min(1).max(300) }).optional(),
  instruction: z.string().min(1).max(300).optional(),
}).strict()

const outcomeBody = z.object({
  optionId: z.string().uuid().optional(),
  outcome: z.enum(['sent', 'edited', 'dismissed']),
  sentMessages: z.array(z.string().max(4000)).min(1).max(5).optional(),
})

type EngineOption = {
  id?: string
  tone: string
  why: string
  messages: { text: string; replyTo: number | null; quoting: string | null }[]
}
type EngineResult = {
  skipped?: string
  error?: string
  attempts?: unknown[]
  draftId?: string
  model?: string
  noReplyNeeded?: boolean
  needsOwner?: boolean
  needsOwnerReason?: string
  question?: { id: string; text: string; answers: string[] } | null
  unanswered?: { index: number; text: string }[]
  options?: EngineOption[]
}

export async function replyDraftRoutes(fastify: FastifyInstance) {
  fastify.post('/api/conversations/:id/reply-drafts', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'invalid_id' })
    const parsed = draftBody.safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId

    const { rows: [conv] } = await db.query<{ is_group: boolean; ai_enabled: boolean }>(
      `SELECT co.is_group, c.ai_enabled FROM conversations c JOIN contacts co ON co.id = c.contact_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, ownerId],
    )
    if (!conv) return reply.code(404).send({ error: 'not_found' })
    if (conv.is_group) return reply.code(422).send({ error: 'group_chat' })
    if (!conv.ai_enabled) return reply.code(409).send({ error: 'ai_off' })

    let result: EngineResult
    try {
      const res = await fetch(`${INTELLIGENCE()}/internal/replies/${id}/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: ownerId,
          owner_answer: parsed.data.answer?.text ?? null,
          instruction: parsed.data.instruction ?? null,
        }),
        signal: AbortSignal.timeout(180_000),
      })
      if (!res.ok) {
        request.log.error({ status: res.status, body: (await res.text()).slice(0, 300) }, 'reply_draft_engine_error')
        return reply.code(502).send({ error: 'engine_unavailable' })
      }
      result = (await res.json()) as EngineResult
    } catch (err) {
      request.log.error({ err }, 'reply_draft_engine_unreachable')
      return reply.code(502).send({ error: 'engine_unavailable' })
    }

    if (result.skipped === 'ai_off') return reply.code(409).send({ error: 'ai_off' })
    if (result.skipped === 'group_chat') return reply.code(422).send({ error: 'group_chat' })
    if (result.error) return reply.code(502).send({ error: result.error, attempts: result.attempts ?? [] })
    if (result.skipped) {
      return reply.send({ draftId: null, options: [], question: null, model: null, info: result.skipped })
    }

    return reply.send({
      draftId: result.draftId ?? null,
      model: result.model ?? null,
      noReplyNeeded: Boolean(result.noReplyNeeded),
      needsOwnerReason: result.needsOwner ? result.needsOwnerReason || null : null,
      question: result.question ?? null,
      options: (result.options ?? []).filter((o) => o.id).map((o) => ({
        id: o.id,
        messages: o.messages.map((m) => m.text),
        // The same messages with what each one quotes (swipe-to-reply), if anything.
        parts: o.messages.map((m) => ({ text: m.text, quoting: m.quoting })),
        tone: o.tone,
        why: o.why,
      })),
      answering: (result.unanswered ?? []).map((u) => u.text),
    })
  })

  // The newest draft the server already made (live drafting after each
  // incoming message), so a client can show it the moment the chat opens.
  // Only returned while it still answers the chat's newest message.
  fastify.get('/api/conversations/:id/reply-drafts/latest', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { id } = request.params as { id: string }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'invalid_id' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    const { rows: [conv] } = await db.query(`SELECT ai_enabled FROM conversations WHERE id = $1 AND user_id = $2`, [id, ownerId])
    if (!conv) return reply.code(404).send({ error: 'not_found' })
    if (!conv.ai_enabled) return reply.code(409).send({ error: 'ai_off' })

    const { rows } = await db.query<{
      id: string; draft_id: string; suggestion_text: string; tone: string | null; reasoning: string | null
      parts: { text: string; quoteMessageId: string | null }[] | null; needs_owner: boolean
      needs_owner_reason: string | null; owner_question: unknown; model: string | null; created_at: Date
    }>(
      `WITH newest AS (
         SELECT id, sender_type FROM messages WHERE conversation_id = $1
         ORDER BY whatsapp_timestamp DESC, ingest_seq DESC LIMIT 1
       ), d AS (
         SELECT sr.draft_id FROM suggested_replies sr, newest
         WHERE sr.message_id = newest.id AND newest.sender_type = 'contact'
           AND sr.status = 'pending' AND sr.draft_id IS NOT NULL
         ORDER BY sr.created_at DESC LIMIT 1
       )
       SELECT sr.id, sr.draft_id, sr.suggestion_text, sr.tone, sr.reasoning, sr.parts, sr.needs_owner,
              sr.needs_owner_reason, sr.owner_question, sr.model, sr.created_at
       FROM suggested_replies sr JOIN d ON d.draft_id = sr.draft_id
       WHERE sr.status = 'pending'
       ORDER BY sr.created_at, sr.ctid`,      -- options share one timestamp; ctid keeps insert order
      [id],
    )
    if (!rows.length) return reply.send({ draftId: null, options: [], question: null, model: null })
    // The engine stores these JSONB values as encoded strings; accept both forms.
    const json = <T>(v: unknown): T | null => {
      if (typeof v !== 'string') return (v as T) ?? null
      try { return JSON.parse(v) as T } catch { return null }
    }
    for (const r of rows) {
      r.parts = json<{ text: string; quoteMessageId: string | null }[]>(r.parts)
      r.owner_question = json(r.owner_question)
    }

    const quoteIds = rows.flatMap((r) => (r.parts ?? []).map((p) => p.quoteMessageId).filter(Boolean)) as string[]
    const quoted = new Map<string, string>()
    if (quoteIds.length) {
      const { rows: q } = await db.query<{ id: string; body: string | null; message_type: string }>(
        `SELECT id, body, message_type::text AS message_type FROM messages WHERE id = ANY($1::uuid[])`, [quoteIds])
      for (const m of q) quoted.set(m.id, m.body ?? `[${m.message_type}]`)
    }
    const first = rows[0]
    return reply.send({
      draftId: first.draft_id,
      model: first.model,
      noReplyNeeded: false,
      needsOwnerReason: first.needs_owner ? first.needs_owner_reason : null,
      question: first.needs_owner ? first.owner_question ?? null : null,
      createdAt: new Date(first.created_at).getTime(),
      options: rows.map((r) => {
        const parts = r.parts?.length ? r.parts : [{ text: r.suggestion_text, quoteMessageId: null }]
        return {
          id: r.id,
          messages: parts.map((p) => p.text),
          parts: parts.map((p) => ({ text: p.text, quoting: p.quoteMessageId ? quoted.get(p.quoteMessageId) ?? null : null })),
          tone: r.tone ?? '',
          why: r.reasoning ?? '',
        }
      }),
    })
  })

  fastify.post('/api/reply-drafts/:draftId/outcome', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { draftId } = request.params as { draftId: string }
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) return reply.code(400).send({ error: 'invalid_id' })
    const parsed = outcomeBody.safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() })
    const { optionId, outcome, sentMessages } = parsed.data
    if (outcome !== 'dismissed' && !optionId) return reply.code(400).send({ error: 'optionId_required' })
    if (outcome === 'edited' && !sentMessages) return reply.code(400).send({ error: 'sentMessages_required' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId

    const { rows } = await db.query<{ id: string }>(
      `SELECT sr.id FROM suggested_replies sr
       JOIN messages m ON m.id = sr.message_id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE sr.draft_id = $1 AND c.user_id = $2`,
      [draftId, ownerId],
    )
    if (!rows.length) return reply.code(404).send({ error: 'not_found' })
    if (optionId && !rows.some((r) => r.id === optionId)) return reply.code(404).send({ error: 'option_not_found' })

    if (outcome === 'dismissed') {
      await db.query(
        `UPDATE suggested_replies SET status = 'dismissed', user_feedback = 'dismissed', updated_at = NOW()
         WHERE draft_id = $1 AND status = 'pending'`,
        [draftId],
      )
      return reply.code(204).send()
    }
    // What the owner actually sent is what the engine learns from.
    const editedText = outcome === 'edited' ? sentMessages!.join('\n') : null
    await db.query(
      `UPDATE suggested_replies
       SET status = $2::reply_status, edited_text = COALESCE($3, edited_text), sent_at = NOW(),
           user_feedback = $4, updated_at = NOW()
       WHERE id = $1`,
      [optionId, outcome === 'edited' ? 'edited_and_sent' : 'sent', editedText, outcome],
    )
    await db.query(
      `UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW()
       WHERE draft_id = $1 AND id <> $2 AND status = 'pending'`,
      [draftId, optionId],
    )
    return reply.code(204).send()
  })

  fastify.get('/api/ai/routing', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    try {
      const res = await fetch(`${INTELLIGENCE()}/internal/ai/routing?user_id=${encodeURIComponent(ownerId)}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return reply.code(502).send({ error: 'engine_unavailable' })
      return reply.send(await res.json())
    } catch {
      return reply.code(502).send({ error: 'engine_unavailable' })
    }
  })

  fastify.put('/api/ai/routing', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({
      job: z.enum(JOBS),
      chain: z.array(z.string().regex(MODEL_RE)).min(1).max(8).optional(),
      reset: z.boolean().optional(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'invalid_body', details: body.error.flatten() })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    if (body.data.reset || !body.data.chain) {
      await db.query('DELETE FROM ai_routing WHERE user_id = $1 AND job = $2', [ownerId, body.data.job])
    } else {
      await db.query(
        `INSERT INTO ai_routing (user_id, job, chain) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id, job) DO UPDATE SET chain = EXCLUDED.chain, updated_at = NOW()`,
        [ownerId, body.data.job, JSON.stringify(body.data.chain)],
      )
    }
    return reply.code(204).send()
  })

  fastify.post('/api/ai/routing/test', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({ models: z.array(z.string().regex(MODEL_RE)).min(1).max(10) }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    try {
      const res = await fetch(`${INTELLIGENCE()}/internal/ai/route-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: ownerId, models: body.data.models }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) return reply.code(502).send({ error: 'engine_unavailable' })
      return reply.send(await res.json())
    } catch {
      return reply.code(502).send({ error: 'engine_unavailable' })
    }
  })

  // Blind test: how often a judge model can tell the owner's real replies
  // from the engine's drafts (50% = indistinguishable; target <= 60%).
  fastify.post('/api/ai/blind-test', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = z.object({
      samples: z.number().int().min(1).max(40).default(20),
      chain: z.array(z.string().regex(MODEL_RE)).min(1).max(8).optional(),
      includeTexts: z.boolean().default(false),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' })
    const ownerId = (await getEffectiveScope(userId)).ownerUserId
    try {
      const res = await fetch(`${INTELLIGENCE()}/internal/replies/blind-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: ownerId, samples: body.data.samples, chain: body.data.chain ?? null,
          include_texts: body.data.includeTexts,
        }),
        signal: AbortSignal.timeout(600_000),
      })
      if (!res.ok) return reply.code(502).send({ error: 'engine_unavailable' })
      return reply.send(await res.json())
    } catch {
      return reply.code(502).send({ error: 'engine_unavailable' })
    }
  })
}
