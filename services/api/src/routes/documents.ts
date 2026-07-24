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
import {
  renderAndSaveDocument, getDocumentRenderContext, persistRenderedPdf, NotFoundError, UnsupportedDocumentTypeError,
} from '../services/document-render';
import { resolveInvoiceGapNudges } from '../lib/reality-engine';
import { recordBusinessEvent, checkMilestoneCrossing } from '../lib/business-feed';

// quotation -> invoice -> receipt. Each target renders fine with the Phase 0
// templates (they're generic line-item layouts, not quotation/invoice-
// specific) even though only quotation/invoice are offered at creation time.
const CONVERSION_MAP: Record<string, string> = {
  quotation: 'invoice',
  invoice: 'receipt',
  purchase_order: 'delivery_note',
  proposal: 'contract',
  msa: 'statement_of_work',
};

const MANUAL_STATUSES = ['sent', 'accepted', 'rejected', 'paid', 'archived'] as const;

export const PHASE_0_TYPES = [
  'quotation', 'invoice', 'receipt',
  'purchase_order', 'delivery_note', 'credit_note', 'debit_note', 'catalog', 'price_sheet',
  'proposal', 'contract', 'statement_of_work', 'service_agreement', 'nda', 'msa',
  'account_statement', 'expense_report', 'expense_claim'
] as const;

const AI_GENERATE_TYPES = PHASE_0_TYPES;

const DOCUMENT_CATEGORY: Record<string, string> = {
  quotation: 'sales', invoice: 'sales', receipt: 'sales',
  purchase_order: 'sales', delivery_note: 'sales', credit_note: 'sales', debit_note: 'sales', catalog: 'sales', price_sheet: 'sales',
  proposal: 'legal', contract: 'legal', statement_of_work: 'legal', service_agreement: 'legal', nda: 'legal', msa: 'legal',
  account_statement: 'finance', expense_report: 'operations', expense_claim: 'operations'
};

export const lineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
});

const manualContactSchema = z.object({
  name: z.string().min(1).max(255),
  company: z.string().max(255).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
});

const sectionSchema = z.object({
  heading: z.string().min(1).max(255),
  body: z.string().min(1),
});

const createBody = z.object({
  contactId: z.string().uuid().optional(),
  manualContact: manualContactSchema.optional(),
  documentType: z.enum(PHASE_0_TYPES),
  title: z.string().max(255).optional(),
  currency: z.string().length(3).optional(),
  items: z.array(lineItemSchema).optional().default([]),
  sections: z.array(sectionSchema).optional().default([]),
  structuredData: z.record(z.any()).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  validUntil: z.string().optional(),
  dueDate: z.string().optional(),
  templateId: z.string().uuid().optional(),
  businessProfileId: z.string().uuid().optional(),
  signatureId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

const updateBody = createBody.partial().extend({
  documentType: z.enum(PHASE_0_TYPES).optional(),
  // Widened to nullable (unlike createBody) so the full-detail edit form can
  // explicitly clear a linked contact to switch to a manual one, and clear
  // an overridden brand profile back to "use my default" — createBody has
  // no such "explicitly clear" case since a document starts with neither set.
  contactId: z.string().uuid().nullable().optional(),
  businessProfileId: z.string().uuid().nullable().optional(),
  signatureId: z.string().uuid().nullable().optional(),
});

export function computeTotals(items: z.infer<typeof lineItemSchema>[]) {
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

// businessProfileId (Reusable named Brand Profiles) scopes the numbering
// sequence to that specific profile instead of the user's default — each
// named brand profile gets its own independent INV-/QT- counter, so a
// "side company"'s invoices never collide with the main business's numbers.
export async function assignDocumentNumber(
  userId: string, documentType: string, businessProfileId?: string | null,
): Promise<string> {
  const profileFilter = businessProfileId ? 'id = $2 AND user_id = $3' : 'user_id = $2 AND is_default = true';
  const params = businessProfileId ? [documentType, businessProfileId, userId] : [documentType, userId];
  if (!businessProfileId) await getOrCreateProfile(userId);

  const { rows: [row] } = await db.query(
    `WITH current AS (
       SELECT COALESCE((numbering->$1->>'next')::int, 1) AS n,
              COALESCE(numbering->$1->>'prefix', upper($1) || '-') AS prefix
       FROM business_profiles WHERE ${profileFilter}
       FOR UPDATE
     )
     UPDATE business_profiles
     SET numbering = jsonb_set(
           numbering, ARRAY[$1, 'next'], to_jsonb((SELECT n FROM current) + 1), true
         ),
         updated_at = NOW()
     WHERE ${profileFilter}
     RETURNING (SELECT prefix FROM current) AS prefix, (SELECT n FROM current) AS assigned`,
    params,
  );

  if (!row) throw new Error('Brand profile not found for numbering');
  return `${row.prefix}${row.assigned}`;
}

export function formatDocument(r: any) {
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
    shareToken: r.share_token,
    viewCount: r.view_count,
    businessProfileId: r.business_profile_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    opportunityId: r.opportunity_id,
    conversationId: r.conversation_id,
    projectId: r.project_id,
    supplierId: r.supplier_id,
    templateId: r.template_id,
    contact: r.contact_name ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.avatar_url ?? null } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    paidAt: r.paid_at,
  };
}

// Extracted so both the /send route and the recurring-documents worker
// (services/api/src/workers/recurring-documents-worker.ts, plan §15
// Phase 3) can dispatch a document over WhatsApp without duplicating the
// lazy-conversation-creation + SEND_REPLY-queue logic.
export async function sendDocumentViaWhatsApp(
  userId: string, id: string, caption?: string,
): Promise<{ conversationId: string } | { error: string; status: number }> {
  const { rows: [doc] } = await db.query(
    `SELECT d.*, co.whatsapp_jid
     FROM documents d JOIN contacts co ON co.id = d.contact_id
     WHERE d.id = $1 AND d.user_id = $2`,
    [id, userId],
  );
  if (!doc) return { error: 'Document not found or has no linked contact', status: 404 };
  if (!doc.storage_path) return { error: 'Generate the PDF before sending', status: 400 };

  // Shareable link (plan §15 Phase 4) — sent alongside the file attachment
  // so re-opening it is trackable as a real "view" (an attached file itself
  // gives no such signal). See GET /api/documents/shared/:token below.
  const shareUrl = `${config.PUBLIC_API_URL}/api/documents/shared/${doc.share_token}`;

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
  const messageCaption = `${caption ?? `${doc.title} — ${doc.document_number}`}\n${shareUrl}`;

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

  return { conversationId: conv.id };
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

    // Unified Document Versioning: Filter out historical records by keeping
    // only the latest leaf node version (the document that has no descendant
    // pointing back to its ID as a source_document_id).
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM documents sub WHERE sub.source_document_id = d.id
    )`);

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
    const documentNumber = await assignDocumentNumber(userId, body.documentType, body.businessProfileId);
    const title = body.title ?? `${body.documentType[0].toUpperCase()}${body.documentType.slice(1)} ${documentNumber}`;

    const structuredData = {
      ...(body.structuredData || {}),
      items: computedItems,
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      validUntil: body.validUntil ?? null,
      dueDate: body.dueDate ?? null,
      manualContact: body.contactId ? null : (body.manualContact ?? null),
      sections: body.sections ?? (body.structuredData?.sections || []),
    };

    const { rows: [doc] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id, project_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents, requested_by, ai_generated,
          business_profile_id, signature_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sales',$9,$10,'draft',$11,$12,$13,$14,$15,$16,'user',false,$17,$18)
       RETURNING *`,
      [
        userId, body.contactId ?? null, body.dealId ?? null, body.opportunityId ?? null,
        body.conversationId ?? null, body.templateId ?? null, body.projectId ?? null,
        body.documentType, documentNumber, title,
        JSON.stringify(structuredData), body.currency ?? 'ZMW', subtotalCents, discountCents, taxCents, totalCents,
        body.businessProfileId ?? null, body.signatureId ?? null,
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

    // A full-detail edit always resubmits "who this is for" as a whole —
    // either contactId or manualContact, never both — so whichever key is
    // present wins outright rather than being merged field-by-field.
    const hasContactUpdate = 'contactId' in body || 'manualContact' in body;
    const nextContactId = hasContactUpdate ? (body.contactId ?? null) : existing.contact_id;
    const nextManualContact = hasContactUpdate
      ? (nextContactId ? null : (body.manualContact ?? null))
      : (existing.structured_data?.manualContact ?? null);

    const structuredData = {
      ...(existing.structured_data || {}),
      ...(body.structuredData || {}),
      items: computedItems,
      notes: body.notes ?? existing.structured_data?.notes ?? null,
      terms: body.terms ?? existing.structured_data?.terms ?? null,
      validUntil: body.validUntil ?? existing.structured_data?.validUntil ?? null,
      dueDate: body.dueDate ?? existing.structured_data?.dueDate ?? null,
      manualContact: nextManualContact,
      sections: body.sections ?? body.structuredData?.sections ?? existing.structured_data?.sections ?? [],
    };

    const hasBusinessProfileUpdate = 'businessProfileId' in body;
    const hasSignatureIdUpdate = 'signatureId' in body;

    const { rows: [updated] } = await db.query(
      `UPDATE documents SET
         contact_id = $1,
         title = COALESCE($2, title),
         structured_data = $3,
         currency = COALESCE($4, currency),
         subtotal_cents = $5, discount_cents = $6, tax_cents = $7, total_cents = $8,
         template_id = COALESCE($9, template_id),
         business_profile_id = CASE WHEN $10::boolean THEN $11::uuid ELSE business_profile_id END,
         signature_id = CASE WHEN $13::boolean THEN $14::uuid ELSE signature_id END,
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        nextContactId, body.title ?? null, JSON.stringify(structuredData), body.currency ?? null,
        subtotalCents, discountCents, taxCents, totalCents, body.templateId ?? null,
        hasBusinessProfileUpdate, body.businessProfileId ?? null, id,
        hasSignatureIdUpdate, body.signatureId ?? null,
      ],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'edited', '{}')`,
      [id],
    );

    return reply.send({ document: formatDocument(updated) });
  });

  // ── POST /api/documents/:id/generate — renders the PDF in-process using
  // @react-pdf/renderer (services/api/src/lib/pdf). Previously proxied to
  // the intelligence service's Jinja2+Playwright pipeline; now Node owns
  // rendering directly, since the PDF template is Node/React now too.
  fastify.post('/api/documents/:id/generate', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    try {
      const result = await renderAndSaveDocument(id, userId);
      return reply.send({ ok: true, status: result.status });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: 'Document not found' });
      fastify.log.error({ err }, 'document_render_error');
      return reply.code(500).send({ error: 'Failed to generate document' });
    }
  });

  // ── GET /api/documents/:id/render-context — the data-only counterpart to
  // /generate, per the PDF Rendering Architecture (see CLAUDE.md and
  // docs/PDF_TEMPLATE_GUIDE.md): everything a user is actively looking at
  // renders client-side in the browser using the exact same @zuri/pdf-
  // templates components as the server does. This assembles the same
  // {document, business, contact} shape renderDocumentPdf() feeds a
  // template, and tells the caller which template the document actually
  // uses, so the frontend never has to re-derive money/date formatting or
  // guess which template to render.
  fastify.get('/api/documents/:id/render-context', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    try {
      const context = await getDocumentRenderContext(id, userId);
      return reply.send(context);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: 'Document not found' });
      if (err instanceof UnsupportedDocumentTypeError) {
        return reply.code(400).send({ error: `${err.message} documents render via the career endpoints, not this one` });
      }
      fastify.log.error({ err }, 'document_render_context_error');
      return reply.code(500).send({ error: 'Failed to load render context' });
    }
  });

  // ── POST /api/documents/:id/render-complete — the frontend, having
  // rendered the PDF client-side from /render-context's data, uploads the
  // resulting bytes here so storage_path/status get set exactly the way
  // the old server-render path used to — this is what keeps WhatsApp send,
  // the public share link, and status transitions working unchanged. Plain
  // "application/pdf" body, not multipart — the client already has a Blob.
  fastify.post('/api/documents/:id/render-complete', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/pdf')) {
      return reply.code(400).send({ error: 'Expected a raw application/pdf body' });
    }
    const pdfBuffer = request.body as Buffer;
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return reply.code(400).send({ error: 'Empty PDF body' });
    }

    const { rows: [doc] } = await db.query('SELECT status FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    try {
      const result = await persistRenderedPdf(id, userId, doc.status, pdfBuffer);
      return reply.send({ ok: true, status: result.status });
    } catch (err) {
      fastify.log.error({ err }, 'document_render_complete_error');
      return reply.code(500).send({ error: 'Failed to save rendered document' });
    }
  });

  // ── POST /api/documents/internal/:id/render — the same renderer, reached
  // over HTTP by services/intelligence (the autonomous agent's create_document
  // tool and Automatic Business Packs, which have no user JWT in scope).
  // Mirrors auth.ts's clerk-sync x-internal-secret pattern, in reverse
  // direction — permissive if INTERNAL_API_SECRET is unset (dev), enforced
  // in prod where the env var is always set on both containers.
  fastify.post('/api/documents/internal/:id/render', async (request, reply) => {
    const secret = (request.headers['x-internal-secret'] as string) ?? '';
    if (config.INTERNAL_API_SECRET && secret !== config.INTERNAL_API_SECRET) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params as { id: string };
    let body: { userId: string };
    try {
      body = z.object({ userId: z.string().uuid() }).parse(request.body);
    } catch (err: any) {
      return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
    }

    try {
      const result = await renderAndSaveDocument(id, body.userId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: 'Document not found' });
      fastify.log.error({ err }, 'document_internal_render_error');
      return reply.code(500).send({ error: 'Failed to generate document' });
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
      projectId: z.string().uuid().optional(),
    }).parse(request.body);

    // 1. Data-first check: if catalog products exist in user's database, use them directly
    const { rows: catalogProducts } = await db.query(
      `SELECT id, name, description, price, selling_price, currency
       FROM products
       WHERE user_id = $1 AND status != 'deleted'
       ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    );

    const instLower = body.instruction.toLowerCase();
    const matchingProducts = catalogProducts.filter((p) => {
      const name = (p.name || '').toLowerCase();
      return instLower.includes(name) || name.split(' ').some((word: string) => word.length > 3 && instLower.includes(word));
    });

    const productsToUse = matchingProducts.length > 0 ? matchingProducts : (catalogProducts.length > 0 && (instLower.includes('quotation') || instLower.includes('invoice') || instLower.includes('order') || instLower.includes('catalog')) ? catalogProducts.slice(0, 3) : []);

    let generated: {
      items: z.infer<typeof lineItemSchema>[]; sections: { heading: string; body: string }[];
      notes: string; terms: string; validUntil: string | null; dueDate: string | null;
      reasoning: string; insights: { key: string; value: string; confidence?: number }[];
    };

    if (productsToUse.length > 0) {
      // Deterministic data generation from catalog
      generated = {
        items: productsToUse.map((p) => ({
          productId: p.id,
          description: p.name + (p.description ? ` — ${p.description}` : ''),
          quantity: 1,
          unitPriceCents: Math.round(Number(p.selling_price ?? p.price ?? 0) * 100),
          taxPct: 0,
          discountPct: 0,
        })),
        sections: [],
        notes: 'Generated from catalog products.',
        terms: 'Standard terms apply.',
        validUntil: null,
        dueDate: null,
        reasoning: 'Data-driven deterministic document generation from catalog.',
        insights: [],
      };
    } else {
      // Membership Platform Phase 1 — consume credit when calling AI
      const { rows: [creditRow] } = await db.query(
        `UPDATE subscriptions SET documents_remaining_today = documents_remaining_today - 1
         WHERE user_id = $1 AND status IN ('active', 'trialing') AND documents_remaining_today > 0
         RETURNING id`,
        [userId],
      );
      if (!creditRow) {
        return reply.code(402).send({ error: 'Daily document generation limit reached. Upgrade for unlimited documents.' });
      }

      const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
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
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, project_id,
          document_type, document_category, document_number, title, status, structured_data,
          subtotal_cents, discount_cents, tax_cents, total_cents,
          requested_by, ai_generated, ai_reasoning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,'user',true,$16)
       RETURNING *`,
      [
        userId, body.contactId, body.dealId ?? null, body.opportunityId ?? null, body.conversationId ?? null,
        body.projectId ?? null, body.documentType, DOCUMENT_CATEGORY[body.documentType] ?? 'sales', documentNumber, title,
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

  // ── POST /api/documents/:id/send-whatsapp — 1-click WhatsApp dispatch.
  // Renders PDF, creates or reuses public share token, and dispatches the link.
  fastify.post('/api/documents/:id/send-whatsapp', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query(
      `SELECT d.*, c.phone_number, c.custom_name, c.display_name, c.whatsapp_jid
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId],
    );

    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    // 1. Render PDF if needed
    try {
      await renderAndSaveDocument(id, userId);
    } catch (err) {
      fastify.log.warn({ err }, 'send_whatsapp_render_warning');
    }

    // 2. Find or create public share token
    let shareToken = '';
    const { rows: [existingShare] } = await db.query(
      `SELECT share_token FROM document_shares WHERE document_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
      [id],
    );

    if (existingShare) {
      shareToken = existingShare.share_token;
    } else {
      const { rows: [newShare] } = await db.query(
        `INSERT INTO document_shares (document_id, created_by, is_active)
         VALUES ($1, $2, true) RETURNING share_token`,
        [id, userId],
      );
      shareToken = newShare?.share_token || '';
    }

    const baseUrl = process.env.CORS_ORIGIN || 'https://zuri-personal-assistant-delta.vercel.app';
    const shareUrl = `${baseUrl}/shared/${shareToken}`;
    const totalFmt = `${doc.currency || 'USD'} ${(Number(doc.total_cents || 0) / 100).toFixed(2)}`;
    const docLabel = (doc.document_type || 'document').toUpperCase();

    const recipientName = doc.custom_name || doc.display_name || 'there';
    const messageText = `Hi ${recipientName},\n\nHere is your *${docLabel}* (${doc.document_number || ''}) for *${totalFmt}*:\n\n📄 View, accept, or download here:\n${shareUrl}\n\nPlease let us know if you have any questions!`;

    // 3. Dispatch WhatsApp message
    const waServiceUrl = process.env.WHATSAPP_SERVICE_URL || config.WHATSAPP_SERVICE_URL;
    const recipient = doc.whatsapp_jid || doc.phone_number || '';

    if (recipient) {
      try {
        await fetch(`${waServiceUrl}/api/whatsapp/send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': config.INTERNAL_API_SECRET || '',
          },
          body: JSON.stringify({
            userId,
            recipient,
            message: messageText,
          }),
        });
      } catch (err) {
        fastify.log.error({ err }, 'whatsapp_dispatch_error');
      }
    }

    // 4. Update document status to 'sent'
    await db.query(
      `UPDATE documents SET status = 'sent', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'sent_whatsapp', $2)`,
      [id, JSON.stringify({ recipient, shareToken, shareUrl })],
    );

    return reply.send({
      ok: true,
      documentId: id,
      shareToken,
      shareUrl,
      messageText,
    });
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

  // ── GET /api/documents/:id/pdf — serves the rendered PDF.
  // Accepts JWT via Authorization header OR ?token= query param so
  // window.open() (which can't set headers) can still open PDFs in a new tab.
  fastify.get('/api/documents/:id/pdf', async (request, reply) => {
    const { token: queryToken } = request.query as { token?: string };
    const authHeader = request.headers.authorization;
    const jwtToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
    if (!jwtToken) return reply.code(401).send({ error: 'Unauthorized' });
    let userId: string;
    try {
      const decoded = fastify.jwt.verify(jwtToken) as { userId: string };
      userId = decoded.userId;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
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

    if (status === 'paid') {
      if (updated.deal_id || updated.project_id) {
        // Reality Engine Layer 1 (docs/REALITY_ENGINE_PLAN.md §7, Hook B) —
        // a paid invoice resolves the matching invoice-gap nudge immediately
        // rather than leaving it until the daily sweep catches it.
        await resolveInvoiceGapNudges(
          userId, { dealId: updated.deal_id, projectId: updated.project_id }, 'Invoice marked paid',
        ).catch(() => { /* best-effort — the status update itself already succeeded */ });
      }

      // Automatically generate receipt and update sales/revenue stats
      if (updated.document_type === 'invoice') {
        try {
          // 1. Generate receipt
          const receiptNumber = await assignDocumentNumber(userId, 'receipt', updated.business_profile_id);
          const receiptTitle = `Receipt ${receiptNumber}`;

          const { rows: [receipt] } = await db.query(
            `INSERT INTO documents
               (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
                document_type, document_category, document_number, title, status, structured_data,
                currency, subtotal_cents, discount_cents, tax_cents, total_cents,
                source_document_id, requested_by, ai_generated, business_profile_id, paid_at)
             VALUES ($1,$2,$3,$4,$5,$6,'receipt',$7,$8,$9,'paid',$10,$11,$12,$13,$14,$15,$16,'system',false,$17,NOW())
             RETURNING *`,
            [
              userId, updated.contact_id, updated.deal_id, updated.opportunity_id, updated.conversation_id,
              updated.template_id, updated.document_category, receiptNumber, receiptTitle,
              JSON.stringify(updated.structured_data), updated.currency, updated.subtotal_cents,
              updated.discount_cents, updated.tax_cents, updated.total_cents, updated.id, updated.business_profile_id,
            ],
          );

          await db.query(
            `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2)`,
            [receipt.id, JSON.stringify({ convertedFrom: updated.id })],
          );
          await db.query(
            `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'converted', $2)`,
            [updated.id, JSON.stringify({ convertedTo: receipt.id, targetType: 'receipt' })],
          );

          // 2. Record revenue event to automatically update financial stats
          await db.query(
            `INSERT INTO revenue_events
               (user_id, conversation_id, contact_id, event_type, amount_cents, currency,
                description, attributed_to_ai)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              userId,
              updated.conversation_id || null,
              updated.contact_id || null,
              'invoice_payment',
              updated.total_cents,
              updated.currency || 'USD',
              `Invoice ${updated.document_number} marked paid (Receipt ${receiptNumber} generated)`,
              updated.ai_generated || false,
            ],
          ).catch(() => {});
        } catch (err) {
          fastify.log.error('Failed to automatically generate receipt/revenue event: ' + err);
        }
      }

      // Business Feed (docs/PLATFORM_POLISH_PLAN.md §7.2) — a payment-posted
      // event for every paid invoice, plus a milestone-counter-crossing
      // event ("the Nth invoice paid") when the running count hits a round
      // number. Both best-effort — a feed write should never block the
      // status update that already succeeded.
      await recordBusinessEvent(userId, 'payment_posted', {
        contactId: updated.contact_id,
        evidence: [`Invoice ${updated.document_number} marked paid (${(updated.total_cents / 100).toFixed(2)} ${updated.currency})`],
        payload: { documentId: updated.id, totalCents: updated.total_cents, currency: updated.currency },
      }).catch(() => {});

      const { rows: [{ n: paidCount }] } = await db.query<{ n: string }>(
        `SELECT COUNT(*)::int AS n FROM documents WHERE user_id = $1 AND document_type = 'invoice' AND status = 'paid'`,
        [userId],
      );
      const milestone = checkMilestoneCrossing(parseInt(paidCount, 10));
      if (milestone) {
        await recordBusinessEvent(userId, 'milestone_invoice_paid', {
          evidence: [`${milestone}th invoice paid`], payload: { count: milestone },
        }).catch(() => {});
      }
    }

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

    const documentNumber = await assignDocumentNumber(userId, targetType, source.business_profile_id);
    const title = `${targetType[0].toUpperCase()}${targetType.slice(1)} ${documentNumber}`;

    const { rows: [created] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          source_document_id, requested_by, ai_generated, business_profile_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17,'user',false,$18)
       RETURNING *`,
      [
        userId, source.contact_id, source.deal_id, source.opportunity_id, source.conversation_id,
        source.template_id, targetType, source.document_category, documentNumber, title,
        JSON.stringify(source.structured_data), source.currency, source.subtotal_cents,
        source.discount_cents, source.tax_cents, source.total_cents, source.id, source.business_profile_id,
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
      ...(existing.structured_data || {}),
      ...(body.structuredData || {}),
      items: computedItems,
      notes: body.notes ?? existing.structured_data?.notes ?? null,
      terms: body.terms ?? existing.structured_data?.terms ?? null,
      validUntil: body.validUntil ?? existing.structured_data?.validUntil ?? null,
      dueDate: body.dueDate ?? existing.structured_data?.dueDate ?? null,
      sections: body.sections ?? body.structuredData?.sections ?? existing.structured_data?.sections ?? [],
    };

    const newVersion = existing.version + 1;
    const documentNumber = `${existing.document_number}-v${newVersion}`;

    const { rows: [created] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          version, source_document_id, requested_by, ai_generated, business_profile_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17,$18,'user',false,$19)
       RETURNING *`,
      [
        userId, existing.contact_id, existing.deal_id, existing.opportunity_id, existing.conversation_id,
        existing.template_id, existing.document_type, existing.document_category, documentNumber, existing.title,
        JSON.stringify(structuredData), body.currency ?? existing.currency, subtotalCents, discountCents,
        taxCents, totalCents, newVersion, existing.id, existing.business_profile_id,
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

    const result = await sendDocumentViaWhatsApp(userId, id, caption);
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return reply.send({ ok: true, conversationId: result.conversationId });
  });

  // ── AI Document Assistant (plan §12/§15 Phase 3) — per-document chat.
  fastify.get('/api/documents/:id/chat', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows } = await db.query(
      'SELECT role, content, created_at FROM document_chat_messages WHERE document_id = $1 ORDER BY created_at ASC',
      [id],
    );
    return reply.send({
      messages: rows.map((r: any) => ({ role: r.role, content: r.content, createdAt: r.created_at })),
    });
  });

  fastify.post('/api/documents/:id/chat', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { instruction } = z.object({ instruction: z.string().min(1).max(2000) }).parse(request.body);

    const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: historyRows } = await db.query(
      'SELECT role, content FROM document_chat_messages WHERE document_id = $1 ORDER BY created_at ASC LIMIT 20',
      [id],
    );

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId, instruction,
          history: historyRows.map((r: any) => ({ role: r.role, content: r.content })),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        fastify.log.error({ errText }, 'document_chat_failed');
        return reply.code(502).send({ error: 'Failed to process instruction' });
      }
      const data = await res.json() as { reply: string; structuredData: unknown; totalCents: number };

      await db.query(
        `INSERT INTO document_chat_messages (document_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
        [id, instruction, data.reply],
      );

      return reply.send({ reply: data.reply, totalCents: data.totalCents });
    } catch (err) {
      fastify.log.error({ err }, 'document_chat_error');
      return reply.code(502).send({ error: 'Failed to process instruction' });
    }
  });

  // A never-sent draft has no external side effects (no customer has seen
  // it, no WhatsApp message was sent), so it's safe to permanently remove —
  // every FK referencing documents(id) is CASCADE/SET NULL (confirmed via
  // migration grep), so nothing else needs manual cleanup beyond the PDF
  // file on disk. Anything already generated/sent/paid is a real record —
  // keep the existing soft-archive behavior for those, same as before.
  fastify.delete('/api/documents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { rows: [existing] } = await db.query(
      'SELECT id, status, storage_path FROM documents WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!existing) return reply.code(404).send({ error: 'Document not found' });

    if (existing.status === 'draft') {
      await db.query('DELETE FROM documents WHERE id = $1', [id]);
      if (existing.storage_path) {
        await fs.unlink(existing.storage_path).catch(() => { /* already missing — fine */ });
      }
      return reply.send({ ok: true, deleted: true });
    }

    await db.query(`UPDATE documents SET status = 'archived', updated_at = NOW() WHERE id = $1`, [id]);
    return reply.send({ ok: true, deleted: false });
  });

  // ── GET /api/documents/shared/:token — view tracking (plan §15 Phase 4).
  // Intentionally NOT behind `authenticate`: the token itself is the auth
  // (a random UUID, never the numeric document id), same trust model as
  // every invoicing-SaaS "view your invoice" link. Only serves the PDF —
  // no other document/contact data is exposed through this route.
  fastify.get('/api/documents/shared/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rows: [doc] } = await db.query(
      'SELECT id, storage_path, document_number, status FROM documents WHERE share_token = $1', [token],
    );
    if (!doc?.storage_path) return reply.code(404).send({ error: 'Document not found' });

    const shouldMarkViewed = doc.status === 'generated' || doc.status === 'sent';
    if (shouldMarkViewed) {
      await db.query(
        `UPDATE documents SET view_count = view_count + 1, viewed_at = COALESCE(viewed_at, NOW()),
           status = 'viewed', updated_at = NOW() WHERE id = $1`,
        [doc.id],
      );
    } else {
      await db.query(
        `UPDATE documents SET view_count = view_count + 1, viewed_at = COALESCE(viewed_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [doc.id],
      );
    }
    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'viewed', '{}')`,
      [doc.id],
    );

    try {
      const buf = await fs.readFile(doc.storage_path);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="${doc.document_number}.pdf"`);
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'PDF file missing on disk' });
    }
  });

  // ── POST /api/documents/shares/:token/accept — Phase 2 Public Quote Acceptance
  fastify.post('/api/documents/shares/:token/accept', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rows: [doc] } = await db.query(
      `SELECT d.*, c.phone_number, c.custom_name, c.display_name, c.whatsapp_jid
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.share_token = $1`,
      [token],
    );

    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    await db.query(`UPDATE documents SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [doc.id]);
    await db.query(`INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'accepted', '{}')`, [doc.id]);

    let createdInvoice = null;
    let invoiceShareToken = '';

    if (doc.document_type === 'quotation') {
      const invoiceNumber = await assignDocumentNumber(doc.user_id, 'invoice', doc.business_profile_id);
      const invoiceTitle = `Invoice ${invoiceNumber}`;

      const { rows: [invoice] } = await db.query(
        `INSERT INTO documents
           (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
            document_type, document_category, document_number, title, status, structured_data,
            currency, subtotal_cents, discount_cents, tax_cents, total_cents,
            source_document_id, requested_by, ai_generated, business_profile_id)
         VALUES ($1,$2,$3,$4,$5,$6,'invoice','sales',$7,$8,'sent',$9,$10,$11,$12,$13,$14,$15,'system',false,$16)
         RETURNING *`,
        [
          doc.user_id, doc.contact_id, doc.deal_id, doc.opportunity_id, doc.conversation_id,
          doc.template_id, invoiceNumber, invoiceTitle,
          JSON.stringify(doc.structured_data), doc.currency, doc.subtotal_cents,
          doc.discount_cents, doc.tax_cents, doc.total_cents, doc.id, doc.business_profile_id,
        ],
      );

      createdInvoice = invoice;

      try {
        await renderAndSaveDocument(invoice.id, doc.user_id);
      } catch (err) {
        fastify.log.warn({ err }, 'auto_invoice_render_failed');
      }

      const { rows: [share] } = await db.query(
        `INSERT INTO document_shares (document_id, created_by, is_active)
         VALUES ($1, $2, true) RETURNING share_token`,
        [invoice.id, doc.user_id],
      );
      invoiceShareToken = share?.share_token || '';

      const baseUrl = process.env.CORS_ORIGIN || 'https://zuri-personal-assistant-delta.vercel.app';
      const invoiceShareUrl = `${baseUrl}/shared/${invoiceShareToken}`;
      const recipientName = doc.custom_name || doc.display_name || 'there';
      const totalFmt = `${doc.currency || 'USD'} ${(Number(doc.total_cents || 0) / 100).toFixed(2)}`;
      const messageText = `Thank you ${recipientName} for accepting Quotation ${doc.document_number}!\n\nHere is your *INVOICE* (${invoiceNumber}) for *${totalFmt}*:\n\n📄 View or Pay Invoice here:\n${invoiceShareUrl}`;

      const waServiceUrl = process.env.WHATSAPP_SERVICE_URL || config.WHATSAPP_SERVICE_URL;
      const recipient = doc.whatsapp_jid || doc.phone_number || '';
      if (recipient) {
        try {
          await fetch(`${waServiceUrl}/api/whatsapp/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': config.INTERNAL_API_SECRET || '' },
            body: JSON.stringify({ userId: doc.user_id, recipient, message: messageText }),
          });
        } catch (err) {
          fastify.log.error({ err }, 'auto_invoice_whatsapp_dispatch_failed');
        }
      }
    }

    return reply.send({
      ok: true,
      status: 'accepted',
      invoice: createdInvoice ? formatDocument(createdInvoice) : null,
      invoiceShareToken,
    });
  });

  // ── POST /api/documents/shares/:token/pay — Phase 2 Public Payment Completion
  fastify.post('/api/documents/shares/:token/pay', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rows: [doc] } = await db.query(
      `SELECT d.*, c.phone_number, c.custom_name, c.display_name, c.whatsapp_jid
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.share_token = $1`,
      [token],
    );

    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    await db.query(`UPDATE documents SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`, [doc.id]);
    await db.query(`INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'paid', '{}')`, [doc.id]);

    const structItems = doc.structured_data?.items || [];
    for (const item of structItems) {
      if (item.productId) {
        const qty = Math.max(1, parseInt(String(item.quantity || 1), 10));
        await db.query(
          `UPDATE products SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - $1), updated_at = NOW() WHERE id = $2 AND user_id = $3`,
          [qty, item.productId, doc.user_id],
        ).catch(() => {});
      }
    }

    const receiptNumber = await assignDocumentNumber(doc.user_id, 'receipt', doc.business_profile_id);
    const receiptTitle = `Receipt ${receiptNumber}`;

    const { rows: [receipt] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          source_document_id, requested_by, ai_generated, business_profile_id, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,'receipt',$7,$8,$9,'paid',$10,$11,$12,$13,$14,$15,$16,'system',false,$17,NOW())
       RETURNING *`,
      [
        doc.user_id, doc.contact_id, doc.deal_id, doc.opportunity_id, doc.conversation_id,
        doc.template_id, doc.document_category, receiptNumber, receiptTitle,
        JSON.stringify(doc.structured_data), doc.currency, doc.subtotal_cents,
        doc.discount_cents, doc.tax_cents, doc.total_cents, doc.id, doc.business_profile_id,
      ],
    );

    try {
      await renderAndSaveDocument(receipt.id, doc.user_id);
    } catch (err) {
      fastify.log.warn({ err }, 'auto_receipt_render_failed');
    }

    const { rows: [receiptShare] } = await db.query(
      `INSERT INTO document_shares (document_id, created_by, is_active)
       VALUES ($1, $2, true) RETURNING share_token`,
      [receipt.id, doc.user_id],
    );

    const baseUrl = process.env.CORS_ORIGIN || 'https://zuri-personal-assistant-delta.vercel.app';
    const receiptShareUrl = `${baseUrl}/shared/${receiptShare?.share_token || ''}`;
    const recipientName = doc.custom_name || doc.display_name || 'there';
    const totalFmt = `${doc.currency || 'USD'} ${(Number(doc.total_cents || 0) / 100).toFixed(2)}`;
    const messageText = `Payment received! Thank you ${recipientName}.\n\nHere is your official *PAYMENT RECEIPT* (${receiptNumber}) for *${totalFmt}*:\n\n📄 View or Download Receipt:\n${receiptShareUrl}`;

    const waServiceUrl = process.env.WHATSAPP_SERVICE_URL || config.WHATSAPP_SERVICE_URL;
    const recipient = doc.whatsapp_jid || doc.phone_number || '';
    if (recipient) {
      try {
        await fetch(`${waServiceUrl}/api/whatsapp/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': config.INTERNAL_API_SECRET || '' },
          body: JSON.stringify({ userId: doc.user_id, recipient, message: messageText }),
        });
      } catch (err) {
        fastify.log.error({ err }, 'auto_receipt_whatsapp_dispatch_failed');
      }
    }

    return reply.send({
      ok: true,
      status: 'paid',
      receipt: formatDocument(receipt),
      receiptShareUrl,
    });
  });

  // ── GET /api/documents/search — semantic search (plan §15 Phase 4).
  fastify.get('/api/documents/search', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { q } = z.object({ q: z.string().min(1).max(500) }).parse(request.query);

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, query: q, limit: 10 }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Search failed' });
      const data = await res.json() as {
        results: { id: string; title: string; document_type: string; document_number: string; status: string; contact_name: string | null; score: number | null }[];
      };
      return reply.send({
        results: data.results.map(r => ({
          id: r.id, title: r.title, documentType: r.document_type, documentNumber: r.document_number,
          status: r.status, contactName: r.contact_name, score: r.score,
        })),
      });
    } catch (err) {
      fastify.log.error({ err }, 'document_search_error');
      return reply.code(502).send({ error: 'Search failed' });
    }
  });

  // ── POST /api/documents/insights — AI Compares Documents (plan §8/§15
  // Phase 4). Aggregated stats in, grounded suggestions out.
  fastify.post('/api/documents/insights', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Failed to generate insights' });
      const data = await res.json() as { insights: string[] };
      return reply.send(data);
    } catch (err) {
      fastify.log.error({ err }, 'document_insights_error');
      return reply.code(502).send({ error: 'Failed to generate insights' });
    }
  });

  // ── POST /api/documents/packs/:packKey/run — Automatic Business Packs
  // (plan §13/§15 Phase 4). Pack definitions live in the intelligence
  // service as code constants, not here — this route is a thin proxy.
  fastify.post('/api/documents/packs/:packKey/run', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { packKey } = request.params as { packKey: string };
    const { contactId, instruction } = z.object({
      contactId: z.string().uuid(),
      instruction: z.string().max(2000).optional(),
    }).parse(request.body);

    const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
    try {
      const res = await fetch(`${intelligenceUrl}/internal/documents/packs/${packKey}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, contact_id: contactId, instruction: instruction ?? '' }),
      });
      if (!res.ok) {
        const errText = await res.text();
        fastify.log.error({ errText }, 'document_pack_run_failed');
        return reply.code(res.status === 400 ? 400 : 502).send({ error: 'Failed to run pack' });
      }
      const data = await res.json() as { packKey: string; documentIds: string[] };
      return reply.code(201).send(data);
    } catch (err) {
      fastify.log.error({ err }, 'document_pack_run_error');
      return reply.code(502).send({ error: 'Failed to run pack' });
    }
  });

  // ── GET /api/documents/public/:token/details — Interactive web page data
  fastify.get('/api/documents/public/:token/details', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rows: [doc] } = await db.query(
      `SELECT d.*, c.display_name as contact_name, c.company as contact_company, c.email as contact_email, c.phone_number as contact_phone
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.share_token = $1`,
      [token]
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: [bp] } = await db.query(
      `SELECT company_name, logo_storage_path, address, phone, email, website, tax_id, bank_details, theme_color
       FROM business_profiles WHERE user_id = $1 LIMIT 1`,
      [doc.user_id]
    );

    const { rows: signatures } = await db.query(
      `SELECT id, signer_name, signer_email, signer_role, signature_type, signature_data, verification_code, document_hash, signed_at
       FROM document_signatures WHERE document_id = $1 ORDER BY signed_at ASC`,
      [doc.id]
    );

    await db.query(
      `UPDATE documents SET view_count = view_count + 1, viewed_at = COALESCE(viewed_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [doc.id]
    );

    return reply.send({
      id: doc.id,
      title: doc.title,
      documentNumber: doc.document_number,
      documentType: doc.document_type,
      status: doc.status,
      currency: doc.currency,
      subtotalCents: doc.subtotal_cents,
      discountCents: doc.discount_cents,
      taxCents: doc.tax_cents,
      totalCents: doc.total_cents,
      structuredData: doc.structured_data,
      expiresAt: doc.expires_at,
      createdAt: doc.created_at,
      business: bp || null,
      contact: {
        name: doc.contact_name || doc.structured_data?.manualContact?.name || null,
        company: doc.contact_company || doc.structured_data?.manualContact?.company || null,
        email: doc.contact_email || doc.structured_data?.manualContact?.email || null,
        phone: doc.contact_phone || doc.structured_data?.manualContact?.phone || null,
      },
      signatures,
    });
  });

  // ── POST /api/documents/public/:token/sign — E-Signature Submission
  fastify.post('/api/documents/public/:token/sign', async (request, reply) => {
    const { token } = request.params as { token: string };
    const bodySchema = z.object({
      signerName: z.string().min(1).max(255),
      signerEmail: z.string().email().optional().or(z.literal('')),
      signatureType: z.enum(['draw', 'type', 'upload']),
      signatureData: z.string().min(1),
    });

    const parsed = bodySchema.parse(request.body);

    const { rows: [doc] } = await db.query(
      `SELECT id, user_id, document_number, total_cents, created_at, status FROM documents WHERE share_token = $1`,
      [token]
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const crypto = await import('crypto');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const verificationCode = `VER-${randomHex}`;

    const hashInput = `${doc.id}:${doc.document_number}:${doc.total_cents}:${doc.created_at}`;
    const documentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.ip || '127.0.0.1';
    const userAgent = (request.headers['user-agent'] as string) || 'Browser';

    const { rows: [sig] } = await db.query(
      `INSERT INTO document_signatures
         (document_id, signer_name, signer_email, signature_type, signature_data, ip_address, user_agent, verification_code, document_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [doc.id, parsed.signerName, parsed.signerEmail || null, parsed.signatureType, parsed.signatureData, ipAddress, userAgent, verificationCode, documentHash]
    );

    await db.query(
      `UPDATE documents SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [doc.id]
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'signed', $2)`,
      [doc.id, JSON.stringify({ signerName: parsed.signerName, verificationCode, signatureId: sig.id })]
    );

    try {
      await renderAndSaveDocument(doc.id, doc.user_id);
    } catch (err) {
      fastify.log.error({ err }, 'failed_rerender_pdf_after_signature');
    }

    return reply.send({
      success: true,
      verificationCode,
      documentHash,
      signedAt: sig.signed_at,
    });
  });

  // ── GET /api/documents/analytics/summary — Financial & Engagement Analytics
  fastify.get('/api/documents/analytics/summary', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows: [quoteStats] } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE document_type IN ('quotation', 'proposal', 'estimate')) as total_quotes,
         COUNT(*) FILTER (WHERE document_type IN ('quotation', 'proposal', 'estimate') AND status IN ('accepted', 'paid')) as closed_quotes
       FROM documents
       WHERE user_id = $1`,
      [userId]
    );

    const totalQuotes = parseInt(quoteStats?.total_quotes || '0', 10);
    const closedQuotes = parseInt(quoteStats?.closed_quotes || '0', 10);
    const conversionRate = totalQuotes > 0 ? Math.round((closedQuotes / totalQuotes) * 100) : 0;

    const { rows: unpaidDocs } = await db.query(
      `SELECT total_cents, due_date, status, created_at
       FROM documents
       WHERE user_id = $1 AND document_type = 'invoice' AND status NOT IN ('paid', 'cancelled', 'draft')`,
      [userId]
    );

    const now = new Date();
    let currentCents = 0;
    let days1To30Cents = 0;
    let days31To60Cents = 0;
    let days60PlusCents = 0;

    for (const doc of unpaidDocs) {
      const cents = doc.total_cents || 0;
      const dueDate = doc.due_date ? new Date(doc.due_date) : new Date(doc.created_at);
      const diffTime = now.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

      if (diffDays <= 0) {
        currentCents += cents;
      } else if (diffDays <= 30) {
        days1To30Cents += cents;
      } else if (diffDays <= 60) {
        days31To60Cents += cents;
      } else {
        days60PlusCents += cents;
      }
    }

    const { rows: [paymentStats] } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) as avg_days
       FROM documents
       WHERE user_id = $1 AND document_type = 'invoice' AND status = 'paid'`,
      [userId]
    );
    const avgDaysToPayment = paymentStats?.avg_days ? Math.round(parseFloat(paymentStats.avg_days) * 10) / 10 : 0;

    const { rows: engagementFeed } = await db.query(
      `SELECT e.id, e.event_type, e.occurred_at, e.metadata, d.title, d.document_number, d.share_token, c.display_name as contact_name
       FROM document_events e
       JOIN documents d ON d.id = e.document_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.user_id = $1
       ORDER BY e.occurred_at DESC LIMIT 30`,
      [userId]
    );

    return reply.send({
      conversionRate,
      totalQuotes,
      closedQuotes,
      receivablesAging: {
        currentCents,
        days1To30Cents,
        days31To60Cents,
        days60PlusCents,
        totalOutstandingCents: currentCents + days1To30Cents + days31To60Cents + days60PlusCents,
      },
      avgDaysToPayment,
      engagementFeed,
    });
  });

  // ── GET /api/documents/:id/analytics — Single Document Engagement
  fastify.get('/api/documents/:id/analytics', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [doc] } = await db.query(
      `SELECT id, title, document_number, view_count, viewed_at, status, created_at FROM documents WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: events } = await db.query(
      `SELECT id, event_type, occurred_at, metadata FROM document_events WHERE document_id = $1 ORDER BY occurred_at DESC`,
      [id]
    );

    return reply.send({
      document: doc,
      events,
    });
  });

  // ── POST /api/documents/public/:token/action — Accept Quote or Request Changes
  fastify.post('/api/documents/public/:token/action', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { action, reason } = z.object({
      action: z.enum(['accept', 'request_changes']),
      reason: z.string().max(2000).optional(),
    }).parse(request.body);

    const { rows: [doc] } = await db.query(
      `SELECT id, user_id, document_number, title, status FROM documents WHERE share_token = $1`,
      [token]
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const newStatus = action === 'accept' ? 'accepted' : 'revision_requested';
    await db.query(
      `UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, doc.id]
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, $2, $3)`,
      [doc.id, action === 'accept' ? 'accepted' : 'revision_requested', JSON.stringify({ reason: reason || null })]
    );

    return reply.send({ success: true, status: newStatus });
  });

  // ── GET & POST /api/documents/public/:token/comments — Line Item Feedback
  fastify.get('/api/documents/public/:token/comments', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rows: [doc] } = await db.query(`SELECT id FROM documents WHERE share_token = $1`, [token]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: comments } = await db.query(
      `SELECT id, item_index, commenter_name, comment_text, created_at
       FROM document_comments WHERE document_id = $1 ORDER BY created_at ASC`,
      [doc.id]
    );

    return reply.send({ comments });
  });

  fastify.post('/api/documents/public/:token/comments', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { itemIndex, commenterName, commentText } = z.object({
      itemIndex: z.number().int().min(0).optional().nullable(),
      commenterName: z.string().min(1).max(255),
      commentText: z.string().min(1).max(2000),
    }).parse(request.body);

    const { rows: [doc] } = await db.query(`SELECT id FROM documents WHERE share_token = $1`, [token]);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { rows: [comment] } = await db.query(
      `INSERT INTO document_comments (document_id, item_index, commenter_name, comment_text)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [doc.id, itemIndex ?? null, commenterName, commentText]
    );

    return reply.send({ comment });
  });

  // ── POST /api/documents/public/:token/pay — One-Click Mobile Money & Auto-Receipt
  fastify.post('/api/documents/public/:token/pay', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { paymentMethod, phoneNumber, reference } = z.object({
      paymentMethod: z.enum(['mtn_momo', 'airtel_money', 'bank_transfer']),
      phoneNumber: z.string().max(50).optional(),
      reference: z.string().max(255).optional(),
    }).parse(request.body);

    const { rows: [doc] } = await db.query(
      `SELECT * FROM documents WHERE share_token = $1`,
      [token]
    );
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const crypto = await import('crypto');
    const paymentRef = reference || `PAY-${paymentMethod.toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await db.query(
      `UPDATE documents
       SET status = 'paid', payment_method = $1, payment_reference = $2, paid_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [paymentMethod, paymentRef, doc.id]
    );

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'paid', $2)`,
      [doc.id, JSON.stringify({ paymentMethod, paymentRef, phoneNumber: phoneNumber || null })]
    );

    const receiptNumber = await assignDocumentNumber(doc.user_id, 'receipt', doc.business_profile_id);
    const receiptTitle = `Receipt ${receiptNumber}`;

    const { rows: [receipt] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, deal_id, opportunity_id, conversation_id, template_id,
          document_type, document_category, document_number, title, status, structured_data,
          currency, subtotal_cents, discount_cents, tax_cents, total_cents,
          source_document_id, requested_by, ai_generated, business_profile_id,
          payment_method, payment_reference, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,'receipt','financial',$7,$8,'paid',$9,$10,$11,$12,$13,$14,$15,'system',false,$16,$17,$18,NOW())
       RETURNING *`,
      [
        doc.user_id, doc.contact_id, doc.deal_id, doc.opportunity_id, doc.conversation_id, doc.template_id,
        receiptNumber, receiptTitle, doc.structured_data,
        doc.currency, doc.subtotal_cents, doc.discount_cents, doc.tax_cents, doc.total_cents,
        doc.id, doc.business_profile_id, paymentMethod, paymentRef
      ]
    );

    try {
      await renderAndSaveDocument(receipt.id, doc.user_id);
    } catch (err) {
      fastify.log.error({ err }, 'failed_render_auto_receipt');
    }

    return reply.send({
      success: true,
      paymentReference: paymentRef,
      receiptNumber: receipt.document_number,
      receiptShareToken: receipt.share_token,
    });
  });
}
