import type { BusinessContext, ContactContext, DocumentContext } from '../context';

export interface TemplateProps {
  document: DocumentContext;
  business: BusinessContext;
  contact: ContactContext;
}
