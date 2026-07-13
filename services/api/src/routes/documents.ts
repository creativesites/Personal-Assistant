import type { FastifyInstance } from 'fastify';
import * as fs from 'fs/promises';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';
import { getOrCreateProfile } from './business-profile';
import { addToQueue } from '../lib/queue';
import { QUEUE_NAMES } from '@zuri/types';
import { getInboxConversation, publishInboxEvent } from '../lib/inbox-events';

// quotation -> invoice -> receipt. Each target renders fine with the Phase 0
// templates (they're generic line-item layouts, not quotation/invoice-
// specific) even though only quotation/invoice are offered at creation time.
const CONVERSION_MAP: Record<string, string> = { quotation: 'invoice', invoice: 'receipt' };

const MANUAL_STATUSES = ['sent', 'accepted', 'rejected', 'paid', 'archived'] as const;

// Phase 0 only ships a renderer for these two — the full document_type list
// already exists on the documents table (see migration 0043) to avoid a
// churny type-widening migration once later phases add more templates.
const PHASE_0_TYPES = ['quotation', 'invoice'] as const;

// Phase 2 (AI generation) additionally supports proposals/contracts — the
// minimal/modern templates render narrative "sections" generically, so no
// new template file was needed, just a wider type list. See plan §7/§11.
const AI_GENERATE_TYPES = ['quotation', 'invoice', 'proposal', 'contract'] as const;
const DOCUMENT_CATEGORY: Record<string, string> = {
  quotation: 'sales', invoice: 'sales', proposal: 'sales', contract: 'legal',
};

const lineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
});

const createBody = z.object({
  contactId: z.string().uuid().optional(),
  documentType: z.enum(PHASE_0_TYPES),
  title: z.string().max(255).optional(),
  currency: z.string().length(3).optional(),
  items: z.array(lineItemSchema).min(1),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  validUntil: z.string().optional(),
  dueDate: z.string().optional(),
  templateId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

const updateBody = createBody.partial().extend({
  documentType: z.enum(PHASE_0_TYPES).optional(),
});

function computeTotals(items: z.infer<typeof lineItemSchema>[]) {
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;

  const computedItems = items.map((item) => {
    const lineSubtotal = Math.round(item.quantity * item.unitPriceCents);
    const discount = Math.round(lineSubtotal * ((item.discountPct ?? 0) / 100));
    const afterDiscount = lineSubtotal - discount;
    const tax = Math.round(afterDiscount * ((item.taxPct ?? 0) / 100));
    const lineTotalCents = afterDiscount + tax;

    subtotalCents += lineSubtotal;
    discountCents += discount;
    taxCents += tax;

    return { ...item, lineTotalCents };
  });

  return { computedItems, subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}

async function assignDocumentNumber(userId: string, documentType: string): Promise<string> {
  await getOrCreateProfile(userId);

  const { rows: [row] } = await db.query(
    `WITH current AS (
       SELECT COALESCE((numbering->$1->>'next')::int, 1) AS n,
              COALESCE(numbering->$1->>'prefix', upper($1) || '-') AS prefix
       FROM business_profiles WHERE user_id = $2
       FOR UPDATE
     )
     UPDATE business_profiles
     SET numbering = jsonb_set(
           numbering, ARRAY[$1, 'next'], to_jsonb((SELECT n FROM current) + 1), true
         ),
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING (SELECT prefix FROM current) AS prefix, (SELECT n FROM current) AS assigned`,
    [documentType, userId],
  );

  return `${row.prefix}${row.assigned}`;
}

function formatDocument(r: any) {
  return {
    id: r.id,
    documentType: r.document_type,
    documentCategory: r.document_category,
    documentNumber: r.document_number,
    title: r.title,
    status: r.status,
    structuredData: r.structured_data,
    currency: r.currency,
    subtotalCents: Number(r.subtotal_cents),
    discountCents: Number(r.discount_cents),
    taxCents: Number(r.tax_cents),
    totalCents: Number(r.total_cents),
    version: r.version,
    sourceDocumentId: r.source_document_id,
    requestedBy: r.requested_by,
    aiGenerated: r.ai_generated,
    aiReasoning: r.ai_reasoning,
    aiSummary: r.ai_summary,
    hasPdf: !!r.storage_path,
    contactId: r.contact_id,
    dealId: r.deal_id,
    opportunityId: r.opportunity_id,
    conversationId: r.conversation_id,
    templateId: r.template_id,
    contact: r.contact_name ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.avatar_url ?? null } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    paidAt: r.paid_at,
  };
}

export async function documentsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/document-templates', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      `SELECT id, name, layout_key, category, applicable_to, is_system
       FROM document_templates WHERE is_system = TRUE OR user_id = $1
       ORDER BY is_system DESC, name ASC`,
      [userId],
    );
    return reply.send({
      templates: rows.map((r: any) => ({
        id: r.id, name: r.name, layoutKey: r.layout_key, category: r.category,
        applicableTo: r.applicable_to, isSystem: r.is_system,
      })),
    });
  });

  fastify.get('/api/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { type, status, contactId } = request.query as { type?: string; status?: string; contactId?: string };

    const conditions = ['d.user_id = $1'];
    const params: any[] = [userId];
    if (type) { params.push(type); conditions.push(`d.document_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`d.status = $${params.length}`); }
    if (contactId) { params.push(contactId); conditions.push(`d.contact_id = $${params.length}`); }

    const { rows } = await db.query(
      `SELECT d.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name, c.avatar_url
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC
       LIMIT 100`,
      params,
    );
    return reply.send({ documents: rows.map(formatDocument) });
  });

  fastify.get('/api/documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { rows: [doc] } = await db.query(
      `SELECT d.*, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name, c.avatar_url
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId],
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: events } = await db.query(
      'SELECT event_type, metadata, occurred_at FROM document_events WHERE document_id = $1 ORDER BY occurred_at ASC',
      [id],
    );

    return reply.send({
      document: formatDocument(doc),
      events: events.map((e: any) => ({ eventType: e.event_type, metadata: e.metadata, occurredAt: e.occurred_at })),
    });
  });

  fastify.post('/api/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = createBody.parse(request.body);

    const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(body.items);
    const documentNumber = await assignDocumentNumber(userId, body.documentType);
    const title = body.title ?? `${body.documentType[0].toUpperCase()}${body.documentType.slice(1)} ${documentNumber}`;

    const structuredData = {
      items: computedItems,
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      validUntil: body.validUntil ?? null,
      dueDate: body.dueDate ?? null,
    };

    const { rows: [doc] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents, requested_by, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sales',$8,$9,'draft',$10,$11,$12,$13,$14,$15,'user',false)
       RETURNING *`,
      [
        userId, body.contactId ?? null, body.dealId ?? null, body.opportunityId ?? null,
        body.conversationId ?? null, body.templateId ?? null, body.documentType, documentNumber, title,
        JSON.stringify(structuredData), body.currency ?? 'ZMW', subtotalCents, discountCents, taxCents, totalCents,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', '{}')`,
      [doc.id],
    );

    return reply.code(201).send({ document: formatDocument(doc) });
  });

  fastify.patch('/api/documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = updateBody.parse(request.body);

    const { rows: [existing] } = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!existing) return reply.code(404).send({ error: 'Document not found' });
    if (existing.status !== 'draft') {
      return reply.code(400).send({ error: 'Only draft documents can be edited' });
    }

    const items = body.items ?? existing.structured_data?.items ?? [];
    const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(items);

    const structuredData = {
      items: computedItems,
      notes: body.notes ?? existing.structured_data?.notes ?? null,
      terms: body.terms ?? existing.structured_data?.terms ?? null,
      validUntil: body.validUntil ?? existing.structured_data?.validUntil ?? null,
      dueDate: body.dueDate ?? existing.structured_data?.dueDate ?? null,
    };

    const { rows: [updated] } = await db.query(
      `UPDATE documents SET
         contact_id = COALESCE($1, contact_id),
         title = COALESCE($2, title),
         structured_data = $3,
         currency = COALESCE($4, currency),
         subtotal_cents = $5, discount_cents = $6, tax_cents = $7, total_cents = $8,
         template_id = COALESCE($9, template_id),
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        body.contactId ?? null, body.title ?? null, JSON.stringify(structuredData), body.currency ?? null,
        subtotalCents, discountCents, taxCents, totalCents, body.templateId ?? null, id,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'edited', '{}')`,
      [id],
    );

    return reply.send({ document: formatDocument(updated) });
  });

  // ── POST /api/documents/:id/generate — renders the PDF via the
  // intelligence service, which owns the actual layout/PDF work (see
  // docs/BUSINESS_WORKSPACE_PLAN.md §4). This route is a thin proxy, same
  // pattern as conversations.ts's /summarize.
  fastify.post('/api/documents/:id/generate', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/${id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const errText = await res.text();
        fastify.log.error({ errText }, 'document_render_failed');
        return reply.code(502).send({ error: 'Failed to generate document' });
      }
      const data = await res.json() as { id: string; status: string; storagePath: string };
      return reply.send({ ok: true, status: data.status });
    } catch (err) {
      fastify.log.error({ err }, 'document_render_error');
      return reply.code(502).send({ error: 'Failed to generate document' });
    }
  });

  // ── POST /api/documents/ai-generate — conversational creation (plan §7).
  // Resolves against a picked contactId (never free-text name matching —
  // see the intelligence route's own note on why) and a real product
  // catalog; the model only fills in structured data, never layout.
  fastify.post('/api/documents/ai-generate', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = z.object({
      contactId: z.string().uuid(),
      documentType: z.enum(AI_GENERATE_TYPES),
      instruction: z.string().min(3).max(2000),
      dealId: z.string().uuid().optional(),
      opportunityId: z.string().uuid().optional(),
      conversationId: z.string().uuid().optional(),
    }).parse(request.body);

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    let generated: {
      items: z.infer<typeof lineItemSchema>[]; sections: { heading: string; body: string }[];
      notes: string; terms: string; validUntil: string | null; dueDate: string | null;
      reasoning: string; insights: { key: string; value: string; confidence?: number }[];
    };
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId, contact_id: body.contactId,
          document_type: body.documentType, instruction: body.instruction,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        fastify.log.error({ errText }, 'document_ai_generate_failed');
        return reply.code(502).send({ error: 'Failed to generate document data' });
      }
      generated = await res.json() as typeof generated;
    } catch (err) {
      fastify.log.error({ err }, 'document_ai_generate_error');
      return reply.code(502).send({ error: 'Failed to generate document data' });
    }

    const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(generated.items);
    const documentNumber = await assignDocumentNumber(userId, body.documentType);
    const title = `${body.documentType[0].toUpperCase()}${body.documentType.slice(1)} ${documentNumber}`;

    const structuredData = {
      items: computedItems,
      sections: generated.sections,
      notes: generated.notes || null,
      terms: generated.terms || null,
      validUntil: generated.validUntil,
      dueDate: generated.dueDate,
    };

    const { rows: [doc] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id,
          document_type, document_category, document_number, title, status, structured_data,
          subtotal_cents, discount_cents, tax_cents, total_cents,
          requested_by, ai_generated, ai_reasoning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12,$13,$14,'user',true,$15)
       RETURNING *`,
      [
        userId, body.contactId, body.dealId ?? null, body.opportunityId ?? null, body.conversationId ?? null,
        body.documentType, DOCUMENT_CATEGORY[body.documentType] ?? 'sales', documentNumber, title,
        JSON.stringify(structuredData), subtotalCents, discountCents, taxCents, totalCents, generated.reasoning || null,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2)`,
      [doc.id, JSON.stringify({ aiGenerated: true })],
    );

    // AI Document Memory (plan §7) — ordinary contact_insights rows, so
    // every existing consumer (profiler, reply generation) already picks
    // these up. Only what the model explicitly extracted, never guessed.
    for (const insight of generated.insights ?? []) {
      if (!insight.key || !insight.value) continue;
      await db.query(
        `INSERT INTO contact_insights
           (contact_id, user_id, insight_key, insight_value, confidence, supporting_text, source, source_document_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'document', $7)`,
        [body.contactId, userId, insight.key, insight.value, insight.confidence ?? 0.6, body.instruction.slice(0, 500), doc.id],
      );
    }

    return reply.code(201).send({ document: formatDocument(doc) });
  });

  // ── POST /api/documents/:id/quality-check — advisory only, never blocks
  // sending. See plan §15 Phase 2.
  fastify.post('/api/documents/:id/quality-check', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/${id}/quality-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const errText = await res.text();
        fastify.log.error({ errText }, 'document_quality_check_failed');
        return reply.code(502).send({ error: 'Failed to check document quality' });
      }
      const data = await res.json() as { score: number; issues: string[]; recommendation: string };
      return reply.send(data);
    } catch (err) {
      fastify.log.error({ err }, 'document_quality_check_error');
      return reply.code(502).send({ error: 'Failed to check document quality' });
    }
  });

  // ── GET /api/documents/:id/pdf — serves the rendered PDF. Business
  // documents are sensitive (customer pricing, bank details), so unlike
  // media.ts's WhatsApp media this always requires a valid JWT — no
  // optional-token bypass.
  fastify.get('/api/documents/:id/pdf', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query(
      'SELECT storage_path, document_number FROM documents WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!doc?.storage_path) return reply.code(404).send({ error: 'PDF not generated yet' });

    try {
      const buf = await fs.readFile(doc.storage_path);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="${doc.document_number}.pdf"`);
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'PDF file missing on disk' });
    }
  });

  // ── POST /api/documents/:id/status — manual status transitions. Draft/
  // generated/viewed/downloaded are system-set (created, rendered, tracked);
  // these five are the ones a human decides.
  fastify.post('/api/documents/:id/status', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(MANUAL_STATUSES) }).parse(request.body);

    const { rows: [existing] } = await db.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!existing) return reply.code(404).send({ error: 'Document not found' });

    const timestampColumn = status === 'sent' ? 'sent_at' : status === 'paid' ? 'paid_at' : null;
    const { rows: [updated] } = await db.query(
      `UPDATE documents SET status = $1, updated_at = NOW()${timestampColumn ? `, ${timestampColumn} = NOW()` : ''}
       WHERE id = $2 RETURNING *`,
      [status, id],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, $2, '{}')`,
      [id, status],
    );

    return reply.send({ document: formatDocument(updated) });
  });

  // ── POST /api/documents/:id/convert — quotation -> invoice -> receipt.
  // Copies structured_data forward so nothing is retyped; the new document
  // is a fresh draft the user reviews/edits before generating its own PDF.
  fastify.post('/api/documents/:id/convert', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [source] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!source) return reply.code(404).send({ error: 'Document not found' });

    const targetType = CONVERSION_MAP[source.document_type];
    if (!targetType) {
      return reply.code(400).send({ error: `Cannot convert a ${source.document_type}` });
    }

    const documentNumber = await assignDocumentNumber(userId, targetType);
    const title = `${targetType[0].toUpperCase()}${targetType.slice(1)} ${documentNumber}`;

    const { rows: [created] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          source_document_id, requested_by, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17,'user',false)
       RETURNING *`,
      [
        userId, source.contact_id, source.deal_id, source.opportunity_id, source.conversation_id,
        source.template_id, targetType, source.document_category, documentNumber, title,
        JSON.stringify(source.structured_data), source.currency, source.subtotal_cents,
        source.discount_cents, source.tax_cents, source.total_cents, source.id,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2)`,
      [created.id, JSON.stringify({ convertedFrom: source.id })],
    );
    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'converted', $2)`,
      [source.id, JSON.stringify({ convertedTo: created.id, targetType })],
    );

    return reply.code(201).send({ document: formatDocument(created) });
  });

  // ── POST /api/documents/:id/revise — version history. Editing a document
  // that's already been sent/generated shouldn't silently mutate what the
  // customer already saw; this clones it forward as a new draft version
  // instead, chained via source_document_id.
  fastify.post('/api/documents/:id/revise', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = updateBody.parse(request.body ?? {});

    const { rows: [existing] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!existing) return reply.code(404).send({ error: 'Document not found' });

    const items = body.items ?? existing.structured_data?.items ?? [];
    const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(items);
    const structuredData = {
      items: computedItems,
      notes: body.notes ?? existing.structured_data?.notes ?? null,
      terms: body.terms ?? existing.structured_data?.terms ?? null,
      validUntil: body.validUntil ?? existing.structured_data?.validUntil ?? null,
      dueDate: body.dueDate ?? existing.structured_data?.dueDate ?? null,
    };

    const newVersion = existing.version + 1;
    const documentNumber = `${existing.document_number}-v${newVersion}`;

    const { rows: [created] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          version, source_document_id, requested_by, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17,$18,'user',false)
       RETURNING *`,
      [
        userId, existing.contact_id, existing.deal_id, existing.opportunity_id, existing.conversation_id,
        existing.template_id, existing.document_type, existing.document_category, documentNumber, existing.title,
        JSON.stringify(structuredData), body.currency ?? existing.currency, subtotalCents, discountCents,
        taxCents, totalCents, newVersion, existing.id,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2)`,
      [created.id, JSON.stringify({ revisionOf: existing.id, version: newVersion })],
    );

    return reply.code(201).send({ document: formatDocument(created) });
  });

  // ── GET /api/documents/:id/versions — the full version chain, oldest first.
  fastify.get('/api/documents/:id/versions', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    // Walk to the root of the version chain (source_document_id may itself
    // be a revision), then fetch every row that chains from it.
    let rootId = doc.id;
    let cursor = doc.source_document_id;
    while (cursor) {
      const { rows: [parent] } = await db.query(
        'SELECT id, source_document_id FROM documents WHERE id = $1 AND user_id = $2', [cursor, userId],
      );
      if (!parent) break;
      rootId = parent.id;
      cursor = parent.source_document_id;
    }

    const { rows } = await db.query(
      `WITH RECURSIVE chain AS (
         SELECT * FROM documents WHERE id = $1
         UNION ALL
         SELECT d.* FROM documents d JOIN chain c ON d.source_document_id = c.id
       )
       SELECT * FROM chain ORDER BY version ASC`,
      [rootId],
    );

    return reply.send({ versions: rows.map(formatDocument) });
  });

  // ── POST /api/documents/:id/send — dispatches the generated PDF over
  // WhatsApp without leaving the page. Same lazy-conversation-creation +
  // SEND_REPLY-queue pattern as proactive.ts's Send Now (shipped earlier),
  // extended with the media fields §5 of the plan added to the job payload.
  fastify.post('/api/documents/:id/send', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { caption } = z.object({ caption: z.string().max(1000).optional() }).parse(request.body ?? {});

    const { rows: [doc] } = await db.query(
      `SELECT d.*, co.whatsapp_jid
       FROM documents d JOIN contacts co ON co.id = d.contact_id
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId],
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found or has no linked contact' });
    if (!doc.storage_path) return reply.code(400).send({ error: 'Generate the PDF before sending' });

    const { rows: [conv] } = await db.query(
      `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
         last_message_at = NOW(), last_message_preview = $4, updated_at = NOW()
       RETURNING id`,
      [userId, doc.contact_id, doc.whatsapp_jid, `${doc.title} (${doc.document_number})`],
    );

    const now = new Date();
    const tempWaId = `direct-${crypto.randomUUID()}`;
    const fileName = `${doc.document_number}.pdf`;
    const messageCaption = caption ?? `${doc.title} — ${doc.document_number}`;

    const { rows: [msg] } = await db.query(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body,
          media_url, media_mime_type, whatsapp_timestamp)
       VALUES ($1, $2, 'user', 'document', $3, $4, 'application/pdf', $5)
       RETURNING id`,
      [conv.id, tempWaId, messageCaption, `/api/documents/${id}/pdf`, now],
    );

    await addToQueue(QUEUE_NAMES.SEND_REPLY, {
      userId,
      messageId: msg.id,
      suggestedReplyId: null,
      recipientJid: doc.whatsapp_jid,
      text: messageCaption,
      mediaPath: doc.storage_path,
      mediaMimeType: 'application/pdf',
      mediaFileName: fileName,
    });

    await db.query(
      `UPDATE documents SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'sent', '{}')`,
      [id],
    );

    const conversation = await getInboxConversation(userId, conv.id);
    if (conversation) {
      await publishInboxEvent(userId, 'conversation:upsert', { conversation });
    }
    await publishInboxEvent(userId, 'message:new', {
      messageId: msg.id, conversationId: conv.id, contactId: doc.contact_id,
      senderType: 'user', messageType: 'document', body: messageCaption,
      mediaUrl: `/api/documents/${id}/pdf`, mediaMimeType: 'application/pdf', transcription: null,
      timestamp: now.toISOString(),
    });

    return reply.send({ ok: true, conversationId: conv.id });
  });

  fastify.delete('/api/documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { rows: [existing] } = await db.query(
      'SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!existing) return reply.code(404).send({ error: 'Document not found' });

    await db.query(`UPDATE documents SET status = 'archived', updated_at = NOW() WHERE id = $1`, [id]);
    return reply.send({ ok: true });
  });
}
