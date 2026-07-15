// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer + React 19 typings.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', padding: 0 },
  band: { paddingHorizontal: 36, paddingVertical: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { maxWidth: 150, maxHeight: 42, objectFit: 'contain', marginBottom: 8 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  companyMeta: { fontSize: 8, color: '#e5e7eb', marginTop: 3, lineHeight: 1.4 },
  docTitleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', color: '#ffffff' },
  docNumber: { fontSize: 9, color: '#e5e7eb', marginTop: 3 },
  content: { paddingHorizontal: 36, paddingTop: 20, paddingBottom: 36 },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 24, marginBottom: 20 },
  metaBlock: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: 10 },
  metaLabel: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 9.5, lineHeight: 1.5 },
  section: { marginTop: 16 },
  sectionLabel: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  sectionBody: { fontSize: 9, lineHeight: 1.6, color: '#374151' },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 4, marginBottom: 2 },
  tableHeaderCell: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colDiscount: { width: 55, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 9 },
  totals: { width: 260, marginLeft: 'auto', backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 9.5, color: '#374151' },
  totalValue: { fontSize: 9.5, color: '#374151' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  paymentGrid: { flexDirection: 'row', gap: 28, marginTop: 6 },
  paymentText: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 32 },
  signatureImage: { maxHeight: 40, marginBottom: 4 },
  stampImage: { maxHeight: 60 },
  signatureCaption: { fontSize: 8, color: '#6b7280' },
  footer: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

export default function Modern({ document, business, contact }: TemplateProps) {
  const themeColor = business.themeColor;
  const hasPayment = business.paymentInstructions || business.bankDetails || business.mobileMoney;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.band, { backgroundColor: themeColor }]}>
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

        <View style={styles.content}>
          <View style={styles.metaGrid}>
            <View style={styles.metaBlock}>
              <Text style={[styles.metaLabel, { color: themeColor }]}>Billed To</Text>
              <Text style={[styles.metaValue, { fontFamily: 'Helvetica-Bold' }]}>{contact.name}</Text>
              {contact.company ? <Text style={styles.metaValue}>{contact.company}</Text> : null}
              {contact.email ? <Text style={styles.metaValue}>{contact.email}</Text> : null}
              {contact.phone ? <Text style={styles.metaValue}>{contact.phone}</Text> : null}
            </View>
            <View style={styles.metaBlock}>
              <Text style={[styles.metaLabel, { color: themeColor }]}>Date</Text>
              <Text style={styles.metaValue}>{document.issueDate}</Text>
              {document.documentType === 'quotation' && document.validUntil ? (
                <>
                  <Text style={[styles.metaLabel, { color: themeColor, marginTop: 8 }]}>Valid Until</Text>
                  <Text style={styles.metaValue}>{document.validUntil}</Text>
                </>
              ) : null}
              {document.documentType === 'invoice' && document.dueDate ? (
                <>
                  <Text style={[styles.metaLabel, { color: themeColor, marginTop: 8 }]}>Due Date</Text>
                  <Text style={styles.metaValue}>{document.dueDate}</Text>
                </>
              ) : null}
            </View>
          </View>

          {document.sections.map((sec, i) => (
            <View key={i} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: themeColor }]}>{sec.heading}</Text>
              <Text style={styles.sectionBody}>{sec.body}</Text>
            </View>
          ))}

          {document.hasItems ? (
            <>
              <View style={styles.table}>
                <View style={[styles.tableHeader, { backgroundColor: themeColor }]}>
                  <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Description</Text></View>
                  <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
                  <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Unit Price</Text></View>
                  {document.hasDiscounts ? (
                    <View style={styles.colDiscount}><Text style={styles.tableHeaderCell}>Discount</Text></View>
                  ) : null}
                  <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
                </View>
                {document.lineItems.map((item, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
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
              <Text style={[styles.sectionLabel, { color: themeColor }]}>Notes</Text>
              <Text style={styles.sectionBody}>{document.notes}</Text>
            </View>
          ) : null}

          {document.terms ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: themeColor }]}>Terms &amp; Conditions</Text>
              <Text style={styles.sectionBody}>{document.terms}</Text>
            </View>
          ) : null}

          {hasPayment ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: themeColor }]}>Payment</Text>
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
          style={{ position: 'absolute', bottom: 20, right: 36, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
