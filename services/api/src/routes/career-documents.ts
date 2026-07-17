import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';
import { renderAndSaveDocument, NotFoundError } from '../services/document-render';
import { formatDocument } from './documents';

// Zuri Career & Growth Engine, Phase 3 (see docs/CAREER_GROWTH_ENGINE_PLAN.md
// §8) — AI Resume Studio. Deliberately its own route file rather than
// folding into documents.ts or career-opportunities.ts: resume/cover_letter
// generation reads from career_profiles (not business_profiles/contacts)
// and resume scoring/matching are genuinely new capabilities, following the
// same "give it its own file once it's a separate concern" precedent
// services.ts (out of products.ts) and career-opportunities.ts already set.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — resumes are small; matches knowledge.ts's upload discipline

async function callIntelligence<T>(path: string, body: unknown): Promise<T> {
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
  const res = await fetch(`${intelligenceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Intelligence service returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function careerDocumentsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/career/documents — list resumes/cover letters (Resume Studio's
  // document list), newest first.
  fastify.get('/api/career/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      `SELECT * FROM documents WHERE user_id = $1 AND document_type IN ('resume', 'cover_letter')
       ORDER BY created_at DESC`,
      [userId],
    );
    return reply.send({ documents: rows.map(formatDocument) });
  });

  // ── POST /api/career/resume — AI-generate a resume from career_profiles.
  fastify.post('/api/career/resume', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      instruction: z.string().min(3).max(2000),
      title: z.string().max(255).optional(),
      sourceDocumentId: z.string().uuid().optional(),
    }).parse(request.body);

    let documentId: string;
    try {
      const result = await callIntelligence<{ document: { id: string } }>('/internal/career/resume/generate', {
        user_id: userId, instruction: body.instruction, title: body.title ?? null,
        source_document_id: body.sourceDocumentId ?? null,
      });
      documentId = result.document.id;
    } catch (err) {
      fastify.log.error({ err }, 'career_resume_generate_error');
      return reply.code(502).send({ error: 'Failed to generate resume' });
    }

    try {
      await renderAndSaveDocument(documentId, userId);
    } catch (err) {
      fastify.log.error({ err }, 'career_resume_render_error');
      // The document row exists even if rendering failed — still return it
      // so the caller can retry generation via /api/documents/:id/generate.
    }

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    return reply.code(201).send({ document: formatDocument(doc) });
  });

  // ── POST /api/career/cover-letter — AI-generate a cover letter tailored
  // to a specific career_opportunities row.
  fastify.post('/api/career/cover-letter', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      careerOpportunityId: z.string().uuid(),
      instruction: z.string().min(3).max(2000),
      title: z.string().max(255).optional(),
    }).parse(request.body);

    let documentId: string;
    try {
      const result = await callIntelligence<{ document: { id: string } }>('/internal/career/cover-letter/generate', {
        user_id: userId, career_opportunity_id: body.careerOpportunityId,
        instruction: body.instruction, title: body.title ?? null,
      });
      documentId = result.document.id;
    } catch (err) {
      fastify.log.error({ err }, 'career_cover_letter_generate_error');
      return reply.code(502).send({ error: 'Failed to generate cover letter' });
    }

    try {
      await renderAndSaveDocument(documentId, userId);
    } catch (err) {
      fastify.log.error({ err }, 'career_cover_letter_render_error');
    }

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    return reply.code(201).send({ document: formatDocument(doc) });
  });

  // ── POST /api/career/resume/upload — analyse an existing resume (§8).
  // The uploaded PDF's own bytes become the storage artifact; the
  // intelligence service writes them to the shared doc_storage volume
  // directly (see resume_studio.py's _storage_path_for) rather than Node
  // re-uploading bytes it already received, over a second round-trip.
  fastify.post('/api/career/resume/upload', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    let data: any;
    try {
      data = await (request as any).file();
    } catch {
      return reply.code(400).send({ error: 'Multipart not supported — ensure @fastify/multipart is registered' });
    }
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const buf: Buffer = await data.toBuffer();
    if (buf.length > MAX_UPLOAD_BYTES) return reply.code(400).send({ error: 'File exceeds 10MB limit' });

    const mimetype: string = data.mimetype ?? 'application/octet-stream';
    if (mimetype !== 'application/pdf' && mimetype !== 'text/plain') {
      return reply.code(400).send({ error: 'Only PDF or plain text resumes are supported' });
    }

    const title = typeof data.fields?.title?.value === 'string' ? data.fields.title.value : undefined;

    try {
      const result = await callIntelligence<{ document: any; score: any }>('/internal/career/resume/upload', {
        user_id: userId, file_base64: buf.toString('base64'), mime_type: mimetype, title: title ?? null,
      });
      return reply.code(201).send({ document: formatDocument(result.document), score: result.score });
    } catch (err) {
      fastify.log.error({ err }, 'career_resume_upload_error');
      return reply.code(502).send({ error: 'Failed to analyse resume' });
    }
  });

  // ── POST /api/career/resume/:id/match — embedding-based CV<->opportunity
  // matching (§8), ranking the user's own open career_opportunities.
  fastify.post('/api/career/resume/:id/match', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { limit } = z.object({ limit: z.number().int().min(1).max(20).optional() }).parse(request.body ?? {});

    try {
      const result = await callIntelligence<{ matches: any[] }>(`/internal/career/resume/${id}/match`, {
        user_id: userId, limit: limit ?? 5,
      });
      return reply.send(result);
    } catch (err) {
      fastify.log.error({ err }, 'career_resume_match_error');
      return reply.code(502).send({ error: 'Failed to match resume against opportunities' });
    }
  });

  // ── POST /api/career/resume/:id/regenerate — render a document that
  // failed to render the first time (documents.generate already does this
  // for any document type; exposed here under /career for discoverability).
  fastify.post('/api/career/resume/:id/generate', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    try {
      const result = await renderAndSaveDocument(id, userId);
      return reply.send({ ok: true, status: result.status });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: 'Document not found' });
      fastify.log.error({ err }, 'career_resume_generate_pdf_error');
      return reply.code(500).send({ error: 'Failed to generate PDF' });
    }
  });
}
