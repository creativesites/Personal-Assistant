// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';
import { DocContent } from './DocContent';

// One of 8 business-document templates — "Executive": dark section bars
// (mirroring CvExecutive.tsx's visual language for CVs, adapted here for
// line-items/totals instead of experience/education), a larger, boxed
// totals block. Same {document, business, contact} shape as every other
// template.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', paddingTop: 45, paddingBottom: 45, paddingHorizontal: 40 },
  header: { backgroundColor: '#111827', paddingHorizontal: 40, paddingVertical: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { maxWidth: 140, maxHeight: 42, objectFit: 'contain', marginBottom: 8 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  companyMeta: { fontSize: 8, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 },
  docTitleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 17, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffffff' },
  docNumber: { fontSize: 9, color: '#9ca3af', marginTop: 3 },
  body: { padding: 40 },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 28, marginBottom: 22 },
  metaBlock: { flex: 1 },
  sectionBar: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  metaLabel: { fontSize: 7.5, textTransform: 'uppercase', color: '#374151', letterSpacing: 0.5, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 9.5, lineHeight: 1.5 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 7.5, textTransform: 'uppercase', color: '#374151', letterSpacing: 0.5, fontFamily: 'Helvetica-Bold' },
  sectionBody: { fontSize: 9, lineHeight: 1.6, color: '#374151', marginTop: 6 },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#111827', paddingVertical: 7, paddingHorizontal: 8 },
  tableHeaderCell: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colDiscount: { width: 55, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 9 },
  totals: { width: 260, marginLeft: 'auto', backgroundColor: '#f9fafb', padding: 14, borderRadius: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 9.5, color: '#374151' },
  totalValue: { fontSize: 9.5, color: '#374151' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.5, borderTopColor: '#111827', marginTop: 6, paddingTop: 10 },
  grandLabel: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  grandValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  paymentGrid: { flexDirection: 'row', gap: 28, marginTop: 6 },
  paymentText: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 32 },
  signatureImage: { maxHeight: 40, marginBottom: 4 },
  stampImage: { maxHeight: 60 },
  signatureCaption: { fontSize: 8, color: '#6b7280' },
  footer: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

export default function Executive({ document, business, contact }: TemplateProps) {
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
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
              <View style={styles.sectionBar}>
                <Text style={styles.metaLabel}>
                  {['nda', 'contract', 'msa', 'service_agreement', 'statement_of_work', 'proposal'].includes(document.documentType)
                    ? 'Prepared For / Counterparty'
                    : document.documentType === 'delivery_note'
                    ? 'Deliver To'
                    : document.documentType === 'purchase_order'
                    ? 'Vendor / Supplier'
                    : 'Billed To'}
                </Text>
              </View>
              <Text style={[styles.metaValue, { fontFamily: 'Helvetica-Bold' }]}>{contact.name}</Text>
              {contact.company ? <Text style={styles.metaValue}>{contact.company}</Text> : null}
              {contact.email ? <Text style={styles.metaValue}>{contact.email}</Text> : null}
              {contact.phone ? <Text style={styles.metaValue}>{contact.phone}</Text> : null}
            </View>
            <View style={styles.metaBlock}>
              <View style={styles.sectionBar}><Text style={styles.metaLabel}>Date</Text></View>
              <Text style={styles.metaValue}>{document.issueDate}</Text>
              {document.documentType === 'quotation' && document.validUntil ? (
                <>
                  <View style={[styles.sectionBar, { marginTop: 8 }]}><Text style={styles.metaLabel}>Valid Until</Text></View>
                  <Text style={styles.metaValue}>{document.validUntil}</Text>
                </>
              ) : null}
              {document.documentType === 'invoice' && document.dueDate ? (
                <>
                  <View style={[styles.sectionBar, { marginTop: 8 }]}><Text style={styles.metaLabel}>Due Date</Text></View>
                  <Text style={styles.metaValue}>{document.dueDate}</Text>
                </>
              ) : null}
            </View>
          </View>

          <DocContent document={document} business={business} contact={contact} />

          {document.notes && !['nda', 'contract', 'msa', 'service_agreement', 'delivery_note'].includes(document.documentType) ? (
            <View style={styles.section}>
              <View style={styles.sectionBar}><Text style={styles.sectionLabel}>Notes</Text></View>
              <Text style={styles.sectionBody}>{document.notes}</Text>
            </View>
          ) : null}

          {document.terms && !['nda', 'contract', 'msa', 'service_agreement'].includes(document.documentType) ? (
            <View style={styles.section}>
              <View style={styles.sectionBar}><Text style={styles.sectionLabel}>Terms &amp; Conditions</Text></View>
              <Text style={styles.sectionBody}>{document.terms}</Text>
            </View>
          ) : null}

          {hasPayment && !['nda', 'contract', 'msa', 'service_agreement', 'delivery_note'].includes(document.documentType) ? (
            <View style={styles.section}>
              <View style={styles.sectionBar}><Text style={styles.sectionLabel}>Payment</Text></View>
              <View style={[styles.paymentGrid, { marginTop: 6 }]}>
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
