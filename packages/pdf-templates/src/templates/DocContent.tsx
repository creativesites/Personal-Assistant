// @ts-nocheck
import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';

const styles = StyleSheet.create({
  card: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  cardTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#374151', letterSpacing: 0.5, marginBottom: 6 },
  grid2: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  grid3: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  fieldBlock: { flex: 1 },
  label: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 9, color: '#111827', lineHeight: 1.4 },
  valueBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  textBlock: { marginTop: 8 },
  bodyText: { fontSize: 9, color: '#374151', lineHeight: 1.5 },

  // Tables
  table: { marginBottom: 14, marginTop: 6 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#e5e7eb', paddingBottom: 6, paddingHorizontal: 4, marginBottom: 2 },
  tableHeaderCell: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  colDesc: { flex: 1 },
  colQty: { width: 45, textAlign: 'right' },
  colUnit: { width: 65, textAlign: 'right' },
  colDiscount: { width: 55, textAlign: 'right' },
  colTotal: { width: 75, textAlign: 'right' },
  cellText: { fontSize: 9, color: '#111827' },

  // Totals
  totals: { width: 240, marginLeft: 'auto', marginBottom: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  totalLabel: { fontSize: 9, color: '#4b5563' },
  totalValue: { fontSize: 9, color: '#111827' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, marginTop: 4, paddingTop: 6 },
  grandLabel: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },

  // Two-party Signatures
  twoPartyRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  partySigBlock: { width: '45%' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 32, marginBottom: 4, justifyContent: 'flex-end' },
  sigImage: { maxHeight: 36, objectFit: 'contain' },
  sigTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111827' },
  sigSub: { fontSize: 7.5, color: '#6b7280', marginTop: 1 },
});

export function DocContent({ document, business, contact }: TemplateProps) {
  const dt = document.documentType;
  const sd = document.structuredData || {};
  const themeColor = business.themeColor || '#4F46E5';

  const renderSignatureBlocks = () => {
    const requireSignatures = document.structuredData?.requireSignatures !== false;
    const signingParties = document.structuredData?.signingParties || 'both';
    if (!requireSignatures) return null;

    const showSupplier = ['supplier', 'both'].includes(signingParties);
    const showClient = ['client', 'both'].includes(signingParties);

    return (
      <View style={styles.twoPartyRow}>
        {showSupplier ? (
          <View style={styles.partySigBlock}>
            <Text style={styles.sigTitle}>{business.companyName || 'Supplier / Service Provider'}</Text>
            <View style={styles.sigLine}>
              {business.signatureUrl ? (
                <Image src={business.signatureUrl} style={styles.sigImage} />
              ) : null}
            </View>
            <Text style={styles.sigSub}>Authorized Signature &amp; Date</Text>
          </View>
        ) : <View style={styles.partySigBlock} />}

        {showClient ? (
          <View style={styles.partySigBlock}>
            <Text style={styles.sigTitle}>{contact.name || 'Client / Counterparty'}</Text>
            <View style={styles.sigLine}>
              {document.clientSignatureUrl ? (
                <Image src={document.clientSignatureUrl} style={styles.sigImage} />
              ) : null}
            </View>
            <Text style={styles.sigSub}>Client Signature &amp; Date</Text>
          </View>
        ) : <View style={styles.partySigBlock} />}
      </View>
    );
  };

  // 1. LEGAL & AGREEMENTS (NDA, Contract, MSA, Service Agreement)
  if (['nda', 'contract', 'msa', 'service_agreement'].includes(dt)) {
    const isNda = dt === 'nda';
    const requireSignatures = document.structuredData?.requireSignatures !== false;
    const signingParties = document.structuredData?.signingParties || 'both';
    return (
      <View style={{ marginTop: 10 }}>
        {/* Parties Header Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Parties & Agreement Terms</Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>{isNda ? 'Disclosing Party (Company)' : 'Service Provider'}</Text>
              <Text style={styles.valueBold}>{business.companyName || 'Your Business'}</Text>
              {business.address ? <Text style={styles.value}>{business.address}</Text> : null}
              {business.taxId ? <Text style={styles.value}>TPIN: {business.taxId}</Text> : null}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>{isNda ? 'Receiving Party (Client)' : 'Client / Counterparty'}</Text>
              <Text style={styles.valueBold}>{contact.name}</Text>
              {contact.company ? <Text style={styles.value}>{contact.company}</Text> : null}
              {contact.email ? <Text style={styles.value}>{contact.email}</Text> : null}
            </View>
          </View>

          <View style={[styles.grid3, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' }]}>
            {isNda ? (
              <>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Agreement Structure</Text>
                  <Text style={styles.valueBold}>
                    {sd.agreementType === 'unilateral' ? 'Unilateral (One-Way)' : 'Bilateral (Mutual Protection)'}
                  </Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Confidentiality Duration</Text>
                  <Text style={styles.valueBold}>{sd.confidentialityYears || 2} Years</Text>
                </View>
                {sd.effectiveDate ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Effective Date</Text>
                    <Text style={styles.valueBold}>{sd.effectiveDate}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Commencement Date</Text>
                  <Text style={styles.valueBold}>{sd.startDate || sd.effectiveDate || document.issueDate}</Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Expiry / Termination</Text>
                  <Text style={styles.valueBold}>{sd.endDate || 'Until Terminated'}</Text>
                </View>
              </>
            )}
          </View>

          {/* Key Agreement Parameters */}
          {(sd.contractTitle || sd.contractValue || sd.noticePeriod || sd.paymentTermDays || sd.ipOwnership || sd.startDate || sd.effectiveDate) ? (
            <View style={[styles.grid3, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' }]}>
              {sd.contractTitle ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Contract Title</Text>
                  <Text style={styles.valueBold}>{sd.contractTitle}</Text>
                </View>
              ) : null}
              {(sd.startDate || sd.effectiveDate) ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Effective Start Date</Text>
                  <Text style={styles.valueBold}>{sd.startDate || sd.effectiveDate || document.issueDate}</Text>
                </View>
              ) : null}
              {sd.contractValue ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Total Contract Value</Text>
                  <Text style={styles.valueBold}>{sd.contractValue}</Text>
                </View>
              ) : null}
              {sd.noticePeriod ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Termination Notice Period</Text>
                  <Text style={styles.valueBold}>{sd.noticePeriod}</Text>
                </View>
              ) : null}
              {sd.paymentTermDays ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Payment Terms</Text>
                  <Text style={styles.valueBold}>{sd.paymentTermDays} Days</Text>
                </View>
              ) : null}
              {sd.ipOwnership ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>IP Ownership Clause</Text>
                  <Text style={styles.valueBold}>{sd.ipOwnership}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Clauses & Content */}
        {sd.purposeOfDisclosure ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Purpose of Disclosure</Text>
            <Text style={styles.bodyText}>{sd.purposeOfDisclosure}</Text>
          </View>
        ) : null}

        {sd.scopeOfWork ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Scope of Work & Services</Text>
            <Text style={styles.bodyText}>{sd.scopeOfWork}</Text>
          </View>
        ) : null}

        {sd.objectives ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Key Objectives & Milestones</Text>
            <Text style={styles.bodyText}>{sd.objectives}</Text>
          </View>
        ) : null}

        {sd.exclusions ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Scope Exclusions</Text>
            <Text style={styles.bodyText}>{sd.exclusions}</Text>
          </View>
        ) : null}

        {(sd.serviceLevelAgreement || sd.serviceSla) ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Service Level Standards (SLA)</Text>
            <Text style={styles.bodyText}>{sd.serviceLevelAgreement || sd.serviceSla}</Text>
          </View>
        ) : null}

        {sd.serviceDuration ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Service Duration &amp; Frequency</Text>
            <Text style={styles.bodyText}>{sd.serviceDuration}</Text>
          </View>
        ) : null}

        {sd.prerequisites ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Client Prerequisites &amp; Dependencies</Text>
            <Text style={styles.bodyText}>{sd.prerequisites}</Text>
          </View>
        ) : null}

        {sd.paymentSchedule ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Payment Schedule &amp; Milestones</Text>
            <Text style={styles.bodyText}>{sd.paymentSchedule}</Text>
          </View>
        ) : null}

        {sd.confidentialityTerms ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Confidentiality & Non-Disclosure</Text>
            <Text style={styles.bodyText}>{sd.confidentialityTerms}</Text>
          </View>
        ) : null}

        {sd.termAndTermination ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Term & Termination</Text>
            <Text style={styles.bodyText}>{sd.termAndTermination}</Text>
          </View>
        ) : null}

        {sd.governingLaw ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Governing Law & Jurisdiction</Text>
            <Text style={styles.bodyText}>{sd.governingLaw}</Text>
          </View>
        ) : null}

        {/* Custom Sections / Clauses */}
        {document.sections && document.sections.length > 0 ? (
          document.sections.map((sec, i) => (
            <View key={i} style={{ marginBottom: 12 }}>
              <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>{sec.heading}</Text>
              <Text style={styles.bodyText}>{sec.body}</Text>
            </View>
          ))
        ) : null}

        {/* Standard Terms or Notes */}
        {document.notes ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Special Notes & Instructions</Text>
            <Text style={styles.bodyText}>{document.notes}</Text>
          </View>
        ) : null}

        {document.terms ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Standard Conditions & Compliance</Text>
            <Text style={styles.bodyText}>{document.terms}</Text>
          </View>
        ) : null}

        {/* Financial Line Items ONLY if user added real priced items */}
        {document.hasItems && document.total !== '$0.00' && document.total !== 'K0.00' && document.total !== '0.00' ? (
          <View style={styles.table}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Financial Consideration & Fees</Text>
            <View style={styles.tableHeader}>
              <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Description</Text></View>
              <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
              <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Unit Price</Text></View>
              <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
            </View>
            {document.lineItems.map((item, i) => (
              <View key={i} style={styles.tableRow}>
                <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
                <View style={styles.colQty}><Text style={styles.cellText}>{item.quantity}</Text></View>
                <View style={styles.colUnit}><Text style={styles.cellText}>{item.unitPrice}</Text></View>
                <View style={styles.colTotal}><Text style={styles.cellText}>{item.lineTotal}</Text></View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Two-Party Formal Signature Blocks */}
        {renderSignatureBlocks()}
      </View>
    );
  }

  // 2. LOGISTICS & FULFILLMENT (Delivery Note)
  if (dt === 'delivery_note') {
    return (
      <View style={{ marginTop: 10 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Dispatch & Carrier Details</Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Dispatch Date</Text>
              <Text style={styles.valueBold}>{sd.dispatchDate || document.issueDate}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Carrier / Courier</Text>
              <Text style={styles.valueBold}>{sd.carrierName || 'In-House Delivery'}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Vehicle Reg / Tracking #</Text>
              <Text style={styles.valueBold}>{sd.vehicleReg || 'N/A'}</Text>
            </View>
          </View>

          {sd.deliveryAddress ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Delivery Address & Instructions</Text>
              <Text style={styles.bodyText}>{sd.deliveryAddress}</Text>
            </View>
          ) : null}

          {sd.handlingNotes ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Special Handling & Goods Inspection Instructions</Text>
              <Text style={styles.bodyText}>{sd.handlingNotes}</Text>
            </View>
          ) : null}
        </View>

        {/* Itemized Goods List (without price columns) */}
        <View style={styles.table}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Packing List & Quantities Delivered</Text>
          <View style={styles.tableHeader}>
            <View style={{ width: 30 }}><Text style={styles.tableHeaderCell}>#</Text></View>
            <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Item Description & Specs</Text></View>
            <View style={{ width: 80, textAlign: 'right' }}><Text style={styles.tableHeaderCell}>Qty Dispatched</Text></View>
            <View style={{ width: 80, textAlign: 'right' }}><Text style={styles.tableHeaderCell}>Qty Received</Text></View>
          </View>
          {document.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={{ width: 30 }}><Text style={styles.cellText}>{i + 1}</Text></View>
              <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
              <View style={{ width: 80, textAlign: 'right' }}><Text style={styles.cellText}>{item.quantity}</Text></View>
              <View style={{ width: 80, textAlign: 'right' }}><Text style={styles.cellText}>[   ]</Text></View>
            </View>
          ))}
        </View>

        {document.notes ? (
          <View style={{ marginBottom: 12, marginTop: 12 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 3 }]}>Additional Notes & Instructions</Text>
            <Text style={styles.bodyText}>{document.notes}</Text>
          </View>
        ) : null}

        {/* Proof of Delivery Block */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Proof of Delivery & Confirmation</Text>
          <Text style={{ fontSize: 8, color: '#4b5563', marginBottom: 12 }}>
            I hereby confirm that the goods listed above have been received in good condition and order.
          </Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Recipient Name (Printed)</Text>
              <Text style={styles.value}>{sd.recipientName || contact.name}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Recipient Signature & Stamp</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 24, marginTop: 4 }} />
            </View>
          </View>
        </View>

        {renderSignatureBlocks()}
      </View>
    );
  }

  // 3. PROCUREMENT (Purchase Order)
  if (dt === 'purchase_order') {
    return (
      <View style={{ marginTop: 10 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Vendor Procurement Reference</Text>
          <View style={styles.grid3}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Vendor Quote Ref #</Text>
              <Text style={styles.valueBold}>{sd.vendorRef || 'N/A'}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Requisition #</Text>
              <Text style={styles.valueBold}>{sd.requisitionNo || 'N/A'}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Expected Delivery Date</Text>
              <Text style={styles.valueBold}>{sd.expectedDeliveryDate || document.dueDate || 'ASAP'}</Text>
            </View>
          </View>
          {sd.shippingAddress ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Ship To Location</Text>
              <Text style={styles.bodyText}>{sd.shippingAddress}</Text>
            </View>
          ) : null}

          {sd.qualityRequirements ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Quality Assurance & Packing Standards</Text>
              <Text style={styles.bodyText}>{sd.qualityRequirements}</Text>
            </View>
          ) : null}
        </View>

        {/* Financial Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Item Description & Part #</Text></View>
            <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
            <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Unit Price</Text></View>
            <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
          </View>
          {document.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
              <View style={styles.colQty}><Text style={styles.cellText}>{item.quantity}</Text></View>
              <View style={styles.colUnit}><Text style={styles.cellText}>{item.unitPrice}</Text></View>
              <View style={styles.colTotal}><Text style={styles.cellText}>{item.lineTotal}</Text></View>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{document.subtotal}</Text>
          </View>
          {document.tax ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{document.tax}</Text>
            </View>
          ) : null}
          <View style={[styles.grandRow, { borderTopColor: themeColor }]}>
            <Text style={[styles.grandLabel, { color: themeColor }]}>Total PO Value</Text>
            <Text style={[styles.grandValue, { color: themeColor }]}>{document.total}</Text>
          </View>
        </View>

        {sd.authorizedBy ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Management Authorization</Text>
            <Text style={styles.valueBold}>Approved By: {sd.authorizedBy}</Text>
          </View>
        ) : null}

        {renderSignatureBlocks()}
      </View>
    );
  }

  // 4. FINANCIAL ADJUSTMENTS (Credit Note, Debit Note)
  if (['credit_note', 'debit_note'].includes(dt)) {
    return (
      <View style={{ marginTop: 10 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Original Billing Adjustment Reference</Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Original Invoice #</Text>
              <Text style={styles.valueBold}>{sd.originalInvoiceNumber || 'N/A'}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Original Invoice Date</Text>
              <Text style={styles.valueBold}>{sd.originalInvoiceDate || 'N/A'}</Text>
            </View>
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.label}>Reason for Adjustment</Text>
            <Text style={styles.bodyText}>{sd.reasonForAdjustment || 'Billing Correction / Service Credit'}</Text>
          </View>
          {sd.adjustmentNotes ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Audit Notes / Explanation</Text>
              <Text style={styles.bodyText}>{sd.adjustmentNotes}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Adjustment Description</Text></View>
            <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
            <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Credit Amount</Text></View>
            <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
          </View>
          {document.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
              <View style={styles.colQty}><Text style={styles.cellText}>{item.quantity}</Text></View>
              <View style={styles.colUnit}><Text style={styles.cellText}>{item.unitPrice}</Text></View>
              <View style={styles.colTotal}><Text style={styles.cellText}>{item.lineTotal}</Text></View>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={[styles.grandRow, { borderTopColor: themeColor }]}>
            <Text style={[styles.grandLabel, { color: themeColor }]}>
              Total {dt === 'credit_note' ? 'Credit Amount' : 'Debit Amount'}
            </Text>
            <Text style={[styles.grandValue, { color: themeColor }]}>{document.total}</Text>
          </View>
        </View>

        {renderSignatureBlocks()}
      </View>
    );
  }

  // 5. PROJECT & PROPOSALS (Statement of Work, Proposal)
  if (['statement_of_work', 'proposal'].includes(dt)) {
    return (
      <View style={{ marginTop: 10 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>
            {dt === 'proposal' ? 'Commercial Proposal Overview' : 'Project SOW Overview'}
          </Text>
          {(sd.sowTitle || sd.proposalTitle || sd.completionDate || sd.validityPeriod) ? (
            <View style={[styles.grid2, { marginBottom: 6 }]}>
              {(sd.sowTitle || sd.proposalTitle) ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Title / Objective</Text>
                  <Text style={styles.valueBold}>{sd.sowTitle || sd.proposalTitle}</Text>
                </View>
              ) : null}
              {sd.completionDate ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Target Completion Date</Text>
                  <Text style={styles.valueBold}>{sd.completionDate}</Text>
                </View>
              ) : null}
              {sd.validityPeriod ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Proposal Validity Period</Text>
                  <Text style={styles.valueBold}>{sd.validityPeriod}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {sd.executiveSummary ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Executive Summary & Proposed Solution</Text>
              <Text style={styles.bodyText}>{sd.executiveSummary}</Text>
            </View>
          ) : null}

          {sd.deliverables ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Key Deliverables & Objectives</Text>
              <Text style={styles.bodyText}>{sd.deliverables}</Text>
            </View>
          ) : null}

          {sd.timeline ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Implementation Methodology & Project Timeline</Text>
              <Text style={styles.bodyText}>{sd.timeline}</Text>
            </View>
          ) : null}

          {sd.assumptions ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Key Assumptions & Prerequisites</Text>
              <Text style={styles.bodyText}>{sd.assumptions}</Text>
            </View>
          ) : null}
        </View>

        {/* Line items if available */}
        {document.hasItems ? (
          <View style={styles.table}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Investment & Financial Scope</Text>
            <View style={styles.tableHeader}>
              <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Scope / Milestone Description</Text></View>
              <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
              <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Price</Text></View>
              <View style={styles.colTotal}><Text style={styles.tableHeaderCell}>Total</Text></View>
            </View>
            {document.lineItems.map((item, i) => (
              <View key={i} style={styles.tableRow}>
                <View style={styles.colDesc}><Text style={styles.cellText}>{item.description}</Text></View>
                <View style={styles.colQty}><Text style={styles.cellText}>{item.quantity}</Text></View>
                <View style={styles.colUnit}><Text style={styles.cellText}>{item.unitPrice}</Text></View>
                <View style={styles.colTotal}><Text style={styles.cellText}>{item.lineTotal}</Text></View>
              </View>
            ))}
          </View>
        ) : null}

        {renderSignatureBlocks()}
      </View>
    );
  }

  // 6. DEFAULT COMMERCIAL / FINANCIAL (Invoice, Quotation, Receipt, Wholesale Catalog, Account Statement, Expense Report)
  return (
    <View style={{ marginTop: 10 }}>
      {document.hasItems ? (
        <>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Description</Text></View>
              <View style={styles.colQty}><Text style={styles.tableHeaderCell}>Qty</Text></View>
              <View style={styles.colUnit}><Text style={styles.tableHeaderCell}>Unit Price</Text></View>
              {document.hasDiscounts ? (
                <View style={styles.colDiscount}><Text style={styles.tableHeaderCell}>Discount</Text></View>
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

      {renderSignatureBlocks()}
    </View>
  );
}
