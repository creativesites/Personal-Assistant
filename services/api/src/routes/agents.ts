import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { queues } from '../lib/queue'
import { authenticate } from '../plugins/authenticate'
import { Queue } from 'bullmq'
import { config } from '../config'

// ─── Validation schemas ────────────────────────────────────────────────────

const createAgentBody = z.object({
  name: z.string().min(1).max(100),
  agent_type: z.enum(['sales', 'support', 'community_manager', 'custom']),
  description: z.string().nullish(),
  role_title: z.string().max(100).nullish(),
  avatar_emoji: z.string().max(10).nullish(),
  tone: z.string().max(50).nullish(),
  goals: z.string().nullish(),
  capabilities: z.record(z.unknown()).optional(),
  greeting_message: z.string().nullish(),
  out_of_hours_message: z.string().nullish(),
  trust_level: z.enum(['observe', 'suggest', 'assisted', 'delegated', 'autonomous']).optional(),
  system_prompt: z.string().nullish(),
  can_send_links: z.boolean().optional(),
  can_share_pricing: z.boolean().optional(),
  can_book_meetings: z.boolean().optional(),
  max_messages_per_day: z.number().int().positive().optional(),
  escalate_on_frustration: z.boolean().optional(),
  escalate_on_explicit_human_request: z.boolean().optional(),
  escalate_on_out_of_scope: z.boolean().optional(),
  is_default: z.boolean().optional(),
})

const patchAgentBody = z.object({
  name: z.string().min(1).max(100).optional(),
  role_title: z.string().max(100).nullish(),
  avatar_emoji: z.string().max(10).nullish(),
  tone: z.string().max(50).nullish(),
  goals: z.string().nullish(),
  capabilities: z.record(z.unknown()).optional(),
  greeting_message: z.string().nullish(),
  out_of_hours_message: z.string().nullish(),
  trust_level: z.enum(['observe', 'suggest', 'assisted', 'delegated', 'autonomous']).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  system_prompt: z.string().nullish(),
  can_send_links: z.boolean().optional(),
  can_share_pricing: z.boolean().optional(),
  can_book_meetings: z.boolean().optional(),
  max_messages_per_day: z.number().int().positive().optional(),
  escalate_on_frustration: z.boolean().optional(),
  escalate_on_explicit_human_request: z.boolean().optional(),
  escalate_on_out_of_scope: z.boolean().optional(),
})

const createCorrectionBody = z.object({
  agent_action_id: z.string().uuid().optional(),
  original_message: z.string().min(1),
  corrected_message: z.string().min(1),
  correction_reason: z.string().optional(),
  contact_id: z.string().uuid().optional(),
})

const createAssignmentBody = z.object({
  contact_id: z.string().uuid().optional(),
  segment_tag: z.string().min(1).max(100).optional(),
}).refine((d) => d.contact_id !== undefined || d.segment_tag !== undefined, {
  message: 'Either contact_id or segment_tag must be provided',
})

const createDocumentBody = z.object({
  title: z.string().min(1).max(255),
  source_type: z.enum(['pdf', 'url', 'text', 'notion']),
  source_url: z.string().url().optional(),
  raw_content: z.string().optional(),
  agent_id: z.string().uuid().optional(),
})

const patchEscalationBody = z.object({
  status: z.enum(['in_progress', 'resolved']),
})

// ─── Lazy KB queue (not in main queues map — add on demand) ──────────────

function parseRedisUrl(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  }
}

let _kbQueue: Queue | undefined
function getKbQueue(): Queue {
  if (!_kbQueue) {
    _kbQueue = new Queue('kb.process_document', { connection: parseRedisUrl(config.REDIS_URL) })
  }
  return _kbQueue
}

// ─── Route plugin ─────────────────────────────────────────────────────────

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/agents ─────────────────────────────────────────────────────

  fastify.get(
    '/api/agents',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows } = await db.query<{
        id: string
        name: string
        agent_type: string
        role_title: string | null
        avatar_emoji: string | null
        description: string | null
        trust_level: string
        is_active: boolean
        is_default: boolean
        created_at: string
        updated_at: string
        assignment_count: string
        messages_today: string
      }>(
        `SELECT
           a.id, a.name, a.agent_type, a.role_title, a.avatar_emoji,
           a.description, a.trust_level, a.is_active, a.is_default,
           a.created_at, a.updated_at,
           COUNT(DISTINCT aa.id) AS assignment_count,
           COUNT(DISTINCT CASE WHEN act.created_at >= NOW() - INTERVAL '1 day' THEN act.id END) AS messages_today
         FROM agents a
         LEFT JOIN agent_assignments aa ON aa.agent_id = a.id
         LEFT JOIN agent_actions act ON act.agent_id = a.id
         WHERE a.user_id = $1
         GROUP BY a.id
         ORDER BY a.created_at DESC`,
        [userId],
      )

      return reply.send({
        agents: rows.map((r) => ({
          id: r.id,
          name: r.name,
          agentType: r.agent_type,
          roleTitle: r.role_title,
          avatarEmoji: r.avatar_emoji ?? '🤖',
          description: r.description,
          trustLevel: r.trust_level,
          isActive: r.is_active,
          isDefault: r.is_default,
          assignmentCount: parseInt(r.assignment_count, 10),
          messagesToday: parseInt(r.messages_today, 10),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      })
    },
  )

  // ── POST /api/agents ─────────────────────────────────────────────────────

  fastify.post(
    '/api/agents',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof createAgentBody>
      try {
        body = createAgentBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [agent] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO agents (
           user_id, name, agent_type, description, role_title, avatar_emoji,
           tone, goals, capabilities, greeting_message, out_of_hours_message,
           trust_level, system_prompt,
           can_send_links, can_share_pricing, can_book_meetings, max_messages_per_day,
           escalate_on_frustration, escalate_on_explicit_human_request,
           escalate_on_out_of_scope, is_default
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id, created_at`,
        [
          userId,
          body.name,
          body.agent_type,
          body.description ?? null,
          body.role_title ?? null,
          body.avatar_emoji ?? '🤖',
          body.tone ?? 'professional',
          body.goals ?? null,
          JSON.stringify(body.capabilities ?? {}),
          body.greeting_message ?? null,
          body.out_of_hours_message ?? null,
          body.trust_level ?? 'suggest',
          body.system_prompt ?? null,
          body.can_send_links ?? false,
          body.can_share_pricing ?? false,
          body.can_book_meetings ?? false,
          body.max_messages_per_day ?? 50,
          body.escalate_on_frustration ?? true,
          body.escalate_on_explicit_human_request ?? true,
          body.escalate_on_out_of_scope ?? true,
          body.is_default ?? false,
        ],
      )

      return reply.code(201).send({ id: agent.id, createdAt: agent.created_at })
    },
  )

  // ── GET /api/agents/:id ──────────────────────────────────────────────────

  fastify.get(
    '/api/agents/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [agent] } = await db.query<{
        id: string; name: string; agent_type: string; role_title: string | null
        avatar_emoji: string | null; description: string | null; tone: string | null
        goals: string | null; capabilities: unknown; greeting_message: string | null
        out_of_hours_message: string | null; system_prompt: string | null
        trust_level: string; is_active: boolean; is_default: boolean
        can_send_links: boolean; can_share_pricing: boolean; can_book_meetings: boolean
        max_messages_per_day: number; escalate_on_frustration: boolean
        escalate_on_explicit_human_request: boolean; escalate_on_out_of_scope: boolean
        created_at: string; updated_at: string
      }>(
        `SELECT id, name, agent_type, role_title, avatar_emoji, description,
           tone, goals, capabilities, greeting_message, out_of_hours_message,
           system_prompt, trust_level, is_active, is_default,
           can_send_links, can_share_pricing, can_book_meetings,
           max_messages_per_day, escalate_on_frustration,
           escalate_on_explicit_human_request, escalate_on_out_of_scope,
           created_at, updated_at
         FROM agents WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )

      if (!agent) return reply.code(404).send({ error: 'Agent not found' })

      const { rows: actions } = await db.query<{
        id: string; action_type: string; input_message: string | null
        output_message: string | null; reasoning: string | null
        confidence: number | null; tools_used: unknown
        was_escalated: boolean; escalation_reason: string | null; created_at: string
      }>(
        `SELECT id, action_type, input_message, output_message, reasoning,
           confidence, tools_used, was_escalated, escalation_reason, created_at
         FROM agent_actions WHERE agent_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id],
      )

      const { rows: [{ count: assignmentCount }] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM agent_assignments WHERE agent_id = $1',
        [id],
      )

      return reply.send({
        agent: {
          id: agent.id,
          name: agent.name,
          agentType: agent.agent_type,
          roleTitle: agent.role_title,
          avatarEmoji: agent.avatar_emoji ?? '🤖',
          description: agent.description,
          tone: agent.tone,
          goals: agent.goals,
          capabilities: agent.capabilities ?? {},
          greetingMessage: agent.greeting_message,
          outOfHoursMessage: agent.out_of_hours_message,
          systemPrompt: agent.system_prompt,
          trustLevel: agent.trust_level,
          isActive: agent.is_active,
          isDefault: agent.is_default,
          permissions: {
            canSendLinks: agent.can_send_links,
            canSharePricing: agent.can_share_pricing,
            canBookMeetings: agent.can_book_meetings,
            maxMessagesPerDay: agent.max_messages_per_day,
          },
          escalation: {
            onFrustration: agent.escalate_on_frustration,
            onExplicitHumanRequest: agent.escalate_on_explicit_human_request,
            onOutOfScope: agent.escalate_on_out_of_scope,
          },
          assignmentCount: parseInt(assignmentCount, 10),
          createdAt: agent.created_at,
          updatedAt: agent.updated_at,
        },
        recentActions: actions.map((a) => ({
          id: a.id,
          actionType: a.action_type,
          inputMessage: a.input_message,
          outputMessage: a.output_message,
          reasoning: a.reasoning,
          confidence: a.confidence,
          toolsUsed: a.tools_used ?? [],
          wasEscalated: a.was_escalated,
          escalationReason: a.escalation_reason,
          createdAt: a.created_at,
        })),
      })
    },
  )

  // ── PATCH /api/agents/:id ────────────────────────────────────────────────

  fastify.patch(
    '/api/agents/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      let body: z.infer<typeof patchAgentBody>
      try {
        body = patchAgentBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1

      const fieldMap: Record<string, string> = {
        name: 'name',
        role_title: 'role_title',
        avatar_emoji: 'avatar_emoji',
        tone: 'tone',
        goals: 'goals',
        greeting_message: 'greeting_message',
        out_of_hours_message: 'out_of_hours_message',
        trust_level: 'trust_level',
        is_active: 'is_active',
        is_default: 'is_default',
        system_prompt: 'system_prompt',
        can_send_links: 'can_send_links',
        can_share_pricing: 'can_share_pricing',
        can_book_meetings: 'can_book_meetings',
        max_messages_per_day: 'max_messages_per_day',
        escalate_on_frustration: 'escalate_on_frustration',
        escalate_on_explicit_human_request: 'escalate_on_explicit_human_request',
        escalate_on_out_of_scope: 'escalate_on_out_of_scope',
      }

      // capabilities is JSONB — handle separately
      if (body.capabilities !== undefined) {
        updates.push(`capabilities = $${idx++}`)
        values.push(JSON.stringify(body.capabilities))
      }

      for (const [key, col] of Object.entries(fieldMap)) {
        const val = (body as any)[key]
        if (val !== undefined) {
          updates.push(`${col} = $${idx++}`)
          values.push(val)
        }
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' })
      }

      updates.push('updated_at = NOW()')
      values.push(id)

      await db.query(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = $${idx}`,
        values,
      )

      return reply.send({ ok: true })
    },
  )

  // ── DELETE /api/agents/:id ───────────────────────────────────────────────

  fastify.delete(
    '/api/agents/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      await db.query('DELETE FROM agents WHERE id = $1', [id])

      return reply.code(204).send()
    },
  )

  // ── GET /api/agents/:id/actions ──────────────────────────────────────────

  fastify.get(
    '/api/agents/:id/actions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const query = request.query as Record<string, string>
      const page = Math.max(1, parseInt(query.page ?? '1', 10))
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)))
      const offset = (page - 1) * pageSize

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const { rows: actions } = await db.query<{
        id: string; conversation_id: string | null; contact_id: string | null
        action_type: string; input_message: string | null; output_message: string | null
        reasoning: string | null; was_escalated: boolean
        escalation_reason: string | null; created_at: string
      }>(
        `SELECT id, conversation_id, contact_id, action_type, input_message,
           output_message, reasoning, was_escalated, escalation_reason, created_at
         FROM agent_actions WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, pageSize, offset],
      )

      const { rows: [{ count }] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM agent_actions WHERE agent_id = $1',
        [id],
      )

      return reply.send({
        actions: actions.map((a) => ({
          id: a.id,
          conversationId: a.conversation_id,
          contactId: a.contact_id,
          actionType: a.action_type,
          inputMessage: a.input_message,
          outputMessage: a.output_message,
          reasoning: a.reasoning,
          wasEscalated: a.was_escalated,
          escalationReason: a.escalation_reason,
          createdAt: a.created_at,
        })),
        total: parseInt(count, 10),
        page,
        pageSize,
      })
    },
  )

  // ── GET /api/agents/:id/assignments ──────────────────────────────────────

  fastify.get(
    '/api/agents/:id/assignments',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const { rows } = await db.query<{
        id: string; contact_id: string | null; segment_tag: string | null
        created_at: string; contact_name: string | null; contact_phone: string | null
      }>(
        `SELECT aa.id, aa.contact_id, aa.segment_tag, aa.created_at,
           c.name AS contact_name, c.phone_number AS contact_phone
         FROM agent_assignments aa
         LEFT JOIN contacts c ON c.id = aa.contact_id
         WHERE aa.agent_id = $1
         ORDER BY aa.created_at DESC`,
        [id],
      )

      return reply.send({
        assignments: rows.map((r) => ({
          id: r.id,
          contactId: r.contact_id,
          segmentTag: r.segment_tag,
          contact: r.contact_id
            ? { name: r.contact_name, phone: r.contact_phone }
            : null,
          createdAt: r.created_at,
        })),
      })
    },
  )

  // ── GET /api/agents/:id/memories — read-only view of what the agent has
  //     learned. No approve/reject workflow (unlike business facts) — an
  //     agent's own trust_level already gates what it acts on; this is
  //     transparency, not a moderation queue. ───────────────────────────────

  fastify.get(
    '/api/agents/:id/memories',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const query = request.query as Record<string, string>

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const filters: string[] = ['agent_id = $1', 'is_active = TRUE']
      const params: unknown[] = [id]
      let idx = 2

      if (query.contact_id) {
        filters.push(`contact_id = $${idx++}`)
        params.push(query.contact_id)
      }
      if (query.memory_type) {
        filters.push(`memory_type = $${idx++}`)
        params.push(query.memory_type)
      }

      const { rows } = await db.query<{
        id: string; contact_id: string | null; memory_type: string
        memory_key: string | null; memory_value: string | null
        situation: string | null; action_taken: string | null; outcome: string | null
        worked: boolean | null; confidence: string; evidence_count: number
        created_at: string; updated_at: string
      }>(
        `SELECT id, contact_id, memory_type, memory_key, memory_value,
                situation, action_taken, outcome, worked, confidence, evidence_count,
                created_at, updated_at
         FROM agent_memories
         WHERE ${filters.join(' AND ')}
         ORDER BY confidence DESC, updated_at DESC
         LIMIT 200`,
        params,
      )

      return reply.send({
        memories: rows.map((m) => ({
          id: m.id,
          contactId: m.contact_id,
          scope: m.contact_id ? 'contact' : 'general',
          memoryType: m.memory_type,
          key: m.memory_key,
          value: m.memory_value,
          situation: m.situation,
          actionTaken: m.action_taken,
          outcome: m.outcome,
          worked: m.worked,
          confidence: Number(m.confidence),
          evidenceCount: m.evidence_count,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        })),
      })
    },
  )

  // ── DELETE /api/agents/:id/memories/:memoryId — soft-delete. Added for
  //     Phase 5 privacy controls; the read-only design note above still
  //     holds (no approve/reject workflow) — this is deletion, not moderation. ──

  fastify.delete(
    '/api/agents/:id/memories/:memoryId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, memoryId } = request.params as { id: string; memoryId: string }

      const { rowCount } = await db.query(
        `UPDATE agent_memories SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1 AND agent_id = $2 AND user_id = $3`,
        [memoryId, id, userId],
      )
      if (!rowCount) return reply.code(404).send({ error: 'Memory not found' })

      return reply.send({ ok: true })
    },
  )

  // ── POST /api/agents/:id/assignments ─────────────────────────────────────

  fastify.post(
    '/api/agents/:id/assignments',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      let body: z.infer<typeof createAssignmentBody>
      try {
        body = createAssignmentBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      // Validate contact belongs to user if provided
      if (body.contact_id) {
        const { rows: [contact] } = await db.query<{ id: string }>(
          'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
          [body.contact_id, userId],
        )
        if (!contact) return reply.code(404).send({ error: 'Contact not found' })
      }

      const { rows: [assignment] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO agent_assignments (agent_id, contact_id, segment_tag)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [id, body.contact_id ?? null, body.segment_tag ?? null],
      )

      return reply.code(201).send({ id: assignment.id, createdAt: assignment.created_at })
    },
  )

  // ── DELETE /api/agents/:id/assignments/:assignmentId ─────────────────────

  fastify.delete(
    '/api/agents/:id/assignments/:assignmentId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id, assignmentId } = request.params as { id: string; assignmentId: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const { rowCount } = await db.query(
        'DELETE FROM agent_assignments WHERE id = $1 AND agent_id = $2',
        [assignmentId, id],
      )

      if (!rowCount || rowCount === 0) {
        return reply.code(404).send({ error: 'Assignment not found' })
      }

      return reply.code(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Knowledge Base
  // ─────────────────────────────────────────────────────────────────────────

  // ── GET /api/knowledge-base ──────────────────────────────────────────────

  fastify.get(
    '/api/knowledge-base',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as Record<string, string>
      const agentId = query.agent_id

      let sql = `SELECT id, agent_id, title, source_type, source_url, status,
                   chunk_count, error_message, created_at, updated_at
                 FROM kb_documents WHERE user_id = $1`
      const params: unknown[] = [userId]

      if (agentId) {
        params.push(agentId)
        sql += ` AND agent_id = $2`
      }

      sql += ' ORDER BY created_at DESC'

      const { rows } = await db.query<{
        id: string; agent_id: string | null; title: string; source_type: string
        source_url: string | null; status: string; chunk_count: number
        error_message: string | null; created_at: string; updated_at: string
      }>(sql, params)

      return reply.send({
        documents: rows.map((d) => ({
          id: d.id,
          agentId: d.agent_id,
          title: d.title,
          sourceType: d.source_type,
          sourceUrl: d.source_url,
          status: d.status,
          chunkCount: d.chunk_count,
          errorMessage: d.error_message,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })),
      })
    },
  )

  // ── POST /api/knowledge-base ─────────────────────────────────────────────

  fastify.post(
    '/api/knowledge-base',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof createDocumentBody>
      try {
        body = createDocumentBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      // Validate agent belongs to user if provided
      if (body.agent_id) {
        const { rows: [agent] } = await db.query<{ id: string }>(
          'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
          [body.agent_id, userId],
        )
        if (!agent) return reply.code(404).send({ error: 'Agent not found' })
      }

      const { rows: [doc] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO kb_documents (user_id, agent_id, title, source_type, source_url, raw_content, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing')
         RETURNING id, created_at`,
        [
          userId,
          body.agent_id ?? null,
          body.title,
          body.source_type,
          body.source_url ?? null,
          body.raw_content ?? null,
        ],
      )

      try {
        await getKbQueue().add('kb.process_document', { documentId: doc.id, userId })
      } catch {
        // Queue may be unavailable — document is already saved, processing will retry
      }

      return reply.code(201).send({ id: doc.id, createdAt: doc.created_at })
    },
  )

  // ── GET /api/knowledge-base/:id ──────────────────────────────────────────

  fastify.get(
    '/api/knowledge-base/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [doc] } = await db.query<{
        id: string; agent_id: string | null; title: string; source_type: string
        source_url: string | null; raw_content: string | null; status: string
        chunk_count: number; error_message: string | null
        created_at: string; updated_at: string
      }>(
        `SELECT id, agent_id, title, source_type, source_url, raw_content, status,
           chunk_count, error_message, created_at, updated_at
         FROM kb_documents WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )

      if (!doc) return reply.code(404).send({ error: 'Document not found' })

      const { rows: [{ count: chunkCount }] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM kb_chunks WHERE document_id = $1',
        [id],
      )

      return reply.send({
        document: {
          id: doc.id,
          agentId: doc.agent_id,
          title: doc.title,
          sourceType: doc.source_type,
          sourceUrl: doc.source_url,
          rawContent: doc.raw_content,
          status: doc.status,
          chunkCount: parseInt(chunkCount, 10),
          errorMessage: doc.error_message,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        },
      })
    },
  )

  // ── DELETE /api/knowledge-base/:id ──────────────────────────────────────

  fastify.delete(
    '/api/knowledge-base/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM kb_documents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Document not found' })

      // kb_chunks cascade via FK ON DELETE CASCADE
      await db.query('DELETE FROM kb_documents WHERE id = $1', [id])

      return reply.code(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Escalations
  // ─────────────────────────────────────────────────────────────────────────

  // ── GET /api/escalations ─────────────────────────────────────────────────

  fastify.get(
    '/api/escalations',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as Record<string, string>
      const status = query.status ?? 'pending'

      const allowedStatuses = ['pending', 'in_progress', 'resolved']
      if (!allowedStatuses.includes(status)) {
        return reply.code(400).send({ error: `status must be one of: ${allowedStatuses.join(', ')}` })
      }

      const { rows } = await db.query<{
        id: string; conversation_id: string; contact_id: string | null
        reason: string; context_summary: string | null; urgency: string
        status: string; resolved_by: string | null; resolved_at: string | null
        created_at: string; agent_name: string; contact_name: string | null
      }>(
        `SELECT
           e.id, e.conversation_id, e.contact_id, e.reason, e.context_summary,
           e.urgency, e.status, e.resolved_by, e.resolved_at, e.created_at,
           a.name AS agent_name,
           c.name AS contact_name
         FROM escalations e
         JOIN agents a ON a.id = e.agent_id
         LEFT JOIN contacts c ON c.id = e.contact_id
         WHERE a.user_id = $1 AND e.status = $2
         ORDER BY
           CASE e.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
           e.created_at DESC`,
        [userId, status],
      )

      return reply.send({
        escalations: rows.map((r) => ({
          id: r.id,
          conversationId: r.conversation_id,
          contactId: r.contact_id,
          contactName: r.contact_name,
          agentName: r.agent_name,
          reason: r.reason,
          contextSummary: r.context_summary,
          urgency: r.urgency,
          status: r.status,
          resolvedBy: r.resolved_by,
          resolvedAt: r.resolved_at,
          createdAt: r.created_at,
        })),
      })
    },
  )

  // ── GET /api/agents/:id/performance ─────────────────────────────────────

  fastify.get(
    '/api/agents/:id/performance',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      // Last 30 days of daily stats
      const { rows: daily } = await db.query<{
        date: string; messages_handled: number; escalations: number
        auto_sent: number; suggested: number; human_overrides: number
        avg_confidence: number | null
      }>(
        `SELECT date, messages_handled, escalations, auto_sent, suggested,
           human_overrides, avg_confidence
         FROM agent_performance_daily
         WHERE agent_id = $1
         ORDER BY date DESC
         LIMIT 30`,
        [id],
      )

      // Aggregate totals from agent_actions
      const { rows: [totals] } = await db.query<{
        total_messages: string; total_escalations: string; avg_confidence: string | null
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE action_type = 'send_message') AS total_messages,
           COUNT(*) FILTER (WHERE action_type = 'escalate') AS total_escalations,
           AVG(confidence) FILTER (WHERE confidence IS NOT NULL) AS avg_confidence
         FROM agent_actions WHERE agent_id = $1`,
        [id],
      )

      // Recent corrections count
      const { rows: [{ count: correctionCount }] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM agent_corrections WHERE agent_id = $1',
        [id],
      )

      return reply.send({
        daily: daily.map((d) => ({
          date: d.date,
          messagesHandled: d.messages_handled,
          escalations: d.escalations,
          autoSent: d.auto_sent,
          suggested: d.suggested,
          humanOverrides: d.human_overrides,
          avgConfidence: d.avg_confidence,
        })),
        totals: {
          totalMessages: parseInt(totals.total_messages, 10),
          totalEscalations: parseInt(totals.total_escalations, 10),
          avgConfidence: totals.avg_confidence ? parseFloat(totals.avg_confidence) : null,
          correctionCount: parseInt(correctionCount, 10),
        },
      })
    },
  )

  // ── POST /api/agents/:id/corrections ─────────────────────────────────────

  fastify.post(
    '/api/agents/:id/corrections',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      let body: z.infer<typeof createCorrectionBody>
      try {
        body = createCorrectionBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Agent not found' })

      const { rows: [correction] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO agent_corrections
           (agent_id, user_id, agent_action_id, original_message, corrected_message,
            correction_reason, contact_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          id,
          userId,
          body.agent_action_id ?? null,
          body.original_message,
          body.corrected_message,
          body.correction_reason ?? null,
          body.contact_id ?? null,
        ],
      )

      // Count corrections for this agent to surface learning milestones
      const { rows: [{ count }] } = await db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM agent_corrections WHERE agent_id = $1',
        [id],
      )

      return reply.code(201).send({
        id: correction.id,
        createdAt: correction.created_at,
        totalCorrections: parseInt(count, 10),
      })
    },
  )

  // ── PATCH /api/escalations/:id ───────────────────────────────────────────

  fastify.patch(
    '/api/escalations/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      let body: z.infer<typeof patchEscalationBody>
      try {
        body = patchEscalationBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      // Verify the escalation belongs to one of the user's agents
      const { rows: [existing] } = await db.query<{ id: string }>(
        `SELECT e.id FROM escalations e
         JOIN agents a ON a.id = e.agent_id
         WHERE e.id = $1 AND a.user_id = $2`,
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Escalation not found' })

      const resolvedFields = body.status === 'resolved'
        ? `, resolved_by = $3, resolved_at = NOW()`
        : ''

      const params: unknown[] = [body.status, id]
      if (body.status === 'resolved') params.push(userId)

      await db.query(
        `UPDATE escalations SET status = $1${resolvedFields} WHERE id = $2`,
        params,
      )

      return reply.send({ ok: true })
    },
  )
}
