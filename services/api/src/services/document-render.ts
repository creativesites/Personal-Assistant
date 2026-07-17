import * as fs from 'fs/promises';
import { db } from '../lib/db';
import { config } from '../config';
import { renderDocumentPdf, renderResumePdf, renderCoverLetterPdf, storagePathFor } from '../lib/pdf/render';
import type { BusinessProfileRow, ContactRow, DocumentRow } from '../lib/pdf/context';

export interface RenderResult {
  id: string;
  status: string;
  storagePath: string;
  aiSummary: string | null;
}

// Node/TS port of services/intelligence/app/services/document_generator.py's
// render_and_save() — the rendering-engine swap (Jinja2+Playwright -> this)
// changes nothing about how ai_summary/embedding are computed, since those
// are purely derived from structured_data text, never from the rendered PDF
// bytes. That computation stays in Python (it's where the AI client lives)
// and is triggered here as a fire-and-forget follow-up call so the PDF
// response doesn't wait on it — same non-blocking feel as before.
export async function renderAndSaveDocument(documentId: string, userId: string): Promise<RenderResult> {
  const { rows: [document] } = await db.query<DocumentRow & { id: string; status: string; template_id: string | null }>(
    'SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId],
  );
  if (!document) throw new NotFoundError('Document not found');

  if (document.document_type === 'resume' || document.document_type === 'cover_letter') {
    return renderAndSaveResumeOrCoverLetter(document, documentId, userId);
  }

  const { rows: [businessProfile] } = await db.query<BusinessProfileRow & { default_template_id: string | null }>(
    'SELECT * FROM business_profiles WHERE user_id = $1', [userId],
  );

  let contact: ContactRow | null = null;
  if ((document as any).contact_id) {
    const { rows: [contactRow] } = await db.query<ContactRow>(
      'SELECT custom_name, display_name, phone_number, company, email, whatsapp_jid FROM contacts WHERE id = $1',
      [(document as any).contact_id],
    );
    contact = contactRow ?? null;
  } else {
    // No linked contact — e.g. /documents/new's "enter client details
    // manually" path — fall back to the freeform contact stashed in
    // structured_data at creation time (see createBody's manualContact).
    const manual = document.structured_data?.manualContact as
      { name: string; company?: string; email?: string; phone?: string } | null | undefined;
    if (manual) {
      contact = {
        custom_name: manual.name,
        display_name: null,
        phone_number: manual.phone ?? null,
        company: manual.company ?? null,
        email: manual.email ?? null,
      };
    }
  }

  let layoutKey = 'minimal';
  const templateId = document.template_id ?? businessProfile?.default_template_id ?? null;
  if (templateId) {
    const { rows: [template] } = await db.query<{ layout_key: string }>(
      'SELECT layout_key FROM document_templates WHERE id = $1', [templateId],
    );
    if (template) layoutKey = template.layout_key;
  }

  const pdfBuffer = await renderDocumentPdf(document, businessProfile ?? null, contact, layoutKey);

  const storagePath = await storagePathFor(userId, documentId);
  await fs.writeFile(storagePath, pdfBuffer);

  const newStatus = document.status === 'draft' ? 'generated' : document.status;

  await db.query(
    `UPDATE documents SET storage_path = $1, status = $2, updated_at = NOW() WHERE id = $3`,
    [storagePath, newStatus, documentId],
  );
  await db.query(
    `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'generated', '{}')`,
    [documentId],
  );

  // Fire-and-forget — ai_summary/embedding are advisory metadata, not part
  // of what makes a PDF "generated"; don't make the caller wait on them.
  summarizeDocument(documentId, userId).catch(() => {});

  return { id: documentId, status: newStatus, storagePath, aiSummary: null };
}

// Career & Growth Engine Phase 3 — resume/cover_letter documents have no
// business/contact, only the user themselves, so this is a fully separate
// path from the business/contact-shaped renderAndSaveDocument above rather
// than threading nulls through buildBusinessContext/buildDocumentContext.
async function renderAndSaveResumeOrCoverLetter(
  document: DocumentRow & { id: string; status: string; document_type: string; structured_data: any },
  documentId: string, userId: string,
): Promise<RenderResult> {
  const { rows: [user] } = await db.query<{ full_name: string | null; email: string }>(
    'SELECT full_name, email FROM users WHERE id = $1', [userId],
  );
  const { rows: [careerProfile] } = await db.query<{ linkedin_url: string | null; github_url: string | null; country: string | null }>(
    'SELECT linkedin_url, github_url, country FROM career_profiles WHERE user_id = $1', [userId],
  );
  const fullName = user?.full_name || user?.email || 'Applicant';
  const contactLine = [user?.email, careerProfile?.country, careerProfile?.linkedin_url, careerProfile?.github_url]
    .filter(Boolean).join(' · ');

  const pdfBuffer = document.document_type === 'resume'
    ? await renderResumePdf(document.structured_data ?? {}, fullName, contactLine)
    : await renderCoverLetterPdf(document.structured_data ?? {}, fullName, contactLine);

  const storagePath = await storagePathFor(userId, documentId);
  await fs.writeFile(storagePath, pdfBuffer);

  const newStatus = document.status === 'draft' ? 'generated' : document.status;
  await db.query(
    `UPDATE documents SET storage_path = $1, status = $2, updated_at = NOW() WHERE id = $3`,
    [storagePath, newStatus, documentId],
  );
  await db.query(
    `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'generated', '{}')`,
    [documentId],
  );

  summarizeDocument(documentId, userId).catch(() => {});

  return { id: documentId, status: newStatus, storagePath, aiSummary: null };
}

async function summarizeDocument(documentId: string, userId: string): Promise<void> {
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL ?? config.INTELLIGENCE_SERVICE_URL;
  await fetch(`${intelligenceUrl}/internal/documents/${documentId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
}

export class NotFoundError extends Error {}
