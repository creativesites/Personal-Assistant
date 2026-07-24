// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';
import { DocContent } from './DocContent';

// One of 8 business-document templates (see plan doc / CLAUDE.md's Business
// Workspace section) — "Classic": a traditional letterhead look using the
// built-in Times-Roman/Times-Bold standard fonts (no Font.register() network
// fetch needed — these ship with @react-pdf/renderer), centered company
// header, minimal color, a plain ruled table. Same {document, business,
// contact} shape as Minimal/Modern — no renderer changes needed beyond
// registering this in render.ts's TEMPLATES map.

const styles = StyleSheet.create({
  page: { fontFamily: 'Times-Roman', fontSize: 10, color: '#1f2937', paddingTop: 45, paddingBottom: 45, paddingHorizontal: 40 },
  header: { alignItems: 'center', paddingBottom: 14, marginBottom: 18, borderBottomWidth: 1, borderBottomColor: '#111827' },
  logo: { maxWidth: 140, maxHeight: 44, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 15, fontFamily: 'Times-Bold', color: '#111827', textAlign: 'center' },
  companyMeta: { fontSize: 8.5, color: '#4b5563', marginTop: 3, lineHeight: 1.4, textAlign: 'center' },
  docTitle: { fontSize: 13, fontFamily: 'Times-Bold', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginTop: 10 },
  docNumber: { fontSize: 9, color: '#6b7280', textAlign: 'center', marginTop: 2 },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 28, marginBottom: 18 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 8, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Times-Bold' },
  metaValue: { fontSize: 9.5, lineHeight: 1.5 },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 8, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Times-Bold' },
  sectionBody: { fontSize: 9, lineHeight: 1.6, color: '#374151' },
  table: { marginBottom: 14 },
  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#111827', paddingVertical: 5, marginBottom: 2 },
  tableHeaderCell: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: '#111827', fontFamily: 'Times-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#d1d5db' },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colDiscount: { width: 55, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 9 },
  totals: { width: 250, marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 9.5, color: '#374151' },
  totalValue: { fontSize: 9.5, color: '#374151' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#111827', marginTop: 4, paddingTop: 8 },
  grandLabel: { fontSize: 11, fontFamily: 'Times-Bold' },
  grandValue: { fontSize: 11, fontFamily: 'Times-Bold' },
  paymentGrid: { flexDirection: 'row', gap: 28, marginTop: 6 },
  paymentText: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 32 },
  signatureImage: { maxHeight: 40, marginBottom: 4 },
  stampImage: { maxHeight: 60 },
  signatureCaption: { fontSize: 8, color: '#6b7280' },
  footer: { marginTop: 22, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d1d5db', fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

export default function Classic({ document, business, contact }: TemplateProps) {
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {business.logoDataUri ? <Image src={business.logoDataUri} style={styles.logo} /> : null}
          <Text style={styles.companyName}>{business.companyName || 'Your Business'}</Text>
          <Text style={styles.companyMeta}>
            {[business.address, business.phone, business.email].filter(Boolean).join(' · ')}
          </Text>
          {business.taxId ? <Text style={styles.companyMeta}>TPIN: {business.taxId}</Text> : null}
          <Text style={styles.docTitle}>{document.documentType.replace(/_/g, ' ')}</Text>
          <Text style={styles.docNumber}>{document.documentNumber}</Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>
              {['nda', 'contract', 'msa', 'service_agreement', 'statement_of_work', 'proposal'].includes(document.documentType)
                ? 'Prepared For / Counterparty'
                : document.documentType === 'delivery_note'
                ? 'Deliver To'
                : document.documentType === 'purchase_order'
                ? 'Vendor / Supplier'
                : 'Billed To'}
            </Text>
            <Text style={[styles.metaValue, { fontFamily: 'Times-Bold' }]}>{contact.name}</Text>
            {contact.company ? <Text style={styles.metaValue}>{contact.company}</Text> : null}
            {contact.email ? <Text style={styles.metaValue}>{contact.email}</Text> : null}
            {contact.phone ? <Text style={styles.metaValue}>{contact.phone}</Text> : null}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{document.issueDate}</Text>
            {document.documentType === 'quotation' && document.validUntil ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 8 }]}>Valid Until</Text>
                <Text style={styles.metaValue}>{document.validUntil}</Text>
              </>
            ) : null}
            {document.documentType === 'invoice' && document.dueDate ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 8 }]}>Due Date</Text>
                <Text style={styles.metaValue}>{document.dueDate}</Text>
              </>
            ) : null}
          </View>
        </View>

        <DocContent document={document} business={business} contact={contact} />

        {document.notes && !['nda', 'contract', 'msa', 'service_agreement', 'delivery_note'].includes(document.documentType) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.sectionBody}>{document.notes}</Text>
          </View>
        ) : null}

        {document.terms && !['nda', 'contract', 'msa', 'service_agreement'].includes(document.documentType) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Terms &amp; Conditions</Text>
            <Text style={styles.sectionBody}>{document.terms}</Text>
          </View>
        ) : null}

        {hasPayment && !['nda', 'contract', 'msa', 'service_agreement', 'delivery_note'].includes(document.documentType) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={styles.paymentGrid}>
              {business.bankDetails ? <Text style={styles.paymentText}>{business.bankDetails}</Text> : null}
              {business.mobileMoney ? <Text style={styles.paymentText}>{business.mobileMoney}</Text> : null}
            </View>
            {business.paymentInstructions ? (
              <Text style={styles.paymentText}>{business.paymentInstructions}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.signatureRow}>
          <View>
            {business.stampDataUri ? <Image src={business.stampDataUri} style={styles.stampImage} /> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {business.signatureDataUri ? <Image src={business.signatureDataUri} style={styles.signatureImage} /> : null}
            <Text style={styles.signatureCaption}>Authorized signature</Text>
          </View>
        </View>

        {business.footerText ? <Text style={styles.footer}>{business.footerText}</Text> : null}

        <Text
          style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
