import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { config } from '../config'

// Ask About Anything (Platform Polish Phase 6, docs/PLATFORM_POLISH_PLAN.md
// §8) — free text goes to the intelligence service for one classification
// call (services/intelligence/app/services/ask_anything.py, reusing
// job_discovery.py's "one complete_json call → structured directive"
// shape), then this route's fixed per-entity SQL builders turn the
// resulting {entityType, filters, sort} into a parameterized query. No
// text-to-SQL, no generic query language — a field/entity outside the map
// below simply isn't expressible, by design.

type Op = 'eq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte'
interface Filter { field: string; op: Op; value: string }
interface ClassifyResult { entityType: string | null; filters: Filter[]; sort: { field: string; direction: 'asc' | 'desc' } | null }

interface EntityConfig {
  // Full SELECT column list, aliased to the same names used in fieldColumns
  // below, so the WHERE/ORDER BY clauses and the returned rows agree.
  select: string
  from: string
  fieldColumns: Record<string, string>
  numericFields: Set<string>
}

const ENTITIES: Record<string, EntityConfig> = {
  contacts: {
    select: `id, COALESCE(custom_name, display_name, phone_number) AS name, company, customer_status AS "customerStatus", lead_score AS "leadScore", pipeline_stage AS "pipelineStage"`,
    from: `contacts WHERE user_id = $1 AND is_group = false`,
    fieldColumns: { name: `COALESCE(custom_name, display_name, phone_number)`, company: 'company', customerStatus: 'customer_status', leadScore: 'lead_score', pipelineStage: 'pipeline_stage' },
    numericFields: new Set(['leadScore']),
  },
  documents: {
    select: `id, document_type AS "documentType", status, title, total_cents AS "totalCents"`,
    from: `documents WHERE user_id = $1`,
    fieldColumns: { documentType: 'document_type', status: 'status', title: 'title', totalCents: 'total_cents' },
    numericFields: new Set(['totalCents']),
  },
  projects: {
    select: `id, title, status`,
    from: `projects WHERE user_id = $1`,
    fieldColumns: { title: 'title', status: 'status' },
    numericFields: new Set(),
  },
  suppliers: {
    select: `id, company, reliability_score AS "reliabilityScore", average_delivery_time AS "averageDeliveryTime"`,
    from: `suppliers WHERE user_id = $1`,
    fieldColumns: { company: 'company', reliabilityScore: 'reliability_score', averageDeliveryTime: 'average_delivery_time' },
    numericFields: new Set(['reliabilityScore', 'averageDeliveryTime']),
  },
  products: {
    select: `id, name, category, available, selling_price AS "sellingPrice"`,
    from: `products WHERE user_id = $1`,
    fieldColumns: { name: 'name', category: 'category', available: 'available', sellingPrice: 'selling_price' },
    numericFields: new Set(['available', 'sellingPrice']),
  },
  messages: {
    select: `m.id, m.body, m.sender_type AS "senderType", m.message_type AS "messageType", m.created_at AS "createdAt", COALESCE(c.custom_name, c.display_name) AS "contactName", c.id AS "contactId", conv.id AS "conversationId"`,
    from: `messages m JOIN conversations conv ON m.conversation_id = conv.id JOIN contacts c ON conv.contact_id = c.id WHERE conv.user_id = $1`,
    fieldColumns: {
      body: 'm.body',
      senderType: 'm.sender_type',
      messageType: 'm.message_type',
      contactName: 'COALESCE(c.custom_name, c.display_name)',
      createdAt: 'm.created_at'
    },
    numericFields: new Set(),
  },
}

const OP_SQL: Record<Op, string> = { eq: '=', contains: 'ILIKE', gt: '>', gte: '>=', lt: '<', lte: '<=' }

function buildQuery(entityType: string, filters: Filter[], sort: ClassifyResult['sort'], userId: string) {
  const entity = ENTITIES[entityType]
  const params: unknown[] = [userId]
  let clause = entity.from
  for (const f of filters) {
    const column = entity.fieldColumns[f.field]
    if (!column) continue // field outside the fixed schema — silently dropped, never passed to SQL
    const isNumeric = entity.numericFields.has(f.field)
    const value = isNumeric ? Number(f.value) : f.value
    if (isNumeric && Number.isNaN(value as number)) continue
    params.push(f.op === 'contains' ? `%${value}%` : value)
    
    if (entityType === 'messages' && f.field === 'body' && f.op === 'contains') {
      clause += ` AND (m.body ILIKE $${params.length} OR m.transcription ILIKE $${params.length})`
    } else {
      clause += ` AND ${column} ${OP_SQL[f.op]} $${params.length}`
    }
  }
  let orderBy = ''
  if (sort) {
    const sortColumn = entity.fieldColumns[sort.field]
    if (sortColumn) orderBy = ` ORDER BY ${sortColumn} ${sort.direction === 'asc' ? 'ASC' : 'DESC'}`
  }
  return { sql: `SELECT ${entity.select} FROM ${clause}${orderBy} LIMIT 50`, params }
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/search/ask', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { question } = request.body as { question?: string }
    if (!question?.trim()) return reply.code(400).send({ error: 'question is required' })

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL
    let classification: ClassifyResult
    try {
      const res = await fetch(`${intelligenceUrl}/internal/search/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, question }),
      })
      if (!res.ok) throw new Error(`Intelligence service returned ${res.status}`)
      classification = await res.json() as ClassifyResult
    } catch {
      return reply.send({ entityType: null, results: [], message: "I couldn't understand that — try rephrasing." })
    }

    if (!classification.entityType || !ENTITIES[classification.entityType]) {
      return reply.send({ entityType: null, results: [], message: "I couldn't match that to contacts, documents, projects, suppliers, or products — try rephrasing." })
    }

    const { sql, params } = buildQuery(classification.entityType, classification.filters, classification.sort, userId)
    const { rows } = await db.query(sql, params)

    return reply.send({ entityType: classification.entityType, filters: classification.filters, results: rows })
  })
}
