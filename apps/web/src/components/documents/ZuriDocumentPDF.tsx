// @ts-nocheck — @react-pdf/renderer types incompatible with React 19; runtime is fine
import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#374151', backgroundColor: '#ffffff', padding: 0 },
  // Header band
  headerBand: { backgroundColor: '#1e1b4b', paddingHorizontal: 36, paddingVertical: 28, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  logo: { width: 80, height: 40, objectFit: 'contain' },
  logoPlaceholder: { width: 80, height: 40 },
  docTypePill: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' },
  docTypeText: { color: '#a5b4fc', fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerRight: { alignItems: 'flex-end' },
  docNumber: { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  docMeta: { color: '#c7d2fe', fontSize: 8, marginTop: 3 },
  // Addresses row
  addressRow: { flexDirection: 'row', paddingHorizontal: 36, paddingVertical: 20, gap: 40, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6366f1', letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' },
  addressName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },
  addressLine: { fontSize: 8.5, color: '#6b7280', marginBottom: 1.5 },
  // Items table
  tableSection: { paddingHorizontal: 36, paddingTop: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8f7ff', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 4, marginBottom: 2 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6366f1', letterSpacing: 0.5, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colTax: { width: 45, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 8.5, color: '#374151' },
  cellBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111827' },
  // Totals
  totalsSection: { flexDirection: 'row', paddingHorizontal: 36, paddingTop: 12, justifyContent: 'flex-end' },
  totalsBox: { width: 200 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 8.5, color: '#6b7280' },
  totalValue: { fontSize: 8.5, color: '#374151', fontFamily: 'Helvetica-Bold' },
  totalDivider: { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginVertical: 4 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, backgroundColor: '#1e1b4b', borderRadius: 6, paddingHorizontal: 10, marginTop: 4 },
  grandLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#a5b4fc' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  // Notes + banking
  bottomSection: { flexDirection: 'row', paddingHorizontal: 36, paddingTop: 20, paddingBottom: 28, gap: 24, marginTop: 12 },
  notesBox: { flex: 1 },
  bankingBox: { width: 180, backgroundColor: '#f8f7ff', borderRadius: 8, padding: 12 },
  sectionLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6366f1', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  noteText: { fontSize: 8, color: '#6b7280', lineHeight: 1.6 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  bankLabel: { fontSize: 7.5, color: '#9ca3af' },
  bankValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151', textAlign: 'right' },
  // Footer
  footer: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 36, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7.5, color: '#9ca3af' },
  footerAccent: { fontSize: 7.5, color: '#6366f1' },
})

export interface ZuriDocData {
  docType: string
  docNumber: string
  issueDate: string
  dueDate: string
  reference: string
  currency: string
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  companyWebsite: string
  companyLogoUrl: string
  taxId: string
  clientName: string
  clientCompany: string
  clientAddress: string
  clientPhone: string
  clientEmail: string
  lineItems: Array<{ id: string; description: string; quantity: string; unitPrice: string; taxRate: string }>
  discountRate: number
  notes: string
  terms: string
  bankName: string
  accountName: string
  accountNumber: string
  branchCode: string
  footerText: string
}

function fmt(currency: string, n: number) {
  return `${currency} ${n.toFixed(2)}`
}

export default function ZuriDocumentPDF({ data }: { data: ZuriDocData }) {
  const items = (data.lineItems || []).filter(li => li.description.trim())
  const subtotal = items.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0
    const price = parseFloat(li.unitPrice) || 0
    return sum + qty * price
  }, 0)
  const taxTotal = items.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0
    const price = parseFloat(li.unitPrice) || 0
    const tax = parseFloat(li.taxRate) || 0
    return sum + qty * price * (tax / 100)
  }, 0)
  const discount = subtotal * ((data.discountRate || 0) / 100)
  const grand = subtotal + taxTotal - discount

  const cur = data.currency || 'USD'
  const hasBanking = data.bankName || data.accountNumber

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBand}>
          <View>
            {data.companyLogoUrl ? (
              <Image src={data.companyLogoUrl} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                  {data.companyName || 'Company'}
                </Text>
              </View>
            )}
            <View style={[styles.docTypePill, { marginTop: 14 }]}>
              <Text style={styles.docTypeText}>{(data.docType || 'invoice').toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docNumber}>{data.docNumber || '#0001'}</Text>
            {data.issueDate ? <Text style={styles.docMeta}>Issued: {data.issueDate}</Text> : null}
            {data.dueDate ? <Text style={styles.docMeta}>Due: {data.dueDate}</Text> : null}
            {data.reference ? <Text style={styles.docMeta}>Ref: {data.reference}</Text> : null}
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.addressRow}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>From</Text>
            {data.companyName ? <Text style={styles.addressName}>{data.companyName}</Text> : null}
            {data.companyAddress ? <Text style={styles.addressLine}>{data.companyAddress}</Text> : null}
            {data.companyPhone ? <Text style={styles.addressLine}>T: {data.companyPhone}</Text> : null}
            {data.companyEmail ? <Text style={styles.addressLine}>{data.companyEmail}</Text> : null}
            {data.companyWebsite ? <Text style={styles.addressLine}>{data.companyWebsite}</Text> : null}
            {data.taxId ? <Text style={styles.addressLine}>Tax ID: {data.taxId}</Text> : null}
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Bill To</Text>
            {data.clientName ? <Text style={styles.addressName}>{data.clientName}</Text> : null}
            {data.clientCompany ? <Text style={styles.addressLine}>{data.clientCompany}</Text> : null}
            {data.clientAddress ? <Text style={styles.addressLine}>{data.clientAddress}</Text> : null}
            {data.clientPhone ? <Text style={styles.addressLine}>T: {data.clientPhone}</Text> : null}
            {data.clientEmail ? <Text style={styles.addressLine}>{data.clientEmail}</Text> : null}
          </View>
        </View>

        {/* Items table */}
        <View style={styles.tableSection}>
          <View style={styles.tableHeader}>
            <View style={styles.colDesc}><Text style={styles.tableHeaderText}>Description</Text></View>
            <View style={styles.colQty}><Text style={[styles.tableHeaderText, { textAlign: 'right' }]}>Qty</Text></View>
            <View style={styles.colUnit}><Text style={[styles.tableHeaderText, { textAlign: 'right' }]}>Unit Price</Text></View>
            <View style={styles.colTax}><Text style={[styles.tableHeaderText, { textAlign: 'right' }]}>Tax%</Text></View>
            <View style={styles.colTotal}><Text style={[styles.tableHeaderText, { textAlign: 'right' }]}>Total</Text></View>
          </View>
          {items.map((li, i) => {
            const qty = parseFloat(li.quantity) || 0
            const price = parseFloat(li.unitPrice) || 0
            const tax = parseFloat(li.taxRate) || 0
            const lineTotal = qty * price * (1 + tax / 100)
            return (
              <View key={li.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
                <View style={styles.colDesc}><Text style={styles.cellText}>{li.description}</Text></View>
                <View style={styles.colQty}><Text style={[styles.cellText, { textAlign: 'right' }]}>{li.quantity}</Text></View>
                <View style={styles.colUnit}><Text style={[styles.cellText, { textAlign: 'right' }]}>{fmt(cur, price)}</Text></View>
                <View style={styles.colTax}><Text style={[styles.cellText, { textAlign: 'right' }]}>{tax > 0 ? `${tax}%` : '—'}</Text></View>
                <View style={styles.colTotal}><Text style={[styles.cellBold, { textAlign: 'right' }]}>{fmt(cur, lineTotal)}</Text></View>
              </View>
            )
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(cur, subtotal)}</Text>
            </View>
            {taxTotal > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax</Text>
                <Text style={styles.totalValue}>{fmt(cur, taxTotal)}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount ({data.discountRate}%)</Text>
                <Text style={[styles.totalValue, { color: '#dc2626' }]}>-{fmt(cur, discount)}</Text>
              </View>
            )}
            <View style={styles.totalDivider} />
            <View style={styles.grandTotal}>
              <Text style={styles.grandLabel}>TOTAL DUE</Text>
              <Text style={styles.grandValue}>{fmt(cur, grand)}</Text>
            </View>
          </View>
        </View>

        {/* Notes + banking */}
        <View style={styles.bottomSection}>
          <View style={styles.notesBox}>
            {data.notes ? (
              <>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text style={styles.noteText}>{data.notes}</Text>
              </>
            ) : null}
            {data.terms ? (
              <View style={{ marginTop: data.notes ? 12 : 0 }}>
                <Text style={styles.sectionLabel}>Terms &amp; Conditions</Text>
                <Text style={styles.noteText}>{data.terms}</Text>
              </View>
            ) : null}
          </View>
          {hasBanking ? (
            <View style={styles.bankingBox}>
              <Text style={styles.sectionLabel}>Payment Details</Text>
              {data.bankName ? (
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Bank</Text>
                  <Text style={styles.bankValue}>{data.bankName}</Text>
                </View>
              ) : null}
              {data.accountName ? (
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Account Name</Text>
                  <Text style={styles.bankValue}>{data.accountName}</Text>
                </View>
              ) : null}
              {data.accountNumber ? (
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Account No.</Text>
                  <Text style={styles.bankValue}>{data.accountNumber}</Text>
                </View>
              ) : null}
              {data.branchCode ? (
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Branch Code</Text>
                  <Text style={styles.bankValue}>{data.branchCode}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.footerText || `Thank you for your business — ${data.companyName || ''}`}
          </Text>
          <Text style={styles.footerAccent} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
