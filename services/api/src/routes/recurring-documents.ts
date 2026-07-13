import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

const RECURRENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
const DOCUMENT_TYPES = ['quotation', 'invoice'] as const;

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
});

const createBody = z.object({
  contactId: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  items: z.array(lineItemSchema).min(1),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  recurrence: z.enum(RECURRENCES),
  dayOfPeriod: z.number().int().min(0).max(31),
  autoSend: z.boolean().optional(),
});

// dayOfPeriod means day-of-week (0-6, Sun-Sat) for weekly, day-of-month for
// everything else — a deliberate simplification (see docs/BUSINESS_WORKSPACE_PLAN.md
// §15 Phase 3) rather than a full cron-style rule for a first cut of scheduling.
function computeInitialNextRun(recurrence: (typeof RECURRENCES)[number], dayOfPeriod: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);

  if (recurrence === 'weekly') {
    const currentDay = next.getDay();
    let diff = dayOfPeriod - currentDay;
    if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
    next.setDate(next.getDate() + diff);
    return next;
  }

  const day = Math.min(dayOfPeriod || 1, 28);
  next.setDate(day);
  if (next <= now) {
    if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (recurrence === 'quarterly') next.setMonth(next.getMonth() + 3);
    else next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

function formatRule(r: any) {
  return {
    id: r.id,
    contactId: r.contact_id,
    documentType: r.document_type,
    templateData: r.template_data,
    recurrence: r.recurrence,
    dayOfPeriod: r.day_of_period,
    autoSend: r.auto_send,
    isActive: r.is_active,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    lastDocumentId: r.last_document_id,
    contact: r.contact_name ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.avatar_url ?? null } : null,
  };
}

export async function recurringDocumentsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/recurring-documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      `SELECT rd.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name, c.avatar_url
       FROM recurring_documents rd JOIN contacts c ON c.id = rd.contact_id
       WHERE rd.user_id = $1 ORDER BY rd.created_at DESC`,
      [userId],
    );
    return reply.send({ rules: rows.map(formatRule) });
  });

  fastify.post('/api/recurring-documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = createBody.parse(request.body);

    const templateData = { items: body.items, notes: body.notes ?? null, terms: body.terms ?? null };
    const nextRunAt = computeInitialNextRun(body.recurrence, body.dayOfPeriod);

    const { rows: [rule] } = await db.query(
      `INSERT INTO recurring_documents
         (user_id, contact_id, document_type, template_data, recurrence, day_of_period, auto_send, next_run_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, body.contactId, body.documentType, JSON.stringify(templateData), body.recurrence,
        body.dayOfPeriod, body.autoSend ?? false, nextRunAt],
    );

    return reply.code(201).send({ rule: formatRule(rule) });
  });

  fastify.patch('/api/recurring-documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);

    const { rows: [rule] } = await db.query(
      `UPDATE recurring_documents SET is_active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
      [isActive, id, userId],
    );
    if (!rule) return reply.code(404).send({ error: 'Rule not found' });
    return reply.send({ rule: formatRule(rule) });
  });

  fastify.delete('/api/recurring-documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    await db.query('DELETE FROM recurring_documents WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.send({ ok: true });
  });
}
