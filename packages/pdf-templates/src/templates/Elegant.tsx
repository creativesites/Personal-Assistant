// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';
import { DocContent } from './DocContent';

// One of 8 business-document templates — "Elegant": generous whitespace,
// hairline rules, understated small-caps-style labels, no color blocks at
// all (theme color used only as a thin accent line). Same {document,
// business, contact} shape as every other template.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#27272a', paddingTop: 45, paddingBottom: 45, paddingHorizontal: 45 },
  header: { marginBottom: 30 },
  logo: { maxWidth: 130, maxHeight: 40, objectFit: 'contain', marginBottom: 10 },
  companyName: { fontSize: 12, fontFamily: 'Helvetica', color: '#27272a', letterSpacing: 0.5 },
  companyMeta: { fontSize: 8, color: '#9ca3af', marginTop: 4, lineHeight: 1.6 },
  accentLine: { width: 32, height: 1.5, marginTop: 14, marginBottom: 14 },
  docTitle: { fontSize: 20, fontFamily: 'Helvetica', letterSpacing: 3, textTransform: 'uppercase', color: '#27272a' },
  docNumber: { fontSize: 8.5, color: '#a1a1aa', marginTop: 4, letterSpacing: 1 },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 40, marginTop: 30, marginBottom: 26 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 7, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: 1.5, marginBottom: 5 },
  metaValue: { fontSize: 9.5, lineHeight: 1.7, color: '#3f3f46' },
  section: { marginTop: 20 },
  sectionLabel: { fontSize: 7, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: 1.5, marginBottom: 6 },
  sectionBody: { fontSize: 9, lineHeight: 1.7, color: '#52525b' },
  table: { marginBottom: 18 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d4d4d8', paddingBottom: 8, marginBottom: 4 },
  tableHeaderCell: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, color: '#a1a1aa' },
  tableRow: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: '#f4f4f5' },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colDiscount: { width: 55, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 9, color: '#3f3f46' },
  totals: { width: 250, marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 9, color: '#71717a' },
  totalValue: { fontSize: 9, color: '#3f3f46' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, marginTop: 6, paddingTop: 10 },
  grandLabel: { fontSize: 10.5, fontFamily: 'Helvetica', letterSpacing: 1 },
  grandValue: { fontSize: 10.5, fontFamily: 'Helvetica' },
  paymentGrid: { flexDirection: 'row', gap: 28, marginTop: 8 },
  paymentText: { fontSize: 9, color: '#52525b' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 44 },
  signatureImage: { maxHeight: 38, marginBottom: 4 },
  stampImage: { maxHeight: 56 },
  signatureCaption: { fontSize: 7.5, color: '#a1a1aa', letterSpacing: 0.5 },
  footer: { marginTop: 30, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#e4e4e7', fontSize: 7.5, color: '#a1a1aa', textAlign: 'center', letterSpacing: 0.5 },
});

export default function Elegant({ document, business, contact }: TemplateProps) {
  const themeColor = business.themeColor;
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {business.logoDataUri ? <Image src={business.logoDataUri} style={styles.logo} /> : null}
          <Text style={styles.companyName}>{business.companyName || 'Your Business'}</Text>
          <Text style={styles.companyMeta}>
            {[business.address, business.phone, business.email].filter(Boolean).join('  ·  ')}
          </Text>
          {business.taxId ? <Text style={styles.companyMeta}>TPIN: {business.taxId}</Text> : null}
          <View style={[styles.accentLine, { backgroundColor: themeColor }]} />
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
                <Text style={[styles.metaLabel, { marginTop: 10 }]}>Valid Until</Text>
                <Text style={styles.metaValue}>{document.validUntil}</Text>
              </>
            ) : null}
            {document.documentType === 'invoice' && document.dueDate ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 10 }]}>Due Date</Text>
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
            <Text style={styles.signatureCaption}>AUTHORIZED SIGNATURE</Text>
          </View>
        </View>

        {business.footerText ? <Text style={styles.footer}>{business.footerText}</Text> : null}

        <Text
          style={{ position: 'absolute', bottom: 24, right: 52, fontSize: 7.5, color: '#a1a1aa' }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
