// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';
import { DocContent } from './DocContent';

// One of 8 business-document templates — "Creative": a two-column layout
// with a colored sidebar (mirroring CvCreative.tsx's already-proven sidebar
// pattern for CVs) holding the logo/company/client/date info, main column
// for line items/totals/notes. The one template where visual impression
// deliberately outweighs strict single-column ATS-style plainness — same
// {document, business, contact} shape as every other template.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', flexDirection: 'row', paddingTop: 40, paddingBottom: 40 },
  sidebar: { width: '32%', padding: 24, color: '#ffffff' },
  main: { width: '68%', padding: 28 },
  logo: { maxWidth: 120, maxHeight: 40, objectFit: 'contain', marginBottom: 10 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  companyMeta: { fontSize: 8, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 1.5 },
  sidebarSection: { marginTop: 22 },
  sidebarLabel: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)', fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  sidebarText: { fontSize: 8.5, color: '#ffffff', lineHeight: 1.5, marginBottom: 2 },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', color: '#111827' },
  docNumber: { fontSize: 9, color: '#6b7280', marginTop: 3, marginBottom: 20 },
  section: { marginTop: 16 },
  sectionLabel: { fontSize: 7.5, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  sectionBody: { fontSize: 9, lineHeight: 1.6, color: '#374151' },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#e5e7eb', paddingBottom: 6, marginBottom: 2 },
  tableHeaderCell: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  colDesc: { flex: 1 },
  colQty: { width: 36, textAlign: 'right' },
  colUnit: { width: 58, textAlign: 'right' },
  colDiscount: { width: 48, textAlign: 'right' },
  colTotal: { width: 62, textAlign: 'right' },
  cellText: { fontSize: 9 },
  totals: { width: 220, marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 9.5, color: '#374151' },
  totalValue: { fontSize: 9.5, color: '#374151' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, marginTop: 4, paddingTop: 8 },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  paymentText: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', marginTop: 30 },
  signatureImage: { maxHeight: 38, marginBottom: 4 },
  signatureCaption: { fontSize: 8, color: '#6b7280' },
  footer: { marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', fontSize: 8, color: '#9ca3af' },
});

export default function Creative({ document, business, contact }: TemplateProps) {
  const themeColor = business.themeColor;
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.sidebar, { backgroundColor: themeColor }]}>
          {business.logoDataUri ? <Image src={business.logoDataUri} style={styles.logo} /> : null}
          <Text style={styles.companyName}>{business.companyName || 'Your Business'}</Text>
          <Text style={styles.companyMeta}>
            {[business.address, business.phone, business.email].filter(Boolean).join('\n')}
          </Text>
          {business.taxId ? <Text style={styles.companyMeta}>TPIN: {business.taxId}</Text> : null}

          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarLabel}>
              {['nda', 'contract', 'msa', 'service_agreement', 'statement_of_work', 'proposal'].includes(document.documentType)
                ? 'Prepared For'
                : document.documentType === 'delivery_note'
                ? 'Deliver To'
                : document.documentType === 'purchase_order'
                ? 'Vendor / Supplier'
                : 'Billed To'}
            </Text>
            <Text style={[styles.sidebarText, { fontFamily: 'Helvetica-Bold' }]}>{contact.name}</Text>
            {contact.company ? <Text style={styles.sidebarText}>{contact.company}</Text> : null}
            {contact.email ? <Text style={styles.sidebarText}>{contact.email}</Text> : null}
            {contact.phone ? <Text style={styles.sidebarText}>{contact.phone}</Text> : null}
          </View>

          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarLabel}>Date</Text>
            <Text style={styles.sidebarText}>{document.issueDate}</Text>
            {document.documentType === 'quotation' && document.validUntil ? (
              <>
                <Text style={[styles.sidebarLabel, { marginTop: 10 }]}>Valid Until</Text>
                <Text style={styles.sidebarText}>{document.validUntil}</Text>
              </>
            ) : null}
            {document.documentType === 'invoice' && document.dueDate ? (
              <>
                <Text style={[styles.sidebarLabel, { marginTop: 10 }]}>Due Date</Text>
                <Text style={styles.sidebarText}>{document.dueDate}</Text>
              </>
            ) : null}
          </View>

          {hasPayment && !['nda', 'contract', 'msa', 'service_agreement', 'delivery_note'].includes(document.documentType) ? (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarLabel}>Payment</Text>
              {business.bankDetails ? <Text style={styles.sidebarText}>{business.bankDetails}</Text> : null}
              {business.mobileMoney ? <Text style={styles.sidebarText}>{business.mobileMoney}</Text> : null}
              {business.paymentInstructions ? <Text style={styles.sidebarText}>{business.paymentInstructions}</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.main}>
          <Text style={[styles.docTitle, { color: themeColor }]}>{document.documentType.replace(/_/g, ' ')}</Text>
          <Text style={styles.docNumber}>{document.documentNumber}</Text>

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

          <View style={styles.signatureRow}>
            <View style={{ alignItems: 'flex-end' }}>
              {business.signatureDataUri ? <Image src={business.signatureDataUri} style={styles.signatureImage} /> : null}
              <Text style={styles.signatureCaption}>Authorized signature</Text>
            </View>
          </View>

          {business.footerText ? <Text style={styles.footer}>{business.footerText}</Text> : null}
        </View>

        <Text
          style={{ position: 'absolute', bottom: 20, right: 28, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
