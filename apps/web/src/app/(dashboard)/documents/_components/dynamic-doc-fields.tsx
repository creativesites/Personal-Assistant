'use client'

import React from 'react'
import {
  Truck, Calendar, FileText, Building2, ShieldCheck, Scale, DollarSign, BookOpen, User, Tag
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

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? 'flex-1 min-w-0' : 'w-full'}>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white'
const selectCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all'

export function DynamicDocFields({ docType, values, onChange }: DynamicDocFieldsProps) {
  switch (docType) {
    case 'delivery_note':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <Truck className="w-4 h-4" /> Delivery & Dispatch Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Dispatch Date">
              <input type="date" className={inputCls} value={values.dispatchDate || ''} onChange={e => onChange('dispatchDate', e.target.value)} />
            </Field>
            <Field label="Carrier / Courier Name">
              <input type="text" placeholder="e.g. DHL / In-House Courier" className={inputCls} value={values.carrierName || ''} onChange={e => onChange('carrierName', e.target.value)} />
            </Field>
            <Field label="Vehicle Reg / Tracking #">
              <input type="text" placeholder="e.g. AB 123 CD" className={inputCls} value={values.vehicleReg || ''} onChange={e => onChange('vehicleReg', e.target.value)} />
            </Field>
            <Field label="Recipient / Driver Name">
              <input type="text" placeholder="e.g. John Doe" className={inputCls} value={values.recipientName || ''} onChange={e => onChange('recipientName', e.target.value)} />
            </Field>
          </div>
          <Field label="Delivery Address">
            <textarea rows={2} placeholder="Full delivery location details..." className={inputCls} value={values.deliveryAddress || ''} onChange={e => onChange('deliveryAddress', e.target.value)} />
          </Field>
        </div>
      )

    case 'purchase_order':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <Building2 className="w-4 h-4" /> Vendor & Procurement Details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Expected Delivery Date">
              <input type="date" className={inputCls} value={values.expectedDeliveryDate || ''} onChange={e => onChange('expectedDeliveryDate', e.target.value)} />
            </Field>
            <Field label="Vendor Reference / Quote #">
              <input type="text" placeholder="e.g. QT-9942" className={inputCls} value={values.vendorRef || ''} onChange={e => onChange('vendorRef', e.target.value)} />
            </Field>
            <Field label="Requisition #">
              <input type="text" placeholder="e.g. REQ-2026-001" className={inputCls} value={values.requisitionNo || ''} onChange={e => onChange('requisitionNo', e.target.value)} />
            </Field>
            <Field label="Authorized By">
              <input type="text" placeholder="Manager Name / Title" className={inputCls} value={values.authorizedBy || ''} onChange={e => onChange('authorizedBy', e.target.value)} />
            </Field>
          </div>
          <Field label="Shipping Address">
            <textarea rows={2} placeholder="Ship-to address..." className={inputCls} value={values.shippingAddress || ''} onChange={e => onChange('shippingAddress', e.target.value)} />
          </Field>
        </div>
      )

    case 'credit_note':
    case 'debit_note':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <Tag className="w-4 h-4" /> Adjustment Reference Details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Original Invoice #">
              <input type="text" placeholder="e.g. INV-10293" className={inputCls} value={values.originalInvoiceNumber || ''} onChange={e => onChange('originalInvoiceNumber', e.target.value)} />
            </Field>
            <Field label="Original Invoice Date">
              <input type="date" className={inputCls} value={values.originalInvoiceDate || ''} onChange={e => onChange('originalInvoiceDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Reason for Adjustment">
            <select className={selectCls} value={values.reasonForAdjustment || 'Billing Correction'} onChange={e => onChange('reasonForAdjustment', e.target.value)}>
              <option value="Billing Correction">Billing Correction / Pricing Error</option>
              <option value="Returned Goods">Returned Goods / Damaged Delivery</option>
              <option value="Discount Credit">Discount Adjustment / Goodwill Credit</option>
              <option value="Service Credit">Service Interruption / SLA Credit</option>
              <option value="Other">Other Adjustment Reason</option>
            </select>
          </Field>
        </div>
      )

    case 'nda':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" /> Confidentiality & Legal Terms
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Agreement Structure">
              <select className={selectCls} value={values.agreementType || 'bilateral'} onChange={e => onChange('agreementType', e.target.value)}>
                <option value="bilateral">Bilateral (Mutual Protection)</option>
                <option value="unilateral">Unilateral (One-Way Disclosure)</option>
              </select>
            </Field>
            <Field label="Effective Date">
              <input type="date" className={inputCls} value={values.effectiveDate || ''} onChange={e => onChange('effectiveDate', e.target.value)} />
            </Field>
            <Field label="Confidentiality Period (Years)">
              <input type="number" placeholder="2" min="1" max="10" className={inputCls} value={values.confidentialityYears || 2} onChange={e => onChange('confidentialityYears', parseInt(e.target.value) || 2)} />
            </Field>
            <Field label="Governing Jurisdiction / Law">
              <input type="text" placeholder="e.g. Republic of Zambia" className={inputCls} value={values.governingLaw || ''} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>
          </div>
          <Field label="Purpose of Disclosure">
            <textarea rows={2} placeholder="Describe business discussions or evaluation scope..." className={inputCls} value={values.disclosurePurpose || ''} onChange={e => onChange('disclosurePurpose', e.target.value)} />
          </Field>
        </div>
      )

    case 'msa':
    case 'service_agreement':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <Scale className="w-4 h-4" /> Framework Agreement Settings
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Effective Date">
              <input type="date" className={inputCls} value={values.effectiveDate || ''} onChange={e => onChange('effectiveDate', e.target.value)} />
            </Field>
            <Field label="Governing Law">
              <input type="text" placeholder="e.g. Republic of Kenya" className={inputCls} value={values.governingLaw || ''} onChange={e => onChange('governingLaw', e.target.value)} />
            </Field>
            <Field label="Payment Terms (Days)">
              <input type="number" placeholder="30" className={inputCls} value={values.paymentTermDays || 30} onChange={e => onChange('paymentTermDays', parseInt(e.target.value) || 30)} />
            </Field>
            <Field label="Intellectual Property Ownership">
              <select className={selectCls} value={values.ipOwnership || 'client_owned'} onChange={e => onChange('ipOwnership', e.target.value)}>
                <option value="client_owned">Client Owned upon Full Payment</option>
                <option value="provider_owned">Provider Retains Proprietary Rights</option>
                <option value="shared">Joint / Shared License Model</option>
              </select>
            </Field>
          </div>
        </div>
      )

    case 'account_statement':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <DollarSign className="w-4 h-4" /> Account Statement Period & Balances
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Period Start">
              <input type="date" className={inputCls} value={values.statementStart || ''} onChange={e => onChange('statementStart', e.target.value)} />
            </Field>
            <Field label="Period End">
              <input type="date" className={inputCls} value={values.statementEnd || ''} onChange={e => onChange('statementEnd', e.target.value)} />
            </Field>
            <Field label="Opening Balance">
              <input type="number" step="0.01" placeholder="0.00" className={inputCls} value={values.openingBalance || ''} onChange={e => onChange('openingBalance', e.target.value)} />
            </Field>
            <Field label="Closing / Outstanding Balance">
              <input type="number" step="0.01" placeholder="0.00" className={inputCls} value={values.closingBalance || ''} onChange={e => onChange('closingBalance', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    case 'expense_report':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <User className="w-4 h-4" /> Expense Claim Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Claimant Name">
              <input type="text" placeholder="e.g. Jane Smith" className={inputCls} value={values.claimantName || ''} onChange={e => onChange('claimantName', e.target.value)} />
            </Field>
            <Field label="Department / Division">
              <input type="text" placeholder="e.g. Sales / Operations" className={inputCls} value={values.department || ''} onChange={e => onChange('department', e.target.value)} />
            </Field>
            <Field label="Expense Claim Period">
              <input type="text" placeholder="e.g. July 2026 / Q3 Travel" className={inputCls} value={values.claimPeriod || ''} onChange={e => onChange('claimPeriod', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    case 'catalog':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <BookOpen className="w-4 h-4" /> Wholesale Catalog Configuration
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Catalog Season / Edition">
              <input type="text" placeholder="e.g. Summer 2026 Wholesale" className={inputCls} value={values.catalogSeason || ''} onChange={e => onChange('catalogSeason', e.target.value)} />
            </Field>
            <Field label="Tier 1 Label (e.g. 1-10 units)">
              <input type="text" placeholder="Standard Retail" className={inputCls} value={values.tier1Label || 'Tier 1 (1-10 Units)'} onChange={e => onChange('tier1Label', e.target.value)} />
            </Field>
            <Field label="Tier 2 Label (e.g. 11-50 units)">
              <input type="text" placeholder="Bulk Discount" className={inputCls} value={values.tier2Label || 'Tier 2 (11-50 Units)'} onChange={e => onChange('tier2Label', e.target.value)} />
            </Field>
            <Field label="Tier 3 Label (e.g. 50+ units)">
              <input type="text" placeholder="Wholesale Master" className={inputCls} value={values.tier3Label || 'Tier 3 (50+ Units)'} onChange={e => onChange('tier3Label', e.target.value)} />
            </Field>
          </div>
        </div>
      )

    default:
      return null
  }
}
