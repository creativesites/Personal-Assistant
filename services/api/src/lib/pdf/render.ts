import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReactElement } from 'react';
import { config } from '../../config';
import { buildBusinessContext, buildDocumentContext } from './context';
import type { BusinessProfileRow, ContactRow, DocumentRow } from './context';
import Minimal from './templates/Minimal';
import Modern from './templates/Modern';

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

export async function storagePathFor(userId: string, documentId: string): Promise<string> {
  const dir = path.join(config.DOC_STORAGE_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${documentId}.pdf`);
}
