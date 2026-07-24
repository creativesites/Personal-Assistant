// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';
import { DocContent } from './DocContent';

// One of 8 business-document templates — "Corporate": a bold, full-width
// header band in the brand's theme color, right-aligned meta block, strong
// section dividers. Same {document, business, contact} shape as every
// other template — register in render.ts's TEMPLATES map, no other change.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', paddingTop: 45, paddingBottom: 45, paddingHorizontal: 40 },
  headerBand: { paddingHorizontal: 24, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: 6, marginBottom: 12 },
  logo: { maxWidth: 150, maxHeight: 46, objectFit: 'contain', marginBottom: 8 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  companyMeta: { fontSize: 8, color: '#e5e7eb', marginTop: 3, lineHeight: 1.4 },
  docTitleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffffff' },
  docNumber: { fontSize: 9, color: '#e5e7eb', marginTop: 3 },
  body: { paddingTop: 8 },
  metaGrid: { flexDirection: 'row', justifyContent: 'flex-end', gap: 36, marginBottom: 20 },
  metaBlock: { alignItems: 'flex-end' },
  metaLabel: { fontSize: 7.5, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 9.5, lineHeight: 1.5, textAlign: 'right' },
  section: { marginTop: 16 },
  sectionLabel: { fontSize: 7.5, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  sectionBody: { fontSize: 9, lineHeight: 1.6, color: '#374151' },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', paddingVertical: 7, marginBottom: 2 },
  tableHeaderCell: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
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
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4 },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  paymentGrid: { flexDirection: 'row', gap: 28, marginTop: 6 },
  paymentText: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 36 },
  signatureImage: { maxHeight: 40, marginBottom: 4 },
  stampImage: { maxHeight: 60 },
  signatureCaption: { fontSize: 8, color: '#6b7280' },
  footer: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

export default function Corporate({ document, business, contact }: TemplateProps) {
  const themeColor = business.themeColor;
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.headerBand, { backgroundColor: themeColor }]}>
          <View>
            {business.logoDataUri ? <Image src={business.logoDataUri} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{business.companyName || 'Your Business'}</Text>
            <Text style={styles.companyMeta}>
              {[business.address, business.phone, business.email].filter(Boolean).join(' · ')}
            </Text>
            {business.taxId ? <Text style={styles.companyMeta}>TPIN: {business.taxId}</Text> : null}
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>{document.documentType.replace(/_/g, ' ')}</Text>
            <Text style={styles.docNumber}>{document.documentNumber}</Text>
          </View>
        </View>

        <View style={styles.body}>
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
              <Text style={[styles.metaValue, { fontFamily: 'Helvetica-Bold' }]}>{contact.name}</Text>
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
        </View>

        <Text
          style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
