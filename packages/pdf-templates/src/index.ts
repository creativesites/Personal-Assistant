// @zuri/pdf-templates — the single canonical location for every Zuri
// document PDF layout (business documents + CV/career documents). Both
// services/api's server-side render pipeline (headless flows: WhatsApp
// auto-send, scheduled/recurring documents, agent-drafted documents,
// Business Packs) and apps/web's client-side renderer (everything a user
// is actively looking at) import templates from here — one copy, not two
// drifting forks. See docs/PDF_TEMPLATE_GUIDE.md for the format a new or
// edited template must follow (prop shapes, styling conventions, how to
// register it below).
//
// Every template is a plain @react-pdf/renderer component — Document/Page/
// View/Text/Image/StyleSheet only, no Node-only APIs (fs, path, etc.) and
// no data-fetching — so the exact same component renders identically
// whether `renderToBuffer()` is called in Node or `renderToBlob()`/
// `PDFDownloadLink` is used in a browser tab.

export type { TemplateProps, BusinessContext, DocumentContext, ContactContext } from './templates/types';

import Minimal from './templates/Minimal';
import Modern from './templates/Modern';
import Classic from './templates/Classic';
import Corporate from './templates/Corporate';
import Elegant from './templates/Elegant';
import Compact from './templates/Compact';
import Creative from './templates/Creative';
import Executive from './templates/Executive';

export { Minimal, Modern, Classic, Corporate, Elegant, Compact, Creative, Executive };

// Keyed by documents.template_id's layout_key / document_templates.layout_key.
export const BUSINESS_TEMPLATES = {
  minimal: Minimal,
  modern: Modern,
  classic: Classic,
  corporate: Corporate,
  elegant: Elegant,
  compact: Compact,
  creative: Creative,
  executive: Executive,
} as const;

export type BusinessTemplateKey = keyof typeof BUSINESS_TEMPLATES;

export { default as Resume } from './templates/Resume';
export { default as CvModern } from './templates/CvModern';
export { default as CvExecutive } from './templates/CvExecutive';
export { default as CvCreative } from './templates/CvCreative';
export { default as CoverLetter } from './templates/CoverLetter';
export { default as ReferenceSheet } from './templates/ReferenceSheet';
export { default as PortfolioPdf } from './templates/PortfolioPdf';

export type {
  ResumeProps, ResumeExperience, ResumeEducation, ResumeCertification, ResumeLanguage,
} from './templates/Resume';
export type { CvTemplateProps } from './templates/CvModern';
export type { CoverLetterProps } from './templates/CoverLetter';
export type { ReferenceSheetProps, ReferenceSheetReference } from './templates/ReferenceSheet';
export type { PortfolioPdfProps, PortfolioProject } from './templates/PortfolioPdf';

import Resume from './templates/Resume';
import CvModern from './templates/CvModern';
import CvExecutive from './templates/CvExecutive';
import CvCreative from './templates/CvCreative';

// Keyed by career_cvs.template_key. "professional" (the default) reuses
// Resume verbatim — see render.ts's/renderCvPdf's original comment on why.
export const CV_TEMPLATES = {
  professional: Resume,
  modern: CvModern,
  executive: CvExecutive,
  creative: CvCreative,
} as const;

export type CvTemplateKey = keyof typeof CV_TEMPLATES;
