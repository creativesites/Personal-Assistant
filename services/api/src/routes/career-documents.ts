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

// CV Studio Phase 9 (docs/CV_STUDIO_PLAN.md §12, §13) — the six new
// document types added alongside resume/cover_letter.
const LETTER_DOCUMENT_TYPES = [
  'cover_letter', 'application_letter', 'expression_of_interest',
  'personal_statement', 'motivation_letter',
] as const;
const CAREER_DOCUMENT_TYPES = [...LETTER_DOCUMENT_TYPES, 'resume', 'reference_sheet', 'portfolio_pdf'];

export async function careerDocumentsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/career/documents — list every career document (resumes,
  // cover letters, and CV Studio Phase 9's Supporting Documents), newest
  // first.
  fastify.get('/api/career/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      `SELECT * FROM documents WHERE user_id = $1 AND document_type = ANY($2::text[])
       ORDER BY created_at DESC`,
      [userId, CAREER_DOCUMENT_TYPES],
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

  // ── POST /api/career/letters/compose — CV Studio Phase 9 Cover Letter
  // Studio (§12). Deliberately NOT the old invent-from-instruction flow
  // (/api/career/cover-letter above, kept as-is per Phase 1's deliberate
  // deferral) — the body here is real, user-composed text (drafted, picked
  // from real achievements, or AI-polished via the existing generic
  // /api/career/cv-assistant/rewrite endpoint) that this route only saves
  // and renders, never generates from scratch. Covers cover_letter and its
  // four Phase 9 siblings, which all share the exact same structured_data
  // shape.
  fastify.post('/api/career/letters/compose', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      documentType: z.enum(LETTER_DOCUMENT_TYPES),
      recipientName: z.string().max(255).nullable().optional(),
      companyName: z.string().max(255).nullable().optional(),
      body: z.string().min(1).max(8000),
      signOff: z.string().max(500).optional(),
      title: z.string().max(255).optional(),
    }).parse(request.body);

    const { rows: [user] } = await db.query<{ full_name: string | null; email: string }>(
      'SELECT full_name, email FROM users WHERE id = $1', [userId],
    );
    const fullName = user?.full_name || user?.email || 'Applicant';

    let documentId: string;
    try {
      const result = await callIntelligence<{ document: { id: string } }>('/internal/career/documents/save', {
        user_id: userId,
        document_type: body.documentType,
        structured_data: {
          recipientName: body.recipientName ?? null,
          companyName: body.companyName ?? null,
          body: body.body,
          signOff: body.signOff ?? `Sincerely,\n${fullName}`,
        },
        title: body.title ?? null,
      });
      documentId = result.document.id;
    } catch (err) {
      fastify.log.error({ err }, 'career_letter_compose_error');
      return reply.code(502).send({ error: 'Failed to save this document' });
    }

    try {
      await renderAndSaveDocument(documentId, userId);
    } catch (err) {
      fastify.log.error({ err }, 'career_letter_render_error');
    }

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    return reply.code(201).send({ document: formatDocument(doc) });
  });

  // ── POST /api/career/reference-sheet — CV Studio Phase 9 Supporting
  // Documents (§13). A rendered view of career_references — no AI call,
  // no user input beyond an optional title.
  fastify.post('/api/career/reference-sheet', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { title } = z.object({ title: z.string().max(255).optional() }).parse(request.body ?? {});

    const { rows: references } = await db.query(
      'SELECT name, company, phone, email, relationship FROM career_references WHERE user_id = $1 ORDER BY sort_order ASC',
      [userId],
    );
    if (references.length === 0) {
      return reply.code(400).send({ error: 'No references on file yet — add some in your Master Career Profile first' });
    }

    let documentId: string;
    try {
      const result = await callIntelligence<{ document: { id: string } }>('/internal/career/documents/save', {
        user_id: userId,
        document_type: 'reference_sheet',
        structured_data: {
          references: references.map(r => ({
            name: r.name, company: r.company, phone: r.phone, email: r.email, relationship: r.relationship,
          })),
        },
        title: title ?? null,
      });
      documentId = result.document.id;
    } catch (err) {
      fastify.log.error({ err }, 'career_reference_sheet_error');
      return reply.code(502).send({ error: 'Failed to generate reference sheet' });
    }

    try {
      await renderAndSaveDocument(documentId, userId);
    } catch (err) {
      fastify.log.error({ err }, 'career_reference_sheet_render_error');
    }

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    return reply.code(201).send({ document: formatDocument(doc) });
  });

  // ── POST /api/career/portfolio-pdf — CV Studio Phase 9 Supporting
  // Documents (§13). A rendered view of the user's portfolio-visible
  // projects (projects.is_portfolio_visible, CV Studio Phase 1) — no AI
  // call.
  fastify.post('/api/career/portfolio-pdf', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { title } = z.object({ title: z.string().max(255).optional() }).parse(request.body ?? {});

    const { rows: projects } = await db.query(
      'SELECT title, description FROM projects WHERE user_id = $1 AND is_portfolio_visible = TRUE ORDER BY created_at DESC',
      [userId],
    );
    if (projects.length === 0) {
      return reply.code(400).send({ error: 'No portfolio-visible projects yet — mark a project as portfolio-visible first' });
    }

    let documentId: string;
    try {
      const result = await callIntelligence<{ document: { id: string } }>('/internal/career/documents/save', {
        user_id: userId,
        document_type: 'portfolio_pdf',
        structured_data: { projects: projects.map(p => ({ title: p.title, description: p.description })) },
        title: title ?? null,
      });
      documentId = result.document.id;
    } catch (err) {
      fastify.log.error({ err }, 'career_portfolio_pdf_error');
      return reply.code(502).send({ error: 'Failed to generate portfolio PDF' });
    }

    try {
      await renderAndSaveDocument(documentId, userId);
    } catch (err) {
      fastify.log.error({ err }, 'career_portfolio_pdf_render_error');
    }

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    return reply.code(201).send({ document: formatDocument(doc) });
  });
}
