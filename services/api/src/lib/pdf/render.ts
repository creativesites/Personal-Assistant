import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReactElement } from 'react';
import { config } from '../../config';
import { buildBusinessContext, buildDocumentContext } from './context';
import type { BusinessProfileRow, ContactRow, DocumentRow } from './context';
import {
  BUSINESS_TEMPLATES, Minimal, Resume, CoverLetter, ReferenceSheet, PortfolioPdf,
  CvModern, CvExecutive, CvCreative,
} from '@zuri/pdf-templates';
import { buildCvRenderData } from './cv-context';

// Templates themselves now live in the shared @zuri/pdf-templates package
// (see docs/PDF_TEMPLATE_GUIDE.md) so the exact same components render
// server-side here (headless flows: WhatsApp auto-send, scheduled/recurring
// documents, agent-drafted documents, Business Packs — see CLAUDE.md's "PDF
// Rendering Architecture" section for why those specifically stay
// server-rendered) and client-side in apps/web (everything a user is
// actively looking at). AI/business logic never touches layout — it only
// ever picks a template by layout_key/template_key.
const TEMPLATES: Record<string, (props: any) => ReactElement> = BUSINESS_TEMPLATES as any;

export async function renderDocumentPdf(
  document: DocumentRow,
  businessProfile: BusinessProfileRow | null,
  contact: ContactRow | null,
  layoutKey: string,
): Promise<Buffer> {
  const Template = TEMPLATES[layoutKey] ?? Minimal;

  const business = await buildBusinessContext(businessProfile, document.signature_id);
  const { document: documentContext, contact: contactContext } = buildDocumentContext(document, contact);

  const element = Template({ document: documentContext, business, contact: contactContext }) as any;
  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element);
}

// Career & Growth Engine Phase 3 (docs/CAREER_GROWTH_ENGINE_PLAN.md §8) —
// resume/cover_letter documents have no business/contact — they're about
// the user themselves — so these bypass buildBusinessContext/
// buildDocumentContext entirely rather than force-fitting that shape.
export async function renderResumePdf(
  structuredData: Record<string, any>, fullName: string, contactLine: string,
): Promise<Buffer> {
  const element = Resume({
    fullName,
    headline: structuredData.headline,
    summary: structuredData.summary,
    contactLine,
    experience: structuredData.experience ?? [],
    education: structuredData.education ?? [],
    skills: structuredData.skills ?? [],
    certifications: structuredData.certifications ?? [],
    languages: structuredData.languages ?? [],
  }) as any;
  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element);
}

export async function renderCoverLetterPdf(
  structuredData: Record<string, any>, fullName: string, contactLine: string,
): Promise<Buffer> {
  const element = CoverLetter({
    fullName,
    contactLine,
    date: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
    recipientName: structuredData.recipientName ?? null,
    companyName: structuredData.companyName ?? null,
    body: structuredData.body ?? '',
    signOff: structuredData.signOff ?? `Sincerely,\n${fullName}`,
  }) as any;
  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element);
}

// CV Studio Phase 9 (docs/CV_STUDIO_PLAN.md §13) — Supporting Documents.
// reference_sheet/portfolio_pdf each get their own plain template (a rendered
// view of career_references / portfolio-visible projects); the four
// letter-shaped types (cover_letter and its Phase 9 siblings
// application_letter/expression_of_interest/personal_statement/
// motivation_letter) all reuse renderCoverLetterPdf verbatim — they share
// the exact same {recipientName, companyName, body, signOff} shape, so a
// second near-identical template would be pure duplication.
export async function renderReferenceSheetPdf(
  structuredData: Record<string, any>, fullName: string, contactLine: string,
): Promise<Buffer> {
  const element = ReferenceSheet({ fullName, contactLine, references: structuredData.references ?? [] }) as any;
  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element);
}

export async function renderPortfolioPdf(
  structuredData: Record<string, any>, fullName: string, contactLine: string,
): Promise<Buffer> {
  const element = PortfolioPdf({ fullName, contactLine, projects: structuredData.projects ?? [] }) as any;
  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element);
}

// CV Studio Phase 5 (docs/CV_STUDIO_PLAN.md §5) — the four CV templates,
// picked by career_cvs.template_key. "professional" reuses the existing
// Resume component verbatim (it becomes the base for Professional per the
// plan's own §1); the other three are new siblings sharing the same
// CvRenderData shape from cv-context.ts.
export async function renderCvPdf(cvId: string, userId: string): Promise<Buffer | null> {
  const data = await buildCvRenderData(cvId, userId);
  if (!data) return null;

  const props = {
    fullName: data.fullName, headline: data.headline, summary: data.summary, contactLine: data.contactLine,
    pageSize: data.pageSize, experience: data.experience, education: data.education,
    skillGroups: data.skillGroups, skills: data.skills, certifications: data.certifications,
    projects: data.projects, awards: data.awards, volunteer: data.volunteer, memberships: data.memberships,
    publications: data.publications, referencesMode: data.referencesMode, references: data.references,
  };

  const element = data.templateKey === 'modern' ? CvModern(props as any)
    : data.templateKey === 'executive' ? CvExecutive(props as any)
    : data.templateKey === 'creative' ? CvCreative(props as any)
    : Resume(props as any);

  const { renderToBuffer } = await import('@react-pdf/renderer') as any;
  return renderToBuffer(element as any);
}

export async function storagePathFor(userId: string, documentId: string): Promise<string> {
  const dir = path.join(config.DOC_STORAGE_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${documentId}.pdf`);
}
