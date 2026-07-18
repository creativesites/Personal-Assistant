// Canonical shape of the data every business-document template renders
// from. services/api's context.ts builds these from the database
// (Node-only: reads business_profiles/documents/contacts rows, embeds
// logo/signature/stamp as data: URIs) and imports the type names from
// here rather than redefining them, so there's exactly one definition.
// See docs/PDF_TEMPLATE_GUIDE.md for the full field-by-field reference.

export interface BusinessContext {
  companyName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  themeColor: string;
  accentColor: string;
  footerText: string | null;
  paymentInstructions: string | null;
  bankDetails: string | null;
  mobileMoney: string | null;
  logoDataUri: string | null;
  signatureDataUri: string | null;
  stampDataUri: string | null;
}

export interface DocumentContext {
  documentType: string;
  documentNumber: string;
  title: string;
  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;
  lineItems: { description: string; quantity: number; unitPrice: string; discountLabel: string; lineTotal: string }[];
  hasItems: boolean;
  hasDiscounts: boolean;
  subtotal: string;
  discount: string | null;
  tax: string | null;
  total: string;
  notes: string | null;
  terms: string | null;
  sections: { heading: string; body: string }[];
}

export interface ContactContext {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export interface TemplateProps {
  document: DocumentContext;
  business: BusinessContext;
  contact: ContactContext;
}
