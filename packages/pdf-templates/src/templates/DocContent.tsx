// @ts-nocheck
import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateProps } from './types';

const styles = StyleSheet.create({
  card: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  cardTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#374151', letterSpacing: 0.5, marginBottom: 6 },
  grid2: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  grid3: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  fieldBlock: { flex: 1 },
  label: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 9, color: '#111827', lineHeight: 1.4 },
  valueBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  textBlock: { marginTop: 6 },
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
  twoPartyRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  partySigBlock: { width: '45%' },
  sigTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 4 },
  sigImageContainer: { height: 38, justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 2 },
  sigImage: { maxHeight: 36, width: 120, objectFit: 'contain' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', width: '100%', marginBottom: 4 },
  sigSub: { fontSize: 7.5, color: '#6b7280', marginTop: 2 },
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
            <View style={styles.sigImageContainer}>
              {business.signatureUrl ? (
                <Image src={business.signatureUrl} style={styles.sigImage} />
              ) : null}
            </View>
            <View style={styles.sigLine} />
            <Text style={styles.sigSub}>Authorized Signature &amp; Date</Text>
          </View>
        ) : <View style={styles.partySigBlock} />}

        {showClient ? (
          <View style={styles.partySigBlock}>
            <Text style={styles.sigTitle}>{contact.name || 'Client / Counterparty'}</Text>
            <View style={styles.sigImageContainer}>
              {document.clientSignatureUrl ? (
                <Image src={document.clientSignatureUrl} style={styles.sigImage} />
              ) : null}
            </View>
            <View style={styles.sigLine} />
            <Text style={styles.sigSub}>Client Signature &amp; Date</Text>
          </View>
        ) : <View style={styles.partySigBlock} />}
      </View>
    );
  };

  const renderOptionalClausesAndCustomFields = () => {
    return (
      <>
        {sd.limitationOfLiability ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Limitation of Liability Cap</Text>
            <Text style={styles.bodyText}>{sd.limitationOfLiability}</Text>
          </View>
        ) : null}

        {sd.disputeResolution ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Dispute Resolution &amp; Arbitration Forum</Text>
            <Text style={styles.bodyText}>{sd.disputeResolution}</Text>
          </View>
        ) : null}

        {sd.nonSolicitation ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Non-Solicitation &amp; Non-Compete</Text>
            <Text style={styles.bodyText}>{sd.nonSolicitation}</Text>
          </View>
        ) : null}

        {sd.insuranceCoverage ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Insurance Coverage Requirements</Text>
            <Text style={styles.bodyText}>{sd.insuranceCoverage}</Text>
          </View>
        ) : null}

        {sd.subcontractingRules ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Subcontracting &amp; Sub-Processors Protocol</Text>
            <Text style={styles.bodyText}>{sd.subcontractingRules}</Text>
          </View>
        ) : null}

        {sd.nonCircumvention ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Non-Circumvention Provisions</Text>
            <Text style={styles.bodyText}>{sd.nonCircumvention}</Text>
          </View>
        ) : null}

        {sd.equitableRelief ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Equitable Relief &amp; Injunction Rights</Text>
            <Text style={styles.bodyText}>{sd.equitableRelief}</Text>
          </View>
        ) : null}

        {sd.acceptanceTesting ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Acceptance Testing &amp; Sign-off Protocol</Text>
            <Text style={styles.bodyText}>{sd.acceptanceTesting}</Text>
          </View>
        ) : null}

        {sd.warrantyPeriod ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Warranty Period &amp; Defect Remediation</Text>
            <Text style={styles.bodyText}>{sd.warrantyPeriod}</Text>
          </View>
        ) : null}

        {sd.retainageDeposit ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Retainage / Performance Security Deposit</Text>
            <Text style={styles.bodyText}>{sd.retainageDeposit}</Text>
          </View>
        ) : null}

        {sd.changeOrderGovernance ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Change Order Governance Protocol</Text>
            <Text style={styles.bodyText}>{sd.changeOrderGovernance}</Text>
          </View>
        ) : null}

        {sd.batchNumber ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Batch / Lot # &amp; Expiry Tracking</Text>
            <Text style={styles.bodyText}>{sd.batchNumber}</Text>
          </View>
        ) : null}

        {sd.temperatureSpec ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Cold Chain &amp; Climate Control Specifications</Text>
            <Text style={styles.bodyText}>{sd.temperatureSpec}</Text>
          </View>
        ) : null}

        {sd.incoterms ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Incoterms Shipping Terms</Text>
            <Text style={styles.bodyText}>{sd.incoterms}</Text>
          </View>
        ) : null}

        {sd.inspectionWindow ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Goods Inspection &amp; Rejection Terms</Text>
            <Text style={styles.bodyText}>{sd.inspectionWindow}</Text>
          </View>
        ) : null}

        {/* Industry Custom Key-Value Attributes */}
        {sd.customKeyValuePairs && Array.isArray(sd.customKeyValuePairs) && sd.customKeyValuePairs.length > 0 ? (
          <View style={[styles.card, { marginBottom: 10 }]}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Custom Industry Specifications</Text>
            <View style={styles.grid2}>
              {sd.customKeyValuePairs.map((pair: any, idx: number) => (
                pair.key && pair.value ? (
                  <View key={idx} style={styles.fieldBlock}>
                    <Text style={styles.label}>{pair.key}</Text>
                    <Text style={styles.valueBold}>{pair.value}</Text>
                  </View>
                ) : null
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  };

  // 1. LEGAL & AGREEMENTS (NDA, Contract, MSA, Service Agreement)
  if (['nda', 'contract', 'msa', 'service_agreement'].includes(dt)) {
    const isNda = dt === 'nda';
    return (
      <View style={{ marginTop: 6 }}>
        {/* Parties Header Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Parties &amp; Agreement Terms</Text>
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
          {(sd.contractTitle || sd.contractValue || sd.noticePeriod || sd.paymentTermDays || sd.ipOwnership || sd.slaCommitments) ? (
            <View style={[styles.grid3, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' }]}>
              {sd.contractTitle ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Contract Title</Text>
                  <Text style={styles.valueBold}>{sd.contractTitle}</Text>
                </View>
              ) : null}
              {sd.noticePeriod ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Termination Notice</Text>
                  <Text style={styles.valueBold}>{sd.noticePeriod}</Text>
                </View>
              ) : null}
              {sd.paymentTermDays ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Payment Terms</Text>
                  <Text style={styles.valueBold}>Net {sd.paymentTermDays} Days</Text>
                </View>
              ) : null}
              {sd.ipOwnership ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>IP Rights Ownership</Text>
                  <Text style={styles.valueBold}>{sd.ipOwnership}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Clauses & Content */}
        {sd.disclosurePurpose || sd.purposeOfDisclosure ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Purpose of Disclosure</Text>
            <Text style={styles.bodyText}>{sd.disclosurePurpose || sd.purposeOfDisclosure}</Text>
          </View>
        ) : null}

        {sd.permittedDisclosures ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Permitted Disclosures &amp; Standard Exclusions</Text>
            <Text style={styles.bodyText}>{sd.permittedDisclosures}</Text>
          </View>
        ) : null}

        {sd.scopeOfWork ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Scope of Work &amp; Services</Text>
            <Text style={styles.bodyText}>{sd.scopeOfWork}</Text>
          </View>
        ) : null}

        {sd.slaCommitments || sd.serviceSla || sd.serviceLevelAgreement ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Service Level Commitments (SLA)</Text>
            <Text style={styles.bodyText}>{sd.slaCommitments || sd.serviceSla || sd.serviceLevelAgreement}</Text>
          </View>
        ) : null}

        {sd.prerequisites ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Client Prerequisites &amp; Dependencies</Text>
            <Text style={styles.bodyText}>{sd.prerequisites}</Text>
          </View>
        ) : null}

        {sd.paymentSchedule ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Payment Schedule &amp; Milestones</Text>
            <Text style={styles.bodyText}>{sd.paymentSchedule}</Text>
          </View>
        ) : null}

        {sd.governingLaw ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Governing Law &amp; Jurisdiction</Text>
            <Text style={styles.bodyText}>{sd.governingLaw}</Text>
          </View>
        ) : null}

        {/* Optional Enterprise Clauses & Custom Key-Value Attributes */}
        {renderOptionalClausesAndCustomFields()}

        {/* Custom Sections / Clauses */}
        {document.sections && document.sections.length > 0 ? (
          document.sections.map((sec, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>{sec.heading}</Text>
              <Text style={styles.bodyText}>{sec.body}</Text>
            </View>
          ))
        ) : null}

        {document.notes ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Special Notes &amp; Instructions</Text>
            <Text style={styles.bodyText}>{document.notes}</Text>
          </View>
        ) : null}

        {document.terms ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Standard Conditions &amp; Compliance</Text>
            <Text style={styles.bodyText}>{document.terms}</Text>
          </View>
        ) : null}

        {/* Financial Consideration & Fees Table (Multiple Products/Services) */}
        {document.lineItems && document.lineItems.length > 0 ? (
          <View style={styles.table}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Financial Consideration &amp; Fees</Text>
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

        {renderSignatureBlocks()}
      </View>
    );
  }

  // 2. LOGISTICS & FULFILLMENT (Delivery Note)
  if (dt === 'delivery_note') {
    return (
      <View style={{ marginTop: 6 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Dispatch &amp; Carrier Details</Text>
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
              <Text style={styles.label}>Delivery Address &amp; Instructions</Text>
              <Text style={styles.bodyText}>{sd.deliveryAddress}</Text>
            </View>
          ) : null}
        </View>

        {renderOptionalClausesAndCustomFields()}

        {/* Itemized Goods List */}
        {document.lineItems && document.lineItems.length > 0 ? (
          <View style={styles.table}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Packing List &amp; Quantities Delivered</Text>
            <View style={styles.tableHeader}>
              <View style={{ width: 30 }}><Text style={styles.tableHeaderCell}>#</Text></View>
              <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Item Description &amp; Specs</Text></View>
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
        ) : null}

        {document.notes ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.cardTitle, { color: themeColor, marginBottom: 2 }]}>Additional Notes &amp; Instructions</Text>
            <Text style={styles.bodyText}>{document.notes}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { marginTop: 10 }]}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Proof of Delivery &amp; Confirmation</Text>
          <Text style={{ fontSize: 8, color: '#4b5563', marginBottom: 8 }}>
            I hereby confirm that the goods listed above have been received in good condition and order.
          </Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Recipient Name (Printed)</Text>
              <Text style={styles.value}>{sd.recipientName || contact.name}</Text>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Recipient Signature &amp; Stamp</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 20, marginTop: 2 }} />
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
      <View style={{ marginTop: 6 }}>
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
        </View>

        {renderOptionalClausesAndCustomFields()}

        {/* Financial Table */}
        {document.lineItems && document.lineItems.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <View style={styles.colDesc}><Text style={styles.tableHeaderCell}>Item Description &amp; Part #</Text></View>
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
          <View style={{ marginTop: 10 }}>
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
      <View style={{ marginTop: 6 }}>
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
        </View>

        {renderOptionalClausesAndCustomFields()}

        {document.lineItems && document.lineItems.length > 0 ? (
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
        ) : null}

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
      <View style={{ marginTop: 6 }}>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>
            {dt === 'proposal' ? 'Commercial Proposal Overview' : 'Project SOW Overview'}
          </Text>
          {(sd.sowTitle || sd.proposalTitle || sd.completionDate || sd.validityDays) ? (
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
              {sd.validityDays ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Proposal Validity Window</Text>
                  <Text style={styles.valueBold}>{sd.validityDays} Days</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {sd.executiveSummary ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Executive Summary &amp; Proposed Solution</Text>
              <Text style={styles.bodyText}>{sd.executiveSummary}</Text>
            </View>
          ) : null}

          {sd.deliverables ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Key Deliverables &amp; Objectives</Text>
              <Text style={styles.bodyText}>{sd.deliverables}</Text>
            </View>
          ) : null}

          {sd.assumptions ? (
            <View style={styles.textBlock}>
              <Text style={styles.label}>Key Assumptions &amp; Prerequisites</Text>
              <Text style={styles.bodyText}>{sd.assumptions}</Text>
            </View>
          ) : null}
        </View>

        {renderOptionalClausesAndCustomFields()}

        {/* Investment & Financial Scope Table (Multiple Products/Services) */}
        {document.lineItems && document.lineItems.length > 0 ? (
          <View style={styles.table}>
            <Text style={[styles.cardTitle, { color: themeColor }]}>Investment &amp; Financial Scope</Text>
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
    <View style={{ marginTop: 6 }}>
      {(sd.paymentTerms || sd.sellerTaxId || sd.clientTaxId || sd.bankDetails || sd.mobileMoneyDetails) ? (
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColor }]}>Commercial &amp; Settlement Terms</Text>
          <View style={styles.grid3}>
            {sd.paymentTerms ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Payment Terms</Text>
                <Text style={styles.valueBold}>{sd.paymentTerms}</Text>
              </View>
            ) : null}
            {sd.sellerTaxId ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Seller TPIN / Tax ID</Text>
                <Text style={styles.valueBold}>{sd.sellerTaxId}</Text>
              </View>
            ) : null}
            {sd.clientTaxId ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Client Tax ID / VAT</Text>
                <Text style={styles.valueBold}>{sd.clientTaxId}</Text>
              </View>
            ) : null}
          </View>

          {(sd.bankDetails || sd.mobileMoneyDetails) ? (
            <View style={[styles.grid2, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb' }]}>
              {sd.bankDetails ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Bank Settlement Account</Text>
                  <Text style={styles.valueBold}>{sd.bankDetails}</Text>
                </View>
              ) : null}
              {sd.mobileMoneyDetails ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Mobile Money Paybill</Text>
                  <Text style={styles.valueBold}>{sd.mobileMoneyDetails}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {renderOptionalClausesAndCustomFields()}

      {/* Commercial Line Items Table (Multiple Products) */}
      {document.lineItems && document.lineItems.length > 0 ? (
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
