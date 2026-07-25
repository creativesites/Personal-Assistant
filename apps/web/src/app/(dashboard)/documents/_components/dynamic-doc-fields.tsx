'use client'

import React, { useState } from 'react'
import {
  Truck, Calendar, FileText, Building2, ShieldCheck, Scale, DollarSign, BookOpen,
  User, Tag, Sparkles, Wrench, Layers, ChevronDown, ChevronUp, Plus, Trash2, HelpCircle, CheckSquare, Square
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
        <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide">
          {label}
        </label>
        {templateText && onApplyTemplate && (
          <button
            type="button"
            onClick={() => onApplyTemplate(templateText)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100 shadow-2xs"
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
const textareaCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white resize-y font-normal leading-relaxed min-h-[90px]'

// ── Custom Key-Value Pairs Component ──────────────────────────────────────────
export function CustomKeyValueSection({
  values,
  onChange,
}: {
  values: Record<string, any>
  onChange: (key: string, val: any) => void
}) {
  const rawPairs = values.customKeyValuePairs || values.custom_key_value_pairs || []

  const pairs: Array<{ id: string; key: string; value: string; type: 'text' | 'textarea' | 'date' | 'number' | 'checkbox' }> = (
    Array.isArray(rawPairs) ? rawPairs : []
  ).map((p: any, idx: number) => ({
    id: p.id || `pair-${idx}-${p.key || p.name || ''}`,
    key: p.key || p.name || p.label || '',
    value: p.value !== undefined ? String(p.value) : (p.val !== undefined ? String(p.val) : ''),
    type: p.type || (p.value && String(p.value).length > 60 ? 'textarea' : 'text'),
  }))

  const updatePair = (id: string, updates: Partial<{ key: string; value: string; type: 'text' | 'textarea' | 'date' | 'number' | 'checkbox' }>) => {
    const updated = pairs.map(p => (p.id === id ? { ...p, ...updates } : p))
    onChange('customKeyValuePairs', updated)
  }

  const addPair = () => {
    const newPair = { id: Math.random().toString(36).slice(2), key: '', value: '', type: 'text' as const }
    onChange('customKeyValuePairs', [...pairs, newPair])
  }

  const removePair = (id: string) => {
    onChange('customKeyValuePairs', pairs.filter(p => p.id !== id))
  }

  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-xs p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider">
            Custom Industry Metadata &amp; Key-Value Attributes
          </h3>
        </div>
        <span className="text-[10px] text-gray-500 font-medium">Rendered directly on official document</span>
      </div>

      <p className="text-xs text-gray-500">
        Add custom metadata specific to your industry or company standards (e.g. <i>Registration #</i>, <i>ISO Compliance</i>, <i>Project Phase</i>, <i>Vessel Name</i>, <i>Tax Clearance #</i>).
      </p>

      <div className="space-y-3">
        {pairs.map((pair) => (
          <div key={pair.id} className="p-3.5 rounded-2xl border border-gray-200/80 bg-gray-50/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Field Name (e.g. ISO Standard / Vessel Name)"
                className={`${inputCls} flex-1`}
                value={pair.key}
                onChange={e => updatePair(pair.id, { key: e.target.value })}
              />

              <select
                value={pair.type}
                onChange={e => updatePair(pair.id, { type: e.target.value as any })}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-xs text-gray-800 bg-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              >
                <option value="text">Single Line Text</option>
                <option value="textarea">Multi-line Paragraph</option>
                <option value="date">Date Picker</option>
                <option value="number">Numeric Value</option>
                <option value="checkbox">Yes / No Toggle</option>
              </select>

              <button
                type="button"
                onClick={() => removePair(pair.id)}
                className="p-2.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                title="Remove Field"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div>
              {pair.type === 'textarea' ? (
                <textarea
                  rows={3}
                  placeholder="Enter detailed paragraph, scope notes, or specifications..."
                  className={textareaCls}
                  value={pair.value}
                  onChange={e => updatePair(pair.id, { value: e.target.value })}
                />
              ) : pair.type === 'date' ? (
                <input
                  type="date"
                  className={inputCls}
                  value={pair.value}
                  onChange={e => updatePair(pair.id, { value: e.target.value })}
                />
              ) : pair.type === 'number' ? (
                <input
                  type="number"
                  placeholder="e.g. 100 or 4.5"
                  className={inputCls}
                  value={pair.value}
                  onChange={e => updatePair(pair.id, { value: e.target.value })}
                />
              ) : pair.type === 'checkbox' ? (
                <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-gray-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pair.value === 'Yes' || pair.value === 'true'}
                      onChange={e => updatePair(pair.id, { value: e.target.checked ? 'Yes' : 'No' })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <span>{pair.value === 'Yes' || pair.value === 'true' ? 'Yes / Compliant' : 'No / Non-Compliant'}</span>
                  </label>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Field Value (e.g. ISO 9001:2026 Certified)"
                  className={inputCls}
                  value={pair.value}
                  onChange={e => updatePair(pair.id, { value: e.target.value })}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPair}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Industry Custom Field</span>
      </button>
    </div>
  )
}

// ── Optional Industry Clauses Selector ───────────────────────────────────────
export function OptionalClausesSection({
  title,
  clauses,
  values,
  onChange,
}: {
  title: string
  clauses: Array<{
    id: string
    label: string
    hint: string
    placeholder: string
    templateText?: string
  }>
  values: Record<string, any>
  onChange: (key: string, val: any) => void
}) {
  const [open, setOpen] = useState(false)
  const activeCount = clauses.filter(c => values[c.id] !== undefined && values[c.id] !== null && values[c.id] !== '').length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-black text-slate-900 uppercase tracking-wider">{title}</span>
          {activeCount > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              {activeCount} Selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-bold text-slate-600">
          <span>{open ? 'Hide Optional Clauses' : 'Configure Optional Clauses'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="p-4 border-t border-slate-200 space-y-4 animate-in fade-in duration-150 bg-white">
          <p className="text-xs text-gray-500">
            Select specialized clauses or parameters to include in this document. Unselected optional clauses will not appear.
          </p>

          <div className="space-y-4">
            {clauses.map(c => {
              const isEnabled = values[c.id] !== undefined && values[c.id] !== null
              return (
                <div key={c.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => {
                    if (isEnabled) {
                      onChange(c.id, undefined)
                    } else {
                      onChange(c.id, c.templateText || '')
                    }
                  }}>
                    <div className="flex items-center gap-2.5">
                      {isEnabled ? (
                        <CheckSquare className="w-4.5 h-4.5 text-indigo-600 flex-shrink-0" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-gray-400 flex-shrink-0" />
                      )}
                      <div>
                        <span className={`text-xs font-extrabold ${isEnabled ? 'text-indigo-950' : 'text-gray-700'}`}>{c.label}</span>
                        <p className="text-[10px] text-gray-500">{c.hint}</p>
                      </div>
                    </div>
                  </div>

                  {isEnabled && (
                    <div className="pt-2">
                      <Field
                        label={c.label}
                        templateText={c.templateText}
                        onApplyTemplate={text => onChange(c.id, text)}
                      >
                        <textarea
                          rows={3}
                          className={textareaCls}
                          placeholder={c.placeholder}
                          value={values[c.id] || ''}
                          onChange={e => onChange(c.id, e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared Service Details Accordion ─────────────────────────────────────────
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
          <span>Service Scope &amp; Project Execution Details</span>
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
            templateText="1. Solution Architecture & Technical Design Specs.\n2. Custom Core Engineering, Frontend & API Development.\n3. Quality Assurance Testing, UAT Sign-off & Security Audit.\n4. Production Deployment, User Onboarding & 60-Day Support Warranty."
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
              templateText="1. Client provides required API credentials and staging server access within 3 business days.\n2. Client designates a primary project coordinator for weekly milestone reviews."
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
              templateText="• 50% Upfront Retainer upon Project Kickoff\n• 25% upon Mid-term Technical UAT Review\n• 25% upon Final Production Handover"
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

// ── Main DynamicDocFields Component ─────────────────────────────────────────
export function DynamicDocFields({ docType, values, onChange }: DynamicDocFieldsProps) {

  // 1. MASTER SERVICES AGREEMENT (MSA)
  if (docType === 'msa') {
    return (
      <div className="space-y-4">
        {/* Core MSA Framework */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Scale className="w-4.5 h-4.5 text-indigo-500" />
            <span>Master Framework Governance &amp; Legal Terms</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Agreement Title">
              <input
                type="text"
                placeholder="e.g. Master Services Agreement / Framework Agreement"
                className={inputCls}
                value={values.contractTitle || 'Master Services Agreement'}
                onChange={e => onChange('contractTitle', e.target.value)}
              />
            </Field>

            <Field label="Effective Start Date">
              <input
                type="date"
                className={inputCls}
                value={values.effectiveDate || values.startDate || ''}
                onChange={e => onChange('effectiveDate', e.target.value)}
              />
            </Field>

            <Field label="Governing Jurisdiction / Applicable Law">
              <input
                type="text"
                placeholder="e.g. Republic of Zambia / England & Wales"
                className={inputCls}
                value={values.governingLaw || 'Republic of Zambia'}
                onChange={e => onChange('governingLaw', e.target.value)}
              />
            </Field>

            <Field label="Termination Notice Period">
              <input
                type="text"
                placeholder="e.g. 30 days written notice"
                className={inputCls}
                value={values.noticePeriod || '30 days written notice'}
                onChange={e => onChange('noticePeriod', e.target.value)}
              />
            </Field>

            <Field label="Default Payment Term (Days)">
              <select
                className={selectCls}
                value={values.paymentTermDays || '30'}
                onChange={e => onChange('paymentTermDays', e.target.value)}
              >
                <option value="7">Net 7 Days</option>
                <option value="14">Net 14 Days</option>
                <option value="30">Net 30 Days</option>
                <option value="60">Net 60 Days</option>
              </select>
            </Field>

            <Field label="Intellectual Property Ownership Basis">
              <select
                className={selectCls}
                value={values.ipOwnership || 'Client Owned Work Product'}
                onChange={e => onChange('ipOwnership', e.target.value)}
              >
                <option value="Client Owned Work Product">Client-Owned Work Product (Upon Full Payment)</option>
                <option value="Provider Retained IP">Provider Retained IP (Non-Exclusive Client License)</option>
                <option value="Joint Ownership">Joint Intellectual Property Rights</option>
              </select>
            </Field>
          </div>

          <Field
            label="Service Level Commitments (SLA) & Support Standards"
            templateText="1. Service Availability Guarantee: 99.9% Uptime per calendar month.\n2. Priority 1 Critical Incident Response Time: Within 2 hours.\n3. Scheduled Maintenance Window: Sundays 01:00 - 04:00 CAT with 48h advance notice."
            onApplyTemplate={text => onChange('slaCommitments', text)}
          >
            <textarea
              rows={4}
              placeholder="Outline service availability uptime, response SLAs, maintenance windows..."
              className={textareaCls}
              value={values.slaCommitments || ''}
              onChange={e => onChange('slaCommitments', e.target.value)}
            />
          </Field>
        </div>

        {/* Optional MSA Clauses */}
        <OptionalClausesSection
          title="Master Services Agreement Optional Enterprise Clauses"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'limitationOfLiability',
              label: 'Limitation of Liability Cap',
              hint: 'Restricts total monetary damages recoverable under this MSA',
              placeholder: 'e.g. Neither party\'s aggregate liability shall exceed total fees paid in the prior 12 months.',
              templateText: 'Except for gross negligence or willful misconduct, neither party\'s aggregate liability arising out of or related to this Agreement shall exceed the total fees paid or payable by Client in the twelve (12) months preceding the claim.'
            },
            {
              id: 'disputeResolution',
              label: 'Dispute Resolution & Arbitration Forum',
              hint: 'Defines formal mediation and binding arbitration rules',
              placeholder: 'e.g. UNCITRAL Arbitration rules in Lusaka, Zambia',
              templateText: 'Any dispute arising from this Agreement shall first be submitted to informal executive negotiation for 14 days. If unresolved, the dispute shall be finally settled by binding arbitration in accordance with UNCITRAL Arbitration Rules.'
            },
            {
              id: 'nonSolicitation',
              label: 'Non-Solicitation & Non-Compete Period',
              hint: 'Prohibits poaching employees or contractors during and after contract',
              placeholder: 'e.g. 12 months post-termination non-solicitation',
              templateText: 'Neither party shall directly or indirectly solicit, hire, or engage any employee or contractor of the other party during the term of this Agreement and for a period of twelve (12) months following termination.'
            },
            {
              id: 'insuranceCoverage',
              label: 'Professional Indemnity & Cyber Insurance Requirements',
              hint: 'Specifies minimum mandatory insurance coverage limits',
              placeholder: 'e.g. $1,000,000 Professional Indemnity Coverage',
              templateText: 'Provider shall maintain in full force and effect Professional Indemnity Insurance with a minimum limit of $1,000,000 per claim, and Commercial General Liability insurance during the term.'
            },
            {
              id: 'subcontractingRules',
              label: 'Subcontracting & Third-Party Approval Protocol',
              hint: 'Rules governing engagement of sub-processors or subcontractors',
              placeholder: 'e.g. Requires prior written consent of Client',
              templateText: 'Provider shall not subcontract any material portion of the Services without obtaining prior written consent from Client. Provider remains fully responsible for subcontractor performance.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 2. NON-DISCLOSURE AGREEMENT (NDA)
  if (docType === 'nda') {
    return (
      <div className="space-y-4">
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
            label="Purpose of Disclosure & Scope of Discussions"
            templateText="To evaluate technical integration, proprietary software architecture, commercial pricing models, and joint venture opportunities between the parties."
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

          <Field
            label="Permitted Disclosures & Standard Exclusions"
            templateText="Confidential Information excludes information that: (a) is or becomes publicly available without breach; (b) was already known prior to disclosure; (c) is independently developed without reference to Confidential Information."
            onApplyTemplate={text => onChange('permittedDisclosures', text)}
          >
            <textarea
              rows={3}
              placeholder="List exclusions, legal compulsion rules..."
              className={textareaCls}
              value={values.permittedDisclosures || ''}
              onChange={e => onChange('permittedDisclosures', e.target.value)}
            />
          </Field>
        </div>

        <OptionalClausesSection
          title="Non-Disclosure Agreement Optional Clauses"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'nonCircumvention',
              label: 'Non-Circumvention Clause',
              hint: 'Prevents bypassing the disclosing party to deal directly with introduced contacts',
              placeholder: 'e.g. Neither party shall circumvent the other to negotiate directly with introduced clients.',
              templateText: 'Receiving Party agrees not to circumvent Disclosing Party by directly or indirectly contacting, soliciting, or entering into commercial transactions with any client, vendor, or contact introduced under this Agreement.'
            },
            {
              id: 'equitableRelief',
              label: 'Equitable Relief & Injunction Rights',
              hint: 'Right to seek immediate court injunction without proving monetary damages',
              placeholder: 'e.g. Right to emergency injunctive relief upon breach',
              templateText: 'Parties acknowledge that unauthorized disclosure of Confidential Information will cause irreparable harm. Disclosing Party shall be entitled to seek immediate injunctive relief and specific performance in any court of competent jurisdiction.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 3. CONTRACT & SERVICE AGREEMENT
  if (['contract', 'service_agreement'].includes(docType)) {
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
              <input type="text" placeholder="e.g. Software Engineering & Support Agreement" className={inputCls} value={values.contractTitle || ''} onChange={e => onChange('contractTitle', e.target.value)} />
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

        <OptionalClausesSection
          title="Contract Optional Enterprise Clauses"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'acceptanceTesting',
              label: 'Acceptance Testing & Milestone Sign-off Protocol',
              hint: 'Defines formal client inspection window and UAT approval period',
              placeholder: 'e.g. 10 business days for Client UAT testing',
              templateText: 'Client shall have ten (10) business days following delivery of each milestone to conduct User Acceptance Testing (UAT). Deliverables shall be deemed accepted if no written defect notice is received within this period.'
            },
            {
              id: 'warrantyPeriod',
              label: 'Warranty Period & Defect Remedy',
              hint: 'Remediation period for post-handover defects at provider cost',
              placeholder: 'e.g. 90-day post go-live defect warranty',
              templateText: 'Provider warrants that deliverables shall perform substantially in accordance with specifications for ninety (90) days following final acceptance. Provider shall promptly correct non-conforming items at no additional charge.'
            },
            {
              id: 'retainageDeposit',
              label: 'Retainage / Performance Security Deposit %',
              hint: 'Percentage held back until final completion sign-off',
              placeholder: 'e.g. 10% retainage released upon final sign-off',
              templateText: 'Client may retain 10% of each progress payment as security, which retainage shall be released in full within 14 days following final project acceptance.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 4. STATEMENT OF WORK (SOW)
  if (docType === 'statement_of_work') {
    return (
      <div className="space-y-4">
        <ServiceDetailsSection values={values} onChange={onChange} />

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <BookOpen className="w-4.5 h-4.5 text-indigo-500" />
            <span>SOW Project Execution &amp; Specifications</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="SOW Project Title">
              <input type="text" placeholder="e.g. SOW #01 — E-Commerce Platform Modernization" className={inputCls} value={values.sowTitle || ''} onChange={e => onChange('sowTitle', e.target.value)} />
            </Field>

            <Field label="Target Completion Date">
              <input type="date" className={inputCls} value={values.completionDate || ''} onChange={e => onChange('completionDate', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Key Assumptions, Exclusions & Client Dependencies"
            templateText="1. Client provides timely feedback within 48 hours for design iterations.\n2. Third-party API licensing fees (e.g. SMS Gateway, Payment Gateway) are borne by Client.\n3. Content and copywriting shall be supplied by Client in final format."
            onApplyTemplate={text => onChange('assumptions', text)}
          >
            <textarea
              rows={4}
              placeholder="List project assumptions, exclusions..."
              className={textareaCls}
              value={values.assumptions || ''}
              onChange={e => onChange('assumptions', e.target.value)}
            />
          </Field>
        </div>

        <OptionalClausesSection
          title="SOW Optional Governance Clauses"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'changeOrderGovernance',
              label: 'Change Order Governance Protocol',
              hint: 'Requires formal Change Request form for scope additions',
              placeholder: 'e.g. Scope modifications require signed Change Order with price adjustments.',
              templateText: 'Any modification to project scope, timeline, or fee structure must be documented in a written Change Order signed by authorized representatives of both parties before work commences.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 5. PROPOSAL
  if (docType === 'proposal') {
    return (
      <div className="space-y-4">
        <ServiceDetailsSection values={values} onChange={onChange} />

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Sparkles className="w-4.5 h-4.5 text-indigo-500" />
            <span>Commercial Proposal Overview</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Proposal Title">
              <input type="text" placeholder="e.g. Enterprise AI Workforce Implementation Proposal" className={inputCls} value={values.proposalTitle || ''} onChange={e => onChange('proposalTitle', e.target.value)} />
            </Field>

            <Field label="Proposal Validity Window (Days)">
              <input type="number" placeholder="30" className={inputCls} value={values.validityDays || 30} onChange={e => onChange('validityDays', parseInt(e.target.value) || 30)} />
            </Field>
          </div>

          <Field
            label="Executive Summary & Proposed Solution"
            templateText="Executive Summary:\nOur proposed solution delivers a fully automated AI relationship management and document processing engine tailored to streamline client operations, boost conversion rates by 40%, and eliminate manual administrative overhead."
            onApplyTemplate={text => onChange('executiveSummary', text)}
          >
            <textarea
              rows={4}
              placeholder="Outline proposal summary, strategy, value proposition..."
              className={textareaCls}
              value={values.executiveSummary || ''}
              onChange={e => onChange('executiveSummary', e.target.value)}
            />
          </Field>
        </div>

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 6. DELIVERY NOTE
  if (docType === 'delivery_note') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Truck className="w-4.5 h-4.5 text-indigo-500" />
            <span>Delivery &amp; Dispatch Specifications</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Dispatch Date">
              <input type="date" className={inputCls} value={values.dispatchDate || ''} onChange={e => onChange('dispatchDate', e.target.value)} />
            </Field>

            <Field label="Carrier / Courier Name">
              <input type="text" placeholder="e.g. DHL Express / In-House Fleet" className={inputCls} value={values.carrierName || ''} onChange={e => onChange('carrierName', e.target.value)} />
            </Field>

            <Field label="Vehicle Reg / Tracking Waybill #">
              <input type="text" placeholder="e.g. Waybill #9948201 / Vehicle AB 123 CD" className={inputCls} value={values.vehicleReg || ''} onChange={e => onChange('vehicleReg', e.target.value)} />
            </Field>

            <Field label="Recipient / Driver Name">
              <input type="text" placeholder="e.g. John Mwansa (Receiving Manager)" className={inputCls} value={values.recipientName || ''} onChange={e => onChange('recipientName', e.target.value)} />
            </Field>
          </div>

          <Field
            label="Full Delivery Address & Unloading Instructions"
            templateText="Unit 4B, Central Logistics Park, Great East Road, Lusaka, Zambia.\nGate Entry Code: 4810.\nAttn: Receiving Warehouse Manager."
            onApplyTemplate={text => onChange('deliveryAddress', text)}
          >
            <textarea
              rows={3}
              placeholder="Full delivery location, warehouse gate info, and unloading instructions..."
              className={textareaCls}
              value={values.deliveryAddress || ''}
              onChange={e => onChange('deliveryAddress', e.target.value)}
            />
          </Field>
        </div>

        <OptionalClausesSection
          title="Delivery & Logistics Optional Specifications"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'batchNumber',
              label: 'Batch / Lot # & Expiry Tracking',
              hint: 'Pharmaceutical, FMCG, or manufactured goods tracking',
              placeholder: 'e.g. Batch #LOT-2026-881 / Expiry: 12/2028',
              templateText: 'Batch #: LOT-2026-881 | Mfg Date: 01/2026 | Exp Date: 12/2028'
            },
            {
              id: 'temperatureSpec',
              label: 'Cold Chain & Storage Temperature Specification',
              hint: 'Climate-controlled transport instructions',
              placeholder: 'e.g. Maintain +2°C to +8°C during transit',
              templateText: 'Cold Chain Requirement: Maintain temperature between +2°C and +8°C. Do not freeze.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // 7. PURCHASE ORDER
  if (docType === 'purchase_order') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <Building2 className="w-4.5 h-4.5 text-indigo-500" />
            <span>Procurement &amp; Vendor Authorization</span>
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
            label="Ship-To Location & Receiving Contact"
            templateText="Central Warehouse, Plot 1024 Commercial Zone, Lusaka, Zambia.\nAttn: Procurement Receiving Department."
            onApplyTemplate={text => onChange('shippingAddress', text)}
          >
            <textarea
              rows={3}
              placeholder="Ship-to address, warehouse contact details..."
              className={textareaCls}
              value={values.shippingAddress || ''}
              onChange={e => onChange('shippingAddress', e.target.value)}
            />
          </Field>
        </div>

        <OptionalClausesSection
          title="Purchase Order Optional Procurement Terms"
          values={values}
          onChange={onChange}
          clauses={[
            {
              id: 'incoterms',
              label: 'Incoterms Shipping Basis',
              hint: 'International commercial shipping terms',
              placeholder: 'e.g. DDP (Delivered Duty Paid) Lusaka Warehouse',
              templateText: 'Incoterms 2020 Basis: DDP (Delivered Duty Paid) to Purchaser Warehouse.'
            },
            {
              id: 'inspectionWindow',
              label: 'Goods Inspection & Rejection Period',
              hint: 'Days allowed for quality inspection upon delivery',
              placeholder: 'e.g. 7 business days inspection window',
              templateText: 'Purchaser retains the right to inspect delivered goods within seven (7) business days and reject non-conforming items.'
            }
          ]}
        />

        <CustomKeyValueSection values={values} onChange={onChange} />
      </div>
    )
  }

  // DEFAULT / COMMERCIAL (Invoices, Quotations, Receipts, Credit Notes, Debit Notes, Account Statements, Expense Reports)
  return (
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

      <CustomKeyValueSection values={values} onChange={onChange} />
    </div>
  )
}
