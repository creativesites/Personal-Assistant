import * as fs from 'fs/promises';
import * as path from 'path';
import type { BusinessContext, DocumentContext, ContactContext } from '@zuri/pdf-templates';

// Node-side port of services/intelligence/app/services/document_renderer.py's
// format_money()/_file_to_data_uri()/build_business_context()/
// build_document_context() — same field names/fallbacks, kept as a direct
// diff-able port so the two implementations don't silently drift in intent
// even though the Python originals are being deleted.
//
// BusinessContext/DocumentContext/ContactContext themselves now live in
// @zuri/pdf-templates (the shared template package) — this file only owns
// the Node-only DB-row shapes and the async builders that assemble those
// shared shapes from a database row (including embedding logo/signature/
// stamp images as data: URIs, which only makes sense server-side).

const CURRENCY_SYMBOLS: Record<string, string> = {
  ZMW: 'K', USD: '$', GBP: '£', EUR: '€', KES: 'KSh', BWP: 'P', NAD: 'N$',
};

export function formatMoney(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function fileToDataUri(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const buf = await fs.readFile(storagePath);
    const ext = path.extname(storagePath).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export interface BusinessProfileRow {
  company_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_id: string | null;
  theme_color: string | null;
  accent_color: string | null;
  footer_text: string | null;
  payment_instructions: string | null;
  bank_details: { bankName?: string; accountName?: string; accountNumber?: string } | null;
  mobile_money: { provider?: string; number?: string } | null;
  logo_storage_path: string | null;
  signature_storage_path: string | null;
  stamp_storage_path: string | null;
}

export async function buildBusinessContext(businessProfile: BusinessProfileRow | null): Promise<BusinessContext> {
  const bank = businessProfile?.bank_details ?? {};
  const mobileMoney = businessProfile?.mobile_money ?? {};
  const bankLine = [bank.bankName, bank.accountName, bank.accountNumber].filter(Boolean).join(', ');
  const mobileMoneyLine = [mobileMoney.provider, mobileMoney.number].filter(Boolean).join(', ');

  return {
    companyName: businessProfile?.company_name ?? null,
    address: businessProfile?.address ?? null,
    phone: businessProfile?.phone ?? null,
    email: businessProfile?.email ?? null,
    website: businessProfile?.website ?? null,
    taxId: businessProfile?.tax_id ?? null,
    themeColor: businessProfile?.theme_color || '#4F46E5',
    accentColor: businessProfile?.accent_color || '#818CF8',
    footerText: businessProfile?.footer_text ?? null,
    paymentInstructions: businessProfile?.payment_instructions ?? null,
    bankDetails: bankLine || null,
    mobileMoney: mobileMoneyLine || null,
    logoDataUri: await fileToDataUri(businessProfile?.logo_storage_path),
    signatureDataUri: await fileToDataUri(businessProfile?.signature_storage_path),
    stampDataUri: await fileToDataUri(businessProfile?.stamp_storage_path),
  };
}

export interface DocumentRow {
  document_type: string;
  document_number: string;
  title: string;
  created_at: Date;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  structured_data: {
    items?: { description?: string; quantity?: number; unitPriceCents?: number; discountPct?: number; lineTotalCents?: number }[];
    notes?: string | null;
    terms?: string | null;
    validUntil?: string | null;
    dueDate?: string | null;
    sections?: { heading: string; body: string }[];
    manualContact?: { name: string; company?: string; email?: string; phone?: string } | null;
  } | null;
}

export interface ContactRow {
  custom_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  company: string | null;
  email: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function buildDocumentContext(
  document: DocumentRow, contact: ContactRow | null,
): { document: DocumentContext; contact: ContactContext } {
  const currency = document.currency;
  const structured = document.structured_data ?? {};
  const items = structured.items ?? [];

  const hasDiscounts = items.some((item) => (item.discountPct ?? 0) > 0);
  const lineItems = items.map((item) => {
    const discountPct = item.discountPct ?? 0;
    return {
      description: item.description ?? '',
      quantity: item.quantity ?? 1,
      unitPrice: formatMoney(item.unitPriceCents ?? 0, currency),
      discountLabel: discountPct ? `${discountPct.toFixed(0)}%` : '—',
      lineTotal: formatMoney(item.lineTotalCents ?? 0, currency),
    };
  });

  const documentContext: DocumentContext = {
    documentType: document.document_type,
    documentNumber: document.document_number,
    title: document.title,
    issueDate: formatDate(document.created_at),
    validUntil: structured.validUntil ?? null,
    dueDate: structured.dueDate ?? null,
    lineItems,
    hasItems: lineItems.length > 0,
    hasDiscounts,
    subtotal: formatMoney(document.subtotal_cents, currency),
    discount: document.discount_cents ? formatMoney(document.discount_cents, currency) : null,
    tax: document.tax_cents ? formatMoney(document.tax_cents, currency) : null,
    total: formatMoney(document.total_cents, currency),
    notes: structured.notes ?? null,
    terms: structured.terms ?? null,
    sections: structured.sections ?? [],
  };

  const contactContext: ContactContext = contact
    ? {
      name: contact.custom_name || contact.display_name || contact.phone_number || 'Contact',
      company: contact.company ?? null,
      email: contact.email ?? null,
      phone: contact.phone_number ?? null,
    }
    : { name: 'Contact', company: null, email: null, phone: null };

  return { document: documentContext, contact: contactContext };
}
