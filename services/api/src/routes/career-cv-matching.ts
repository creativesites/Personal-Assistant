import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';
import { buildCvRenderData } from '../lib/pdf/cv-context';
import { buildCvPlainText } from '../lib/cv-health';

// CV Studio Phase 8 — Job Matching + Tailored CVs (docs/CV_STUDIO_PLAN.md
// §8, §11, §18 Phase 8). A sibling to career-cvs.ts rather than more routes
// piled into it (career-cvs.ts is already ~400 lines covering the CV object
// model itself) — same "services.ts born as a sibling to products.ts"
// convention this file's own doc header cites elsewhere. Both endpoints
// assemble the CV's live text via the same buildCvRenderData()/
// buildCvPlainText() helpers CV Health (Phase 6) already uses — no
// duplicate CV-assembly logic, and the intelligence service never needs to
// query career_cvs/the entry tables itself.

async function loadCvTextAndSkills(cvId: string, userId: string): Promise<{ cvText: string; cvSkills: string[] } | null> {
  const data = await buildCvRenderData(cvId, userId);
  if (!data) return null;
  return { cvText: buildCvPlainText(data), cvSkills: data.skills };
}

export async function careerCvMatchingRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/career/opportunities/:id/match/:cvId — §11 Job Matching.
  // Embedding-based match score (same cosine-similarity mechanism the older
  // whole-document Resume Studio flow already uses) plus a required-skills
  // diff against the CV's own skill groups.
  fastify.get('/api/career/opportunities/:id/match/:cvId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, cvId } = request.params as { id: string; cvId: string };

    const { rows: [opportunity] } = await db.query(
      'SELECT id FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });

    const cv = await loadCvTextAndSkills(cvId, userId);
    if (!cv) return reply.code(404).send({ error: 'CV not found' });

    try {
      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
      const res = await fetch(`${intelligenceUrl}/internal/career/opportunities/${id}/cv-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, cv_text: cv.cvText, cv_skills: cv.cvSkills }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Failed to match this CV against the opportunity' });
      return reply.send(await res.json());
    } catch (err) {
      fastify.log.error({ err }, 'career_cv_match_error');
      return reply.code(502).send({ error: 'Failed to match this CV against the opportunity' });
    }
  });

  // ── GET /api/career/opportunities/:id/tailoring-suggestions?cvId= — §8
  // Tailored CVs. Proposes which of the CV's own existing content to
  // surface/reorder for this specific opportunity — never invents new
  // content, per CV_STUDIO_NEVER_INVENT_POLICY.
  fastify.get('/api/career/opportunities/:id/tailoring-suggestions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { cvId } = request.query as { cvId?: string };
    if (!cvId) return reply.code(400).send({ error: 'cvId is required' });

    const { rows: [opportunity] } = await db.query(
      'SELECT id FROM career_opportunities WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });

    const cv = await loadCvTextAndSkills(cvId, userId);
    if (!cv) return reply.code(404).send({ error: 'CV not found' });

    try {
      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
      const res = await fetch(`${intelligenceUrl}/internal/career/opportunities/${id}/tailoring-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, cv_text: cv.cvText }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Failed to generate tailoring suggestions' });
      return reply.send(await res.json());
    } catch (err) {
      fastify.log.error({ err }, 'career_cv_tailoring_suggestions_error');
      return reply.code(502).send({ error: 'Failed to generate tailoring suggestions' });
    }
  });
}
