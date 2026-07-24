'use client'

import React, { useState } from 'react'
import {
  Truck, Calendar, FileText, Building2, ShieldCheck, Scale, DollarSign, BookOpen, User, Tag, Sparkles, Wrench, Layers, ChevronDown, ChevronUp
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

export function ServiceDetailsSection({
  values,
  onChange,
}: {
  values: Record<string, any>
  onChange: (key: string, val: any) => void
}) {
  const [open, setOpen] = useState(
    !!(values.serviceDuration || values.serviceSla || values.scopeOfWork || values.prerequisites || values.paymentSchedule)
  )

  return (
    <div className="bg-white rounded-2xl border border-purple-100 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-purple-50/60 to-white text-left hover:bg-purple-50/80 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-black text-purple-900 uppercase tracking-wider">
          <Wrench className="w-4 h-4 text-purple-600" />
          <span>Service &amp; Project Execution Specification</span>
          {(values.serviceDuration || values.serviceSla) && (
            <span className="bg-purple-200 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
              Configured
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-bold text-purple-600">
          <span>{open ? 'Hide Details' : 'Configure Service Details'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="p-4 border-t border-purple-100 space-y-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Field label="Service Duration / Billing Frequency">
              <input
                type="text"
                placeholder="e.g. Monthly Retainer, 6-Month Project, 2-Week Sprint"
                className={inputCls}
                value={values.serviceDuration || ''}
                onChange={e => onChange('serviceDuration', e.target.value)}
              />
            </Field>

            <Field label="Service Level Agreement (SLA)">
              <input
                type="text"
                placeholder="e.g. 99.9% Uptime, 24/7 Priority Support, 2h Incident SLA"
                className={inputCls}
                value={values.serviceSla || ''}
                onChange={e => onChange('serviceSla', e.target.value)}
              />
            </Field>

            <Field label="Execution Location / Mode">
              <select
                className={selectCls}
                value={values.executionMode || 'remote'}
                onChange={e => onChange('executionMode', e.target.value)}
              >
                <option value="remote">Remote Digital Delivery</option>
                <option value="onsite">On-Site Client Premises</option>
                <option value="hybrid">Hybrid Delivery</option>
              </select>
            </Field>
          </div>

          <Field
            label="Detailed Scope of Work & Deliverables"
            templateText="1. Project Discovery & Solution Architecture.\n2. Custom Web/Mobile App Engineering & API Integrations.\n3. Quality Assurance, Security Hardening & UAT Testing.\n4. Production Deployment & 30-Day Support Warranty."
            onApplyTemplate={text => onChange('scopeOfWork', text)}
          >
            <textarea
              rows={4}
              placeholder="Outline specific deliverables, milestones, or service modules..."
              className={textareaCls}
              value={values.scopeOfWork || ''}
              onChange={e => onChange('scopeOfWork', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field
              label="Client Prerequisites & Dependencies"
              templateText="1. Client will provide API keys and brand assets within 3 business days.\n2. Client designates a primary project coordinator for weekly reviews."
              onApplyTemplate={text => onChange('prerequisites', text)}
            >
              <textarea
                rows={3}
                placeholder="Required client inputs, access permissions, or dependencies..."
                className={textareaCls}
                value={values.prerequisites || ''}
                onChange={e => onChange('prerequisites', e.target.value)}
              />
            </Field>

            <Field
              label="Payment Schedule & Milestones"
              templateText="• 50% Deposit upon Project Kickoff\n• 25% upon Mid-term UAT Review\n• 25% upon Final Production Go-Live"
              onApplyTemplate={text => onChange('paymentSchedule', text)}
            >
              <textarea
                rows={3}
                placeholder="Milestone billing rules, deposit percentages, or retainer schedules..."
                className={textareaCls}
                value={values.paymentSchedule || ''}
                onChange={e => onChange('paymentSchedule', e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

export function DynamicDocFields({ docType, values, onChange }: DynamicDocFieldsProps) {
  const renderCommercialFields = () => (
    <div className="space-y-4">
      <ServiceDetailsSection values={values} onChange={onChange} />

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
          <DollarSign className="w-4.5 h-4.5 text-indigo-500" />
          <span>Commercial, Tax &amp; Payment Specifications</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Field label="Payment Terms">
            <select
              className={selectCls}
              value={values.paymentTerms || 'Due on Receipt'}
              onChange={e => onChange('paymentTerms', e.target.value)}
            >
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="Net 7">Net 7 Days</option>
              <option value="Net 14">Net 14 Days</option>
              <option value="Net 30">Net 30 Days</option>
              <option value="Net 60">Net 60 Days</option>
              <option value="50/50 Deposit">50% Deposit / 50% On Completion</option>
            </select>
          </Field>

          <Field label="Seller TPIN / Tax ID">
            <input
              type="text"
              placeholder="e.g. 1009823481"
              className={inputCls}
              value={values.sellerTaxId || ''}
              onChange={e => onChange('sellerTaxId', e.target.value)}
            />
          </Field>

          <Field label="Client Tax ID / VAT Number">
            <input
              type="text"
              placeholder="e.g. 1029384711"
              className={inputCls}
              value={values.clientTaxId || ''}
              onChange={e => onChange('clientTaxId', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Field label="Bank / Settlement Details">
            <input
              type="text"
              placeholder="e.g. Bank Name, Account #, SWIFT/BIC code"
              className={inputCls}
              value={values.bankDetails || ''}
              onChange={e => onChange('bankDetails', e.target.value)}
            />
          </Field>

          <Field label="Mobile Money / Quick Pay Reference">
            <input
              type="text"
              placeholder="e.g. Airtel Money / MTN Money +260 97 000 0000"
              className={inputCls}
              value={values.mobileMoneyDetails || ''}
              onChange={e => onChange('mobileMoneyDetails', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </div>
  )

  switch (docType) {
    case 'delivery_note':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Truck className="w-4.5 h-4.5 text-indigo-500" />
            <span>Delivery &amp; Dispatch Specification</span>
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
            label="Full Delivery Address &amp; Unloading Site"
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
        </div>
      )

    case 'purchase_order':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Building2 className="w-4.5 h-4.5 text-indigo-500" />
            <span>Vendor Procurement &amp; Shipping Authorization</span>
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
            label="Ship-To Address &amp; Receiving Contact"
            templateText="Central Warehouse, Plot 1024 Commercial Zone, Lusaka, Zambia.\nAttn: Procurement Receiving Department."
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
        </div>
      )

    case 'nda':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <ShieldCheck className="w-4.5 h-4.5 text-indigo-500" />
            <span>Confidentiality &amp; Non-Disclosure Specifications</span>
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

            <Field label="Governing Law &amp; Jurisdiction">
              <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || 'Republic of Zambia'} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Purpose of Disclosure &amp; Scope"
            templateText="To evaluate technical integration of software systems and joint commercial venture."
            onApplyTemplate={text => onChange('disclosurePurpose', text)}
          >
            <textarea
              rows={4}
              placeholder="Describe disclosure purpose..."
              className={textareaCls}
              value={values.disclosurePurpose || ''}
              onChange={e => onChange('disclosurePurpose', e.target.value)}
            />
          </Field>
        </div>
      )

    case 'contract':
    case 'service_agreement':
    case 'msa':
    case 'proposal':
    case 'statement_of_work':
      return (
        <div className="space-y-4">
          <ServiceDetailsSection values={values} onChange={onChange} />
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
              <Scale className="w-4.5 h-4.5 text-indigo-500" />
              <span>Contractual Governance &amp; Legal Framework</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Contract Title">
                <input type="text" placeholder="e.g. Software Development & Maintenance Agreement" className={inputCls} value={values.contractTitle || ''} onChange={e => onChange('contractTitle', e.target.value)} />
              </Field>

              <Field label="Effective Start Date">
                <input type="date" className={inputCls} value={values.startDate || values.effectiveDate || ''} onChange={e => onChange('startDate', e.target.value)} />
              </Field>

              <Field label="Governing Law">
                <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || 'Republic of Zambia'} onChange={e => onChange('governingLaw', e.target.value)} />
              </Field>

              <Field label="Termination Notice Period">
                <input type="text" placeholder="e.g. 30 days written notice" className={inputCls} value={values.noticePeriod || '30 days written notice'} onChange={e => onChange('noticePeriod', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )

    case 'invoice':
    case 'quotation':
    case 'receipt':
    default:
      return renderCommercialFields()
  }
}
