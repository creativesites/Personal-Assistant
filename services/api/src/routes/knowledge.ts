import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { Queue } from 'bullmq'
import { config } from '../config'

// ─── BullMQ KB queue (mirrors pattern from agents.ts) ────────────────────────

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

// ─── Validation schemas ───────────────────────────────────────────────────────

const addUrlBody = z.object({
  title: z.string().min(1).max(255),
  url: z.string().url(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
})

const addNoteBody = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
})

const patchDocumentBody = z.object({
  title: z.string().min(1).max(255).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
})

const searchBody = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
})

const chatBody = z.object({
  question: z.string().min(1),
})

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function knowledgeRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/knowledge ──────────────────────────────────────────────────────

  fastify.get(
    '/api/knowledge',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as Record<string, string>

      const filters: string[] = ['user_id = $1']
      const params: unknown[] = [userId]
      let idx = 2

      if (query.category) {
        filters.push(`category = $${idx++}`)
        params.push(query.category)
      }

      if (query.tag) {
        filters.push(`$${idx++} = ANY(tags)`)
        params.push(query.tag)
      }

      if (query.search) {
        filters.push(`(title ILIKE $${idx} OR summary ILIKE $${idx})`)
        params.push(`%${query.search}%`)
        idx++
      }

      if (query.status) {
        filters.push(`status = $${idx++}`)
        params.push(query.status)
      }

      const sql = `
        SELECT id, title, source_type, category, tags, status,
               chunk_count, word_count, file_size_bytes, used_count,
               last_used_at, summary, error_message, created_at, updated_at
        FROM kb_documents
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC
      `

      const { rows } = await db.query<{
        id: string
        title: string
        source_type: string
        category: string | null
        tags: string[] | null
        status: string
        chunk_count: number | null
        word_count: number | null
        file_size_bytes: number | null
        used_count: number | null
        last_used_at: string | null
        summary: string | null
        error_message: string | null
        created_at: string
        updated_at: string
      }>(sql, params)

      return reply.send({
        documents: rows.map((d) => ({
          id: d.id,
          title: d.title,
          sourceType: d.source_type,
          category: d.category,
          tags: d.tags ?? [],
          status: d.status,
          chunkCount: d.chunk_count ?? 0,
          wordCount: d.word_count ?? 0,
          fileSizeBytes: d.file_size_bytes,
          usedCount: d.used_count ?? 0,
          lastUsedAt: d.last_used_at,
          summary: d.summary,
          errorMessage: d.error_message,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })),
      })
    },
  )

  // ── GET /api/knowledge/stats ────────────────────────────────────────────────

  fastify.get(
    '/api/knowledge/stats',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: [stats] } = await db.query<{
        total_documents: string
        total_chunks: string
        total_words: string
        ai_ready: string
        last_sync: string | null
        categories: string[] | null
      }>(
        `SELECT
           COUNT(*)                                         AS total_documents,
           COALESCE(SUM(chunk_count), 0)                   AS total_chunks,
           COALESCE(SUM(word_count), 0)                    AS total_words,
           COUNT(*) FILTER (WHERE status = 'ready')        AS ai_ready,
           MAX(updated_at)                                 AS last_sync,
           array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories
         FROM kb_documents
         WHERE user_id = $1`,
        [userId],
      )

      return reply.send({
        totalDocuments: parseInt(stats.total_documents, 10),
        totalChunks: parseInt(stats.total_chunks, 10),
        totalWords: parseInt(stats.total_words, 10),
        aiReady: parseInt(stats.ai_ready, 10),
        lastSync: stats.last_sync,
        categories: stats.categories ?? [],
      })
    },
  )

  // ── GET /api/knowledge/health ───────────────────────────────────────────────

  fastify.get(
    '/api/knowledge/health',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const warnings: Array<{
        type: string
        message: string
        document_id?: string
        document_title?: string
      }> = []

      // 1. Documents with status='error'
      const { rows: errorDocs } = await db.query<{
        id: string
        title: string
        error_message: string | null
      }>(
        `SELECT id, title, error_message
         FROM kb_documents
         WHERE user_id = $1 AND status = 'error'`,
        [userId],
      )

      for (const doc of errorDocs) {
        warnings.push({
          type: 'processing_error',
          message: doc.error_message
            ? `Document failed to process: ${doc.error_message}`
            : 'Document failed to process',
          document_id: doc.id,
          document_title: doc.title,
        })
      }

      // 2. Documents stuck in processing for more than 1 hour
      const { rows: stuckDocs } = await db.query<{ id: string; title: string }>(
        `SELECT id, title
         FROM kb_documents
         WHERE user_id = $1
           AND status = 'processing'
           AND created_at < NOW() - INTERVAL '1 hour'`,
        [userId],
      )

      for (const doc of stuckDocs) {
        warnings.push({
          type: 'stuck_processing',
          message: 'Document has been processing for over 1 hour',
          document_id: doc.id,
          document_title: doc.title,
        })
      }

      // 3. URL documents not updated in 30 days
      const { rows: staleDocs } = await db.query<{ id: string; title: string }>(
        `SELECT id, title
         FROM kb_documents
         WHERE user_id = $1
           AND source_type = 'url'
           AND updated_at < NOW() - INTERVAL '30 days'`,
        [userId],
      )

      for (const doc of staleDocs) {
        warnings.push({
          type: 'stale_content',
          message: 'URL document has not been refreshed in over 30 days',
          document_id: doc.id,
          document_title: doc.title,
        })
      }

      return reply.send({ warnings })
    },
  )

  // ── GET /api/knowledge/:id ──────────────────────────────────────────────────

  fastify.get(
    '/api/knowledge/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [doc] } = await db.query<{
        id: string
        title: string
        source_type: string
        source_url: string | null
        category: string | null
        tags: string[] | null
        status: string
        chunk_count: number | null
        word_count: number | null
        file_size_bytes: number | null
        used_count: number | null
        last_used_at: string | null
        summary: string | null
        raw_content: string | null
        error_message: string | null
        created_at: string
        updated_at: string
      }>(
        `SELECT id, title, source_type, source_url, category, tags, status,
                chunk_count, word_count, file_size_bytes, used_count,
                last_used_at, summary, raw_content, error_message, created_at, updated_at
         FROM kb_documents
         WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )

      if (!doc) return reply.code(404).send({ error: 'Document not found' })

      return reply.send({
        document: {
          id: doc.id,
          title: doc.title,
          sourceType: doc.source_type,
          sourceUrl: doc.source_url,
          category: doc.category,
          tags: doc.tags ?? [],
          status: doc.status,
          chunkCount: doc.chunk_count ?? 0,
          wordCount: doc.word_count ?? 0,
          fileSizeBytes: doc.file_size_bytes,
          usedCount: doc.used_count ?? 0,
          lastUsedAt: doc.last_used_at,
          summary: doc.summary,
          rawContentPreview: doc.raw_content ? doc.raw_content.slice(0, 2000) : null,
          errorMessage: doc.error_message,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        },
      })
    },
  )

  // ── PATCH /api/knowledge/:id ────────────────────────────────────────────────

  fastify.patch(
    '/api/knowledge/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      let body: z.infer<typeof patchDocumentBody>
      try {
        body = patchDocumentBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM kb_documents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Document not found' })

      const updates: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (body.title !== undefined) {
        updates.push(`title = $${idx++}`)
        values.push(body.title)
      }

      if (body.category !== undefined) {
        updates.push(`category = $${idx++}`)
        values.push(body.category)
      }

      if (body.tags !== undefined) {
        updates.push(`tags = $${idx++}`)
        values.push(body.tags)
      }

      if (body.summary !== undefined) {
        updates.push(`summary = $${idx++}`)
        values.push(body.summary)
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' })
      }

      updates.push('updated_at = NOW()')
      values.push(id)

      const { rows: [updated] } = await db.query<{
        id: string; title: string; category: string | null; tags: string[] | null
        summary: string | null; updated_at: string
      }>(
        `UPDATE kb_documents SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, title, category, tags, summary, updated_at`,
        values,
      )

      return reply.send({
        document: {
          id: updated.id,
          title: updated.title,
          category: updated.category,
          tags: updated.tags ?? [],
          summary: updated.summary,
          updatedAt: updated.updated_at,
        },
      })
    },
  )

  // ── DELETE /api/knowledge/:id ───────────────────────────────────────────────

  fastify.delete(
    '/api/knowledge/:id',
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

  // ── POST /api/knowledge/add-url ─────────────────────────────────────────────

  fastify.post(
    '/api/knowledge/add-url',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof addUrlBody>
      try {
        body = addUrlBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const { rows: [doc] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO kb_documents (user_id, title, source_type, source_url, category, tags, status)
         VALUES ($1, $2, 'url', $3, $4, $5, 'processing')
         RETURNING id, created_at`,
        [
          userId,
          body.title,
          body.url,
          body.category ?? null,
          body.tags ?? [],
        ],
      )

      try {
        await getKbQueue().add('kb.process_document', { documentId: doc.id, userId })
      } catch {
        // Queue unavailable — document saved, processing will retry
      }

      return reply.code(201).send({ id: doc.id, createdAt: doc.created_at })
    },
  )

  // ── POST /api/knowledge/add-note ────────────────────────────────────────────

  fastify.post(
    '/api/knowledge/add-note',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof addNoteBody>
      try {
        body = addNoteBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const wordCount = body.content.split(' ').length

      const { rows: [doc] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO kb_documents
           (user_id, title, source_type, raw_content, category, tags, word_count, status)
         VALUES ($1, $2, 'text', $3, $4, $5, $6, 'processing')
         RETURNING id, created_at`,
        [
          userId,
          body.title,
          body.content,
          body.category ?? null,
          body.tags ?? [],
          wordCount,
        ],
      )

      try {
        await getKbQueue().add('kb.process_document', { documentId: doc.id, userId })
      } catch {
        // Queue unavailable — document saved, processing will retry
      }

      return reply.code(201).send({ id: doc.id, createdAt: doc.created_at })
    },
  )

  // ── POST /api/knowledge/upload ──────────────────────────────────────────────

  fastify.post(
    '/api/knowledge/upload',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

      let data: any
      try {
        data = await (request as any).file()
      } catch {
        return reply.code(400).send({ error: 'Multipart not supported — ensure @fastify/multipart is registered' })
      }

      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' })
      }

      const buf: Buffer = await data.toBuffer()

      if (buf.length > MAX_FILE_SIZE) {
        return reply.code(400).send({ error: 'File exceeds 10MB limit' })
      }

      const filename: string = data.filename ?? ''
      const mimetype: string = data.mimetype ?? ''
      const fileSizeBytes = buf.length

      const isPdf =
        mimetype === 'application/pdf' ||
        filename.toLowerCase().endsWith('.pdf')

      const isExcel =
        mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimetype === 'application/vnd.ms-excel' ||
        filename.toLowerCase().endsWith('.xlsx') ||
        filename.toLowerCase().endsWith('.xls')

      const isCsv =
        mimetype === 'text/csv' ||
        filename.toLowerCase().endsWith('.csv')

      if (!isPdf && !isExcel && !isCsv) {
        return reply.code(400).send({ error: 'Unsupported file type. Accepted: PDF, Excel (.xlsx/.xls), CSV' })
      }

      let rawContent = ''
      let sourceType = 'text'

      if (isPdf) {
        sourceType = 'pdf'
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pdfParse = require('pdf-parse')
          const parsed = await pdfParse(buf)
          rawContent = parsed.text ?? ''
        } catch (err: any) {
          return reply.code(500).send({ error: 'Failed to parse PDF', detail: err.message })
        }
      } else if (isExcel) {
        sourceType = 'excel'
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const XLSX = require('xlsx')
          const workbook = XLSX.read(buf, { type: 'buffer' })
          const lines: string[] = []
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName]
            const csv: string = XLSX.utils.sheet_to_csv(sheet)
            lines.push(`=== Sheet: ${sheetName} ===`)
            lines.push(csv)
          }
          rawContent = lines.join('\n')
        } catch (err: any) {
          return reply.code(500).send({ error: 'Failed to parse Excel file', detail: err.message })
        }
      } else if (isCsv) {
        sourceType = 'csv'
        rawContent = buf.toString('utf8')
      }

      const wordCount = rawContent.split(/\s+/).filter(Boolean).length
      const title = filename.replace(/\.[^.]+$/, '') || 'Uploaded file'

      const { rows: [doc] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO kb_documents
           (user_id, title, source_type, raw_content, word_count, file_size_bytes, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing')
         RETURNING id, created_at`,
        [userId, title, sourceType, rawContent, wordCount, fileSizeBytes],
      )

      try {
        await getKbQueue().add('kb.process_document', { documentId: doc.id, userId })
      } catch {
        // Queue unavailable — document saved, processing will retry
      }

      return reply.code(201).send({
        id: doc.id,
        createdAt: doc.created_at,
        extractedWords: wordCount,
      })
    },
  )

  // ── POST /api/knowledge/:id/reindex ────────────────────────────────────────

  fastify.post(
    '/api/knowledge/:id/reindex',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [existing] } = await db.query<{ id: string }>(
        'SELECT id FROM kb_documents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Document not found' })

      // Delete existing chunks so they get recreated cleanly
      await db.query('DELETE FROM kb_chunks WHERE document_id = $1', [id])

      // Reset document status and clear prior error
      await db.query(
        `UPDATE kb_documents
         SET status = 'processing', error_message = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id],
      )

      try {
        await getKbQueue().add('kb.process_document', { documentId: id, userId })
      } catch {
        // Queue unavailable — status reset, processing will retry on next queue startup
      }

      return reply.send({ ok: true })
    },
  )

  // ── POST /api/knowledge/search ──────────────────────────────────────────────

  fastify.post(
    '/api/knowledge/search',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof searchBody>
      try {
        body = searchBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL

      try {
        const res = await fetch(`${intelligenceUrl}/internal/knowledge/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, query: body.query, limit: body.limit ?? 10 }),
        })

        if (!res.ok) {
          const text = await res.text()
          return reply.code(502).send({ error: 'Intelligence service error', detail: text })
        }

        const data = await res.json() as { results?: unknown[] }
        return reply.send({ results: data.results ?? data })
      } catch (err: any) {
        return reply.code(502).send({ error: 'Failed to reach intelligence service', detail: err.message })
      }
    },
  )

  // ── POST /api/knowledge/chat ────────────────────────────────────────────────

  fastify.post(
    '/api/knowledge/chat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      let body: z.infer<typeof chatBody>
      try {
        body = chatBody.parse(request.body)
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid body', detail: err.message })
      }

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL

      try {
        const res = await fetch(`${intelligenceUrl}/internal/knowledge/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, question: body.question }),
        })

        if (!res.ok) {
          const text = await res.text()
          return reply.code(502).send({ error: 'Intelligence service error', detail: text })
        }

        const data = await res.json() as { answer?: string; sources?: unknown[] }
        return reply.send({
          answer: data.answer ?? '',
          sources: data.sources ?? [],
        })
      } catch (err: any) {
        return reply.code(502).send({ error: 'Failed to reach intelligence service', detail: err.message })
      }
    },
  )
}
