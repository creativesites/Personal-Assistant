'use client'

import React from 'react'
import {
  Truck, Calendar, FileText, Building2, ShieldCheck, Scale, DollarSign, BookOpen, User, Tag, Sparkles
} from 'lucide-react'

export type DocType =
  | 'invoice' | 'quotation' | 'receipt' | 'purchase_order' | 'credit_note'
  | 'debit_note' | 'delivery_note' | 'catalog' | 'proposal' | 'contract'
  | 'statement_of_work' | 'service_agreement' | 'nda' | 'msa'
  | 'account_statement' | 'expense_report'

interface DynamicDocFieldsProps {
  docType: DocType
  values: Record<string, any>
  onChange: (key: string, val: any) => void
}

function Field({
  label,
  children,
  half,
  templateText,
  onApplyTemplate,
  hint,
}: {
  label: string
  children: React.ReactNode
  half?: boolean
  templateText?: string
  onApplyTemplate?: (text: string) => void
  hint?: string
}) {
  return (
    <div className={half ? 'flex-1 min-w-0 space-y-1' : 'w-full space-y-1'}>
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-extrabold text-gray-600 uppercase tracking-wide">
          {label}
        </label>
        {templateText && onApplyTemplate && (
          <button
            type="button"
            onClick={() => onApplyTemplate(templateText)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Load Professional Template</span>
          </button>
        )}
      </div>
      {children}
      {hint && <p className="text-[10px] text-gray-400 leading-tight">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white font-medium'
const selectCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all font-medium'
const textareaCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white resize-y font-normal leading-relaxed'

export function DynamicDocFields({ docType, values, onChange }: DynamicDocFieldsProps) {
  switch (docType) {
    case 'delivery_note':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Truck className="w-4.5 h-4.5 text-indigo-500" />
            <span>Delivery & Dispatch Specification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Dispatch Date">
              <input type="date" className={inputCls} value={values.dispatchDate || ''} onChange={e => onChange('dispatchDate', e.target.value)} />
            </Field>

            <Field label="Carrier / Courier Name">
              <input type="text" placeholder="e.g. DHL Express / In-House Logistics Team" className={inputCls} value={values.carrierName || ''} onChange={e => onChange('carrierName', e.target.value)} />
            </Field>

            <Field label="Vehicle Reg / Tracking #">
              <input type="text" placeholder="e.g. Waybill #9948201 / Vehicle AB 123 CD" className={inputCls} value={values.vehicleReg || ''} onChange={e => onChange('vehicleReg', e.target.value)} />
            </Field>

            <Field label="Recipient / Driver Name">
              <input type="text" placeholder="e.g. John Mwansa (Receiving Manager)" className={inputCls} value={values.recipientName || ''} onChange={e => onChange('recipientName', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Full Delivery Address & Unloading Site"
            templateText="Unit 4B, Central Logistics Park, Great East Road, Lusaka, Zambia.\nGate Entry Code: 4810.\nAttn: Receiving Warehouse Manager."
            onApplyTemplate={text => onChange('deliveryAddress', text)}
          >
            <textarea
              rows={4}
              placeholder="Full delivery location, warehouse gate info, and unloading instructions..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.deliveryAddress || ''}
              onChange={e => onChange('deliveryAddress', e.target.value)}
            />
          </Field>

          <Field
            label="Special Handling & Goods Inspection Instructions"
            templateText="1. Please inspect all packages for exterior damage before signing.\n2. Temperature-sensitive items must be transferred to cold storage immediately upon arrival.\n3. Discrepancies must be reported within 24 hours of delivery."
            onApplyTemplate={text => onChange('handlingNotes', text)}
          >
            <textarea
              rows={4}
              placeholder="Inspection checklist, fragile handling notes, or delivery sign-off terms..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.handlingNotes || ''}
              onChange={e => onChange('handlingNotes', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'purchase_order':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Building2 className="w-4.5 h-4.5 text-indigo-500" />
            <span>Vendor Procurement & Shipping Authorization</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Expected Delivery Date">
              <input type="date" className={inputCls} value={values.expectedDeliveryDate || ''} onChange={e => onChange('expectedDeliveryDate', e.target.value)} />
            </Field>

            <Field label="Vendor Quotation Ref #">
              <input type="text" placeholder="e.g. QT-2026-8839" className={inputCls} value={values.vendorRef || ''} onChange={e => onChange('vendorRef', e.target.value)} />
            </Field>

            <Field label="Internal Requisition #">
              <input type="text" placeholder="e.g. REQ-2026-004" className={inputCls} value={values.requisitionNo || ''} onChange={e => onChange('requisitionNo', e.target.value)} />
            </Field>

            <Field label="Authorized Purchasing Manager">
              <input type="text" placeholder="e.g. Sarah Phiri (Procurement Director)" className={inputCls} value={values.authorizedBy || ''} onChange={e => onChange('authorizedBy', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Ship-To Address & Receiving Contact"
            templateText="Zuri Technologies Central Warehouse, Plot 1024 Commercial Zone, Lusaka, Zambia.\nAttn: Procurement Receiving Department."
            onApplyTemplate={text => onChange('shippingAddress', text)}
          >
            <textarea
              rows={4}
              placeholder="Ship-to address, warehouse contact details..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.shippingAddress || ''}
              onChange={e => onChange('shippingAddress', e.target.value)}
            />
          </Field>

          <Field
            label="Quality Assurance & Packing Standards"
            templateText="1. All goods must be accompanied by a Certificate of Analysis / Conformance.\n2. Products must have at least 12 months remaining shelf life upon delivery.\n3. Non-conforming deliveries will be returned at vendor's expense."
            onApplyTemplate={text => onChange('qualityRequirements', text)}
          >
            <textarea
              rows={4}
              placeholder="Packing standards, inspection terms, or compliance certifications required..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.qualityRequirements || ''}
              onChange={e => onChange('qualityRequirements', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'credit_note':
    case 'debit_note':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Tag className="w-4.5 h-4.5 text-indigo-500" />
            <span>Adjustment Reference & Billing Audit</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Original Invoice Number">
              <input type="text" placeholder="e.g. INV-10293" className={inputCls} value={values.originalInvoiceNumber || ''} onChange={e => onChange('originalInvoiceNumber', e.target.value)} />
            </Field>

            <Field label="Original Invoice Date">
              <input type="date" className={inputCls} value={values.originalInvoiceDate || ''} onChange={e => onChange('originalInvoiceDate', e.target.value)} />
            </Field>
          </div>

          <Field label="Reason for Billing Adjustment">
            <select className={selectCls} value={values.reasonForAdjustment || 'Billing Correction'} onChange={e => onChange('reasonForAdjustment', e.target.value)}>
              <option value="Billing Correction">Billing Correction / Overcharge Adjustment</option>
              <option value="Returned Goods">Returned Goods / Damaged Delivery Refund</option>
              <option value="Discount Credit">Promotional Discount Credit / Goodwill Adjustment</option>
              <option value="Service Credit">Service Interruption / SLA Downtime Credit</option>
              <option value="Supplemental Charge">Supplemental Charge / Additional Deliverables</option>
              <option value="Other">Other Adjustment Reason</option>
            </select>
          </Field>

          <Field
            label="Detailed Audit Explanation & Background Notes"
            templateText="Adjustment issued following reconciliation of Invoice #10293. Reflects agreed 15% SLA downtime credit for June 2026 infrastructure services."
            onApplyTemplate={text => onChange('adjustmentNotes', text)}
          >
            <textarea
              rows={4}
              placeholder="Provide background context, customer communication reference, or accounting notes..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.adjustmentNotes || ''}
              onChange={e => onChange('adjustmentNotes', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'nda':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <ShieldCheck className="w-4.5 h-4.5 text-indigo-500" />
            <span>Confidentiality & Non-Disclosure Specifications</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Agreement Structure">
              <select className={selectCls} value={values.agreementType || 'bilateral'} onChange={e => onChange('agreementType', e.target.value)}>
                <option value="bilateral">Bilateral (Mutual Protection — both parties disclose)</option>
                <option value="unilateral">Unilateral (One-Way Disclosure — company discloses to client)</option>
              </select>
            </Field>

            <Field label="Effective Start Date">
              <input type="date" className={inputCls} value={values.effectiveDate || ''} onChange={e => onChange('effectiveDate', e.target.value)} />
            </Field>

            <Field label="Confidentiality Period (Years)">
              <input type="number" placeholder="2" min="1" max="10" className={inputCls} value={values.confidentialityYears || 2} onChange={e => onChange('confidentialityYears', parseInt(e.target.value) || 2)} />
            </Field>

            <Field label="Governing Law & Jurisdiction">
              <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || 'Republic of Zambia'} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Purpose of Disclosure & Business Discussion Scope"
            templateText="To evaluate potential joint venture opportunities, technical integration of AI relationship software systems, commercial partnerships, and exchange proprietary architectural blueprints."
            onApplyTemplate={text => onChange('disclosurePurpose', text)}
            hint="Specify the commercial or technical evaluation purpose for exchanging confidential material."
          >
            <textarea
              rows={5}
              placeholder="Describe business discussions, product evaluation scope, or project exploration..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.disclosurePurpose || ''}
              onChange={e => onChange('disclosurePurpose', e.target.value)}
            />
          </Field>

          <Field
            label="Permitted Disclosures & Standard Exclusions"
            templateText="Confidential Information shall not include information that: (a) is or becomes publicly available through no fault of Receiving Party; (b) was already known prior to disclosure; (c) is independently developed without reference to Disclosing Party's materials; or (d) is required to be disclosed by law or court order."
            onApplyTemplate={text => onChange('permittedDisclosures', text)}
          >
            <textarea
              rows={5}
              placeholder="Standard exclusions, permitted disclosures to legal/financial advisors..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.permittedDisclosures || ''}
              onChange={e => onChange('permittedDisclosures', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'contract':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Scale className="w-4.5 h-4.5 text-indigo-500" />
            <span>Formal Contract Terms & Deliverables Specification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Contract Title">
              <input type="text" placeholder="e.g. Master Software Development Contract" className={inputCls} value={values.contractTitle || ''} onChange={e => onChange('contractTitle', e.target.value)} />
            </Field>

            <Field label="Commencement Date">
              <input type="date" className={inputCls} value={values.startDate || ''} onChange={e => onChange('startDate', e.target.value)} />
            </Field>

            <Field label="Expiry / Termination Date">
              <input type="date" className={inputCls} value={values.endDate || ''} onChange={e => onChange('endDate', e.target.value)} />
            </Field>

            <Field label="Total Contract Consideration Value">
              <input type="text" placeholder="e.g. ZMW 150,000 / $10,000 Total" className={inputCls} value={values.contractValue || ''} onChange={e => onChange('contractValue', e.target.value)} />
            </Field>

            <Field label="Governing Jurisdiction">
              <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || 'Republic of Zambia'} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>

            <Field label="Termination Notice Period">
              <input type="text" placeholder="e.g. 30 days prior written notice" className={inputCls} value={values.noticePeriod || '30 days written notice'} onChange={e => onChange('noticePeriod', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Detailed Scope of Work & Key Deliverables"
            templateText="1. System Architecture & Technical Specifications Specification.\n2. Full-Stack Application Engineering (Next.js 15, FastAPI, Fastify, PostgreSQL).\n3. Third-Party Integration & User Acceptance Testing (UAT).\n4. Production Deployment & 60-Day Post-Launch Technical Support."
            onApplyTemplate={text => onChange('scopeSummary', text)}
            hint="Provide a comprehensive breakdown of project scope, technical milestones, and responsibilities."
          >
            <textarea
              rows={6}
              placeholder="Detailed contract scope, technical deliverables, milestones, and obligations..."
              className={`${textareaCls} min-h-[150px]`}
              value={values.scopeSummary || ''}
              onChange={e => onChange('scopeSummary', e.target.value)}
            />
          </Field>

          <Field
            label="Payment Milestones & Commercial Conditions"
            templateText="• Milestone 1: 30% Deposit upon Contract Signing.\n• Milestone 2: 40% upon Successful UAT Sign-off.\n• Milestone 3: 30% upon Final Production Go-Live.\nAll invoices payable within 14 calendar days of issuance."
            onApplyTemplate={text => onChange('paymentMilestones', text)}
          >
            <textarea
              rows={5}
              placeholder="Payment schedules, deposit requirements, late interest terms..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.paymentMilestones || ''}
              onChange={e => onChange('paymentMilestones', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'statement_of_work':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <FileText className="w-4.5 h-4.5 text-indigo-500" />
            <span>Statement of Work (SOW) Scope & Milestones</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="SOW Project Title">
              <input type="text" placeholder="e.g. Mobile App Engineering SOW #1" className={inputCls} value={values.sowTitle || ''} onChange={e => onChange('sowTitle', e.target.value)} />
            </Field>

            <Field label="Target Completion Date">
              <input type="date" className={inputCls} value={values.completionDate || ''} onChange={e => onChange('completionDate', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Project Objectives & Technical Deliverables"
            templateText="• Phase 1: UX/UI Design Systems & Interactive Prototypes.\n• Phase 2: Core Frontend Development & API Endpoint Construction.\n• Phase 3: Security Hardening, Load Testing & Production Deployment."
            onApplyTemplate={text => onChange('deliverables', text)}
          >
            <textarea
              rows={6}
              placeholder="Itemize main project deliverables, milestones, and technical acceptance criteria..."
              className={`${textareaCls} min-h-[150px]`}
              value={values.deliverables || ''}
              onChange={e => onChange('deliverables', e.target.value)}
            />
          </Field>

          <Field
            label="Key Assumptions, Exclusions & Client Dependencies"
            templateText="1. Client will provide API keys and brand assets within 5 business days of kickoff.\n2. Out of scope: Third-party payment gateway transaction fees.\n3. Content and copywriting supplied by Client."
            onApplyTemplate={text => onChange('assumptions', text)}
          >
            <textarea
              rows={5}
              placeholder="List project assumptions, out-of-scope items, client prerequisites..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.assumptions || ''}
              onChange={e => onChange('assumptions', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'proposal':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <BookOpen className="w-4.5 h-4.5 text-indigo-500" />
            <span>Commercial Proposal Strategy & Pitch</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Proposal Title">
              <input type="text" placeholder="e.g. Enterprise Cloud Infrastructure Proposal" className={inputCls} value={values.proposalTitle || ''} onChange={e => onChange('proposalTitle', e.target.value)} />
            </Field>

            <Field label="Proposal Validity Period">
              <input type="text" placeholder="e.g. Valid for 30 calendar days" className={inputCls} value={values.validityPeriod || 'Valid for 30 days'} onChange={e => onChange('validityPeriod', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Executive Summary & Strategic Solution"
            templateText="Executive Summary:\nOur team proposes an integrated AI relationship management platform designed to automate client communications, streamline invoicing, and scale customer engagement. This solution addresses current workflow bottlenecks and accelerates revenue growth."
            onApplyTemplate={text => onChange('executiveSummary', text)}
          >
            <textarea
              rows={6}
              placeholder="Overview of client challenges, proposed strategy, and high-level ROI..."
              className={`${textareaCls} min-h-[150px]`}
              value={values.executiveSummary || ''}
              onChange={e => onChange('executiveSummary', e.target.value)}
            />
          </Field>

          <Field
            label="Implementation Methodology & Project Timeline"
            templateText="• Week 1-2: Discovery & Architecture Review\n• Week 3-6: Development & System Integration\n• Week 7-8: Staff Training, Beta Testing & Go-Live"
            onApplyTemplate={text => onChange('timeline', text)}
          >
            <textarea
              rows={5}
              placeholder="Execution phases, estimated delivery schedule, and rollout milestones..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.timeline || ''}
              onChange={e => onChange('timeline', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'msa':
    case 'service_agreement':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Scale className="w-4.5 h-4.5 text-indigo-500" />
            <span>Master Service Framework & Terms</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Effective Start Date">
              <input type="date" className={inputCls} value={values.effectiveDate || ''} onChange={e => onChange('effectiveDate', e.target.value)} />
            </Field>

            <Field label="Governing Law">
              <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || 'Republic of Zambia'} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>

            <Field label="Payment Term (Days)">
              <input type="number" placeholder="30" className={inputCls} value={values.paymentTermDays || 30} onChange={e => onChange('paymentTermDays', parseInt(e.target.value) || 30)} />
            </Field>

            <Field label="Intellectual Property Ownership">
              <select className={selectCls} value={values.ipOwnership || 'client_owned'} onChange={e => onChange('ipOwnership', e.target.value)}>
                <option value="client_owned">Client Owned upon Full Payment</option>
                <option value="provider_owned">Provider Retains Proprietary Core Rights</option>
                <option value="shared">Joint / Shared Commercial License</option>
              </select>
            </Field>
          </div>

          <Field
            label="Service Level Commitments (SLA) & Support Standards"
            templateText="• Uptime Commitment: 99.9% Monthly Availability.\n• Priority 1 Issues: Initial Response within 1 Hour.\n• Standard Support Window: Monday-Friday 08:00 - 17:00 CAT."
            onApplyTemplate={text => onChange('slaCommitments', text)}
          >
            <textarea
              rows={5}
              placeholder="Uptime SLA, incident response times, maintenance windows..."
              className={`${textareaCls} min-h-[130px]`}
              value={values.slaCommitments || ''}
              onChange={e => onChange('slaCommitments', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'account_statement':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <DollarSign className="w-4.5 h-4.5 text-indigo-500" />
            <span>Account Statement Period & Ledger Balances</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Statement Period Start">
              <input type="date" className={inputCls} value={values.statementStart || ''} onChange={e => onChange('statementStart', e.target.value)} />
            </Field>

            <Field label="Statement Period End">
              <input type="date" className={inputCls} value={values.statementEnd || ''} onChange={e => onChange('statementEnd', e.target.value)} />
            </Field>

            <Field label="Opening Balance">
              <input type="number" step="0.01" placeholder="0.00" className={inputCls} value={values.openingBalance || ''} onChange={e => onChange('openingBalance', e.target.value)} />
            </Field>

            <Field label="Closing / Outstanding Balance">
              <input type="number" step="0.01" placeholder="0.00" className={inputCls} value={values.closingBalance || ''} onChange={e => onChange('closingBalance', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Remittance & Payment Reconciliation Instructions"
            templateText="Please remit overdue balances within 7 days. Reference your Account Number when making bank transfers or mobile money payments."
            onApplyTemplate={text => onChange('remittanceNotes', text)}
          >
            <textarea
              rows={4}
              placeholder="Remittance instructions, overdue aging warnings..."
              className={`${textareaCls} min-h-[110px]`}
              value={values.remittanceNotes || ''}
              onChange={e => onChange('remittanceNotes', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'expense_report':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <User className="w-4.5 h-4.5 text-indigo-500" />
            <span>Expense Reimbursement Claim Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Claimant Employee Name">
              <input type="text" placeholder="e.g. Jane Smith" className={inputCls} value={values.claimantName || ''} onChange={e => onChange('claimantName', e.target.value)} />
            </Field>

            <Field label="Department / Division">
              <input type="text" placeholder="e.g. Business Development / Sales" className={inputCls} value={values.department || ''} onChange={e => onChange('department', e.target.value)} />
            </Field>

            <Field label="Claim Period / Purpose">
              <input type="text" placeholder="e.g. Q3 Client Travel & Meals" className={inputCls} value={values.claimPeriod || ''} onChange={e => onChange('claimPeriod', e.target.value)} />
            </Field>

            <Field label="Manager Approval Ref">
              <input type="text" placeholder="e.g. Approved by Director" className={inputCls} value={values.approvalRef || ''} onChange={e => onChange('approvalRef', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    case 'catalog':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <BookOpen className="w-4.5 h-4.5 text-indigo-500" />
            <span>Wholesale Catalog & Tiered Pricing Rules</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Catalog Season / Edition">
              <input type="text" placeholder="e.g. 2026 Wholesale Edition" className={inputCls} value={values.catalogSeason || ''} onChange={e => onChange('catalogSeason', e.target.value)} />
            </Field>

            <Field label="Tier 1 Discount Label">
              <input type="text" placeholder="e.g. Standard Retail (1-10 Units)" className={inputCls} value={values.tier1Label || 'Tier 1 (1-10 Units)'} onChange={e => onChange('tier1Label', e.target.value)} />
            </Field>

            <Field label="Tier 2 Discount Label">
              <input type="text" placeholder="e.g. Bulk Tier (11-50 Units)" className={inputCls} value={values.tier2Label || 'Tier 2 (11-50 Units)'} onChange={e => onChange('tier2Label', e.target.value)} />
            </Field>

            <Field label="Tier 3 Discount Label">
              <input type="text" placeholder="e.g. Wholesale Master (50+ Units)" className={inputCls} value={values.tier3Label || 'Tier 3 (50+ Units)'} onChange={e => onChange('tier3Label', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    case 'invoice':
    case 'quotation':
    case 'receipt':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <DollarSign className="w-4.5 h-4.5 text-indigo-500" />
            <span>Billing & Payment Instructions</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Preferred Payment Method">
              <input type="text" placeholder="e.g. Direct Bank Wire / Airtel Money / MTN Money" className={inputCls} value={values.paymentMethod || ''} onChange={e => onChange('paymentMethod', e.target.value)} />
            </Field>

            <Field label="Transaction / PO Reference #">
              <input type="text" placeholder="e.g. PO-88492 / TXN-99301" className={inputCls} value={values.referenceNumber || ''} onChange={e => onChange('referenceNumber', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    default:
      return null
  }
}
