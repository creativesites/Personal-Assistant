// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';

// One of 8 business-document templates — "Compact": the practical choice
// for a long line-item list (smaller row height, tighter margins/type)
// rather than a visual-style variant like the others. Same {document,
// business, contact} shape as every other template.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: '#1f2937', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, marginBottom: 10, borderBottomWidth: 1.5 },
  logo: { maxWidth: 110, maxHeight: 32, objectFit: 'contain', marginBottom: 4 },
  companyName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  companyMeta: { fontSize: 7, color: '#6b7280', marginTop: 2, lineHeight: 1.3 },
  docTitleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, textTransform: 'uppercase' },
  docNumber: { fontSize: 7.5, color: '#6b7280', marginTop: 2 },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, marginBottom: 10 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 6.5, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.4, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 8, lineHeight: 1.3 },
  section: { marginTop: 8 },
  sectionLabel: { fontSize: 6.5, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.4, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  sectionBody: { fontSize: 8, lineHeight: 1.4, color: '#374151' },
  table: { marginBottom: 8 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 3, marginBottom: 1 },
  tableHeaderCell: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.3, color: '#6b7280', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' },
  colDesc: { flex: 1 },
  colQty: { width: 32, textAlign: 'right' },
  colUnit: { width: 55, textAlign: 'right' },
  colDiscount: { width: 45, textAlign: 'right' },
  colTotal: { width: 58, textAlign: 'right' },
  cellText: { fontSize: 8 },
  totals: { width: 210, marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  totalLabel: { fontSize: 8, color: '#374151' },
  totalValue: { fontSize: 8, color: '#374151' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.5, marginTop: 2, paddingTop: 4 },
  grandLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  paymentGrid: { flexDirection: 'row', gap: 20, marginTop: 3 },
  paymentText: { fontSize: 8, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 },
  signatureImage: { maxHeight: 30, marginBottom: 3 },
  stampImage: { maxHeight: 44 },
  signatureCaption: { fontSize: 7, color: '#6b7280' },
  footer: { marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', fontSize: 7, color: '#9ca3af', textAlign: 'center' },
});

export default function Compact({ document, business, contact }: TemplateProps) {
  const themeColor = business.themeColor;
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: themeColor }]}>
          <View>
            {business.logoDataUri ? <Image src={business.logoDataUri} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{business.companyName || 'Your Business'}</Text>
            <Text style={styles.companyMeta}>
              {[business.address, business.phone, business.email].filter(Boolean).join(' · ')}
            </Text>
            {business.taxId ? <Text style={styles.companyMeta}>TPIN: {business.taxId}</Text> : null}
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={[styles.docTitle, { color: themeColor }]}>
              {document.documentType.replace(/_/g, ' ')}
            </Text>
            <Text style={styles.docNumber}>{document.documentNumber}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Billed To</Text>
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
                <Text style={[styles.metaLabel, { marginTop: 4 }]}>Valid Until</Text>
                <Text style={styles.metaValue}>{document.validUntil}</Text>
              </>
            ) : null}
            {document.documentType === 'invoice' && document.dueDate ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 4 }]}>Due Date</Text>
                <Text style={styles.metaValue}>{document.dueDate}</Text>
              </>
            ) : null}
          </View>
        </View>

        {document.sections.map((sec, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionLabel}>{sec.heading}</Text>
            <Text style={styles.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        {document.hasItems ? (
          <>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Description</Text></View>
                <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
                <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Price</Text></View>
                {document.hasDiscounts ? (
                  <View style={styles.colDiscount}><Text style={styles.tableHeaderCell}>Disc</Text></View>
                ) : null}
                <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
              </View>
              {document.lineItems.map((item, i) => (
                <View key={i} style={styles.tableRow}>
                  <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
                  <View style={styles.colQty}><Text style={styles.cellText}>{item.quantity}</Text></View>
                  <View style={styles.colUnit}><Text style={styles.cellText}>{item.unitPrice}</Text></View>
                  {document.hasDiscounts ? (
                    <View style={styles.colDiscount}><Text style={styles.cellText}>{item.discountLabel}</Text></View>
                  ) : null}
                  <View style={styles.colTotal}><Text style={styles.cellText}>{item.lineTotal}</Text></View>
                </View>
              ))}
            </View>

            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{document.subtotal}</Text>
              </View>
              {document.discount ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>-{document.discount}</Text>
                </View>
              ) : null}
              {document.tax ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax</Text>
                  <Text style={styles.totalValue}>{document.tax}</Text>
                </View>
              ) : null}
              <View style={[styles.grandRow, { borderTopColor: themeColor }]}>
                <Text style={[styles.grandLabel, { color: themeColor }]}>Total</Text>
                <Text style={[styles.grandValue, { color: themeColor }]}>{document.total}</Text>
              </View>
            </View>
          </>
        ) : null}

        {document.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.sectionBody}>{document.notes}</Text>
          </View>
        ) : null}

        {document.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Terms &amp; Conditions</Text>
            <Text style={styles.sectionBody}>{document.terms}</Text>
          </View>
        ) : null}

        {hasPayment ? (
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
          style={{ position: 'absolute', bottom: 12, right: 24, fontSize: 7, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
