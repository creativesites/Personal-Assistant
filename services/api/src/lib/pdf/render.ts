import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReactElement } from 'react';
import { config } from '../../config';
import { buildBusinessContext, buildDocumentContext } from './context';
import type { BusinessProfileRow, ContactRow, DocumentRow } from './context';
import Minimal from './templates/Minimal';
import Modern from './templates/Modern';
import Resume from './templates/Resume';
import CoverLetter from './templates/CoverLetter';
import CvModern from './templates/CvModern';
import CvExecutive from './templates/CvExecutive';
import CvCreative from './templates/CvCreative';
import { buildCvRenderData } from './cv-context';

// Node/@react-pdf/renderer port of services/intelligence/app/services/
// document_renderer.py's render_document_pdf()/storage_path_for() — AI/
// business logic never touches layout, everything visual lives in one of
// these two components, picked by layout_key exactly like the Jinja
// templates were before this migration.
const TEMPLATES: Record<string, (props: any) => ReactElement> = {
  minimal: Minimal,
  modern: Modern,
};

export async function renderDocumentPdf(
  document: DocumentRow,
  businessProfile: BusinessProfileRow | null,
  contact: ContactRow | null,
  layoutKey: string,
): Promise<Buffer> {
  const Template = TEMPLATES[layoutKey] ?? Minimal;

  const business = await buildBusinessContext(businessProfile);
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
