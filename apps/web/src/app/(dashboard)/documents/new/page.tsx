'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, Send, FileText, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/toast'

// ─── Types ─────────────────────────────────────────────────────────────────

interface LineItemInput {
  description: string
  quantity: number
  unitPrice: number
}

interface DocumentForm {
  documentType: 'invoice' | 'quotation' | 'receipt'
  templateId: 'minimal' | 'modern'
  documentNumber: string
  issueDate: string
  dueDate: string
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  logoUrl: string
  themeColor: string
  clientName: string
  clientAddress: string
  clientPhone: string
  clientEmail: string
  contactId: string | null
  currency: string
  discountPercent: number
  taxPercent: number
  notes: string
  terms: string
  paymentInstructions: string
}

interface ContactOption {
  id: string
  displayName: string
  customName: string | null
  phoneNumber: string
  email: string | null
}

interface BusinessProfile {
  id?: string
  companyName?: string
  tagline?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  logoUrl?: string
  themeColor?: string
  accentColor?: string
  defaultCurrency?: string
  defaultTaxRate?: number
  defaultTerms?: string
  paymentInstructions?: string
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string }
  mobileMoney?: { provider?: string; number?: string }
}

interface ComputedTotals {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  total: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function makeDefaultForm(): DocumentForm {
  const today = todayIso()
  return {
    documentType: 'invoice',
    templateId: 'minimal',
    documentNumber: `INV-${Date.now().toString().slice(-6)}`,
    issueDate: today,
    dueDate: addDays(today, 30),
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    logoUrl: '',
    themeColor: '#4F46E5',
    clientName: '',
    clientAddress: '',
    clientPhone: '',
    clientEmail: '',
    contactId: null,
    currency: 'ZMW',
    discountPercent: 0,
    taxPercent: 16,
    notes: '',
    terms: '',
    paymentInstructions: '',
  }
}

function makeDefaultItems(): LineItemInput[] {
  return [{ description: '', quantity: 1, unitPrice: 0 }]
}

function computeTotals(items: LineItemInput[], discountPercent: number, taxPercent: number): ComputedTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountAmount = subtotal * discountPercent / 100
  const taxableAmount = subtotal - discountAmount
  const taxAmount = taxableAmount * taxPercent / 100
  const total = taxableAmount + taxAmount
  return { subtotal, discountAmount, taxableAmount, taxAmount, total }
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NewDocumentPage() {
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken as string | undefined
  const { addToast } = useToast()

  const [form, setForm] = useState<DocumentForm>(makeDefaultForm)
  const [items, setItems] = useState<LineItemInput[]>(makeDefaultItems)
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [sendingWa, setSendingWa] = useState(false)

  // ── Load business profile ──
  useEffect(() => {
    if (!token) return
    apiClient<BusinessProfile>('/api/business-profile', { token })
      .then(profile => {
        setForm(prev => ({
          ...prev,
          companyName: profile.companyName ?? prev.companyName,
          companyAddress: profile.address ?? prev.companyAddress,
          companyPhone: profile.phone ?? prev.companyPhone,
          companyEmail: profile.email ?? prev.companyEmail,
          logoUrl: profile.logoUrl ?? prev.logoUrl,
          themeColor: profile.themeColor ?? prev.themeColor,
          currency: profile.defaultCurrency ?? prev.currency,
          taxPercent: profile.defaultTaxRate ?? prev.taxPercent,
          terms: profile.defaultTerms ?? prev.terms,
          paymentInstructions: profile.paymentInstructions ?? prev.paymentInstructions,
        }))
      })
      .catch(() => {})
  }, [token])

  // ── Load contacts ──
  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: ContactOption[] }>('/api/contacts', { token })
      .then(data => setContacts(data.contacts))
      .catch(() => {})
  }, [token])

  // ── Computed totals ──
  const totals = useMemo(() =>
    computeTotals(items, form.discountPercent, form.taxPercent),
    [items, form.discountPercent, form.taxPercent]
  )

  // ── Form field helpers ──
  const setField = useCallback(<K extends keyof DocumentForm>(key: K, value: DocumentForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const setDocumentType = useCallback((type: DocumentForm['documentType']) => {
    setForm(prev => ({
      ...prev,
      documentType: type,
      documentNumber: type === 'invoice'
        ? `INV-${Date.now().toString().slice(-6)}`
        : type === 'quotation'
        ? `QT-${Date.now().toString().slice(-6)}`
        : `RCT-${Date.now().toString().slice(-6)}`,
    }))
  }, [])

  const selectContact = useCallback((contactId: string) => {
    const contact = contacts.find(c => c.id === contactId)
    setForm(prev => ({
      ...prev,
      contactId: contactId || null,
      clientName: contact ? (contact.displayName || contact.customName || '') : prev.clientName,
      clientPhone: contact ? contact.phoneNumber : prev.clientPhone,
      clientEmail: contact ? (contact.email ?? '') : prev.clientEmail,
    }))
  }, [contacts])

  // ── Line item helpers ──
  const updateItem = useCallback((index: number, patch: Partial<LineItemInput>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }, [])

  // ── Payload builder ──
  const buildPayload = () => ({
    documentType: form.documentType,
    title: `${form.documentType.charAt(0).toUpperCase() + form.documentType.slice(1)} - ${form.clientName || 'Client'}`,
    contactId: form.contactId,
    structuredData: {
      items: items.filter(i => i.description.trim()),
      notes: form.notes,
      terms: form.terms,
      dueDate: form.dueDate,
      issueDate: form.issueDate,
      clientName: form.clientName,
      clientAddress: form.clientAddress,
      clientPhone: form.clientPhone,
      clientEmail: form.clientEmail,
      companyName: form.companyName,
      companyAddress: form.companyAddress,
      companyPhone: form.companyPhone,
      companyEmail: form.companyEmail,
      logoUrl: form.logoUrl,
      paymentInstructions: form.paymentInstructions,
      discountPercent: form.discountPercent,
      taxPercent: form.taxPercent,
      templateId: form.templateId,
      documentNumber: form.documentNumber,
    },
    currency: form.currency,
    notes: form.notes,
  })

  // ── Save as Draft ──
  const saveDraft = async () => {
    if (!token) return
    setSavingDraft(true)
    try {
      await apiClient<{ document: { id: string; documentNumber: string; status: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      })
      addToast({ variant: 'success', title: 'Saved as draft' })
      router.push('/business')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to save', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSavingDraft(false)
    }
  }

  // ── Generate PDF & Save ──
  const generatePdf = async () => {
    if (!token) return
    setGeneratingPdf(true)
    try {
      const data = await apiClient<{ document: { id: string; documentNumber: string; status: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      })
      await apiClient(`/api/documents/${data.document.id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'PDF generated successfully' })
      router.push('/business')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to generate PDF', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ── Send via WhatsApp ──
  const sendWhatsApp = async () => {
    if (!token || !form.contactId) return
    setSendingWa(true)
    try {
      const data = await apiClient<{ document: { id: string; documentNumber: string; status: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      })
      await apiClient(`/api/documents/${data.document.id}/generate`, { method: 'POST', token })
      await apiClient(`/api/documents/${data.document.id}/send`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Sent via WhatsApp' })
      router.push('/business')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to send', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSendingWa(false)
    }
  }

  const isLoading = savingDraft || generatingPdf || sendingWa

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <Link href="/business" className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-gray-900">New Document</h1>
          <p className="text-xs text-gray-500">Manual document generator</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 lg:grid lg:grid-cols-2 lg:gap-0">

        {/* ── LEFT: Form ── */}
        <div className="lg:overflow-y-auto lg:h-[calc(100vh-140px)] p-4 md:p-6 space-y-5 border-r border-gray-200">

          {/* 1. Document Type Tabs */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Document Type</p>
            <div className="flex gap-2">
              {(['invoice', 'quotation', 'receipt'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setDocumentType(type)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    form.documentType === type
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </section>

          {/* 2. Template Selector */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Template</p>
            <div className="flex gap-3">
              {(['minimal', 'modern'] as const).map(tmpl => (
                <button
                  key={tmpl}
                  onClick={() => setField('templateId', tmpl)}
                  className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors ${
                    form.templateId === tmpl
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {tmpl === 'minimal' ? (
                    <div className="w-16 h-10 rounded border border-gray-300 bg-white" />
                  ) : (
                    <div className="w-16 h-10 rounded overflow-hidden">
                      <div className="h-3 bg-indigo-600 w-full" />
                      <div className="h-7 bg-white border border-gray-200 border-t-0" />
                    </div>
                  )}
                  <span className={`text-xs font-medium ${form.templateId === tmpl ? 'text-indigo-700' : 'text-gray-600'}`}>
                    {tmpl.charAt(0).toUpperCase() + tmpl.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 3. Document Info */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Document Info</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Document Number</label>
              <input
                value={form.documentNumber}
                onChange={e => setField('documentNumber', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={e => setField('issueDate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              {form.documentType === 'invoice' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setField('dueDate', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              )}
            </div>
          </section>

          {/* 4. Company (Seller) — collapsible */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => setCompanyOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <span className="text-xs font-medium text-gray-500">From (Company)</span>
              {companyOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {companyOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                {([
                  { key: 'companyName', label: 'Company Name' },
                  { key: 'companyAddress', label: 'Address' },
                  { key: 'companyPhone', label: 'Phone' },
                  { key: 'companyEmail', label: 'Email' },
                ] as { key: keyof DocumentForm; label: string }[]).map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input
                      value={form[key] as string}
                      onChange={e => setField(key, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. Client (Buyer) */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Bill To (Client)</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Select Client</label>
              <select
                value={form.contactId ?? ''}
                onChange={e => selectContact(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Select a contact (optional)…</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName || c.customName || c.phoneNumber}</option>
                ))}
              </select>
            </div>
            {([
              { key: 'clientName', label: 'Client Name' },
              { key: 'clientAddress', label: 'Address' },
              { key: 'clientPhone', label: 'Phone' },
              { key: 'clientEmail', label: 'Email' },
            ] as { key: keyof DocumentForm; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input
                  value={form[key] as string}
                  onChange={e => setField(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            ))}
          </section>

          {/* 6. Line Items */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Line Items</p>
            <div className="space-y-2">
              {/* Header row (desktop) */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_112px_96px_32px] gap-2 text-[11px] text-gray-400 font-medium px-0.5">
                <span>Description</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Amount</span>
                <span />
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_112px_96px_32px] gap-2 items-center">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateItem(i, { description: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitPrice}
                    onChange={e => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <span className="text-sm text-gray-700 text-right pr-1">
                    {(item.quantity * item.unitPrice).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-red-50 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" />Add line item
            </button>
          </section>

          {/* 7. Financials */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Financials</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Currency</label>
                <input
                  value={form.currency}
                  onChange={e => setField('currency', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Discount %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={e => setField('discountPercent', parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              {form.documentType !== 'receipt' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tax %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.taxPercent}
                    onChange={e => setField('taxPercent', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal, form.currency)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount ({form.discountPercent}%)</span>
                  <span>-{formatCurrency(totals.discountAmount, form.currency)}</span>
                </div>
              )}
              {totals.taxAmount > 0 && form.documentType !== 'receipt' && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({form.taxPercent}%)</span>
                  <span>{formatCurrency(totals.taxAmount, form.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
                <span>TOTAL</span>
                <span>{formatCurrency(totals.total, form.currency)}</span>
              </div>
            </div>
          </section>

          {/* 8. Footer / Notes */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">Notes &amp; Terms</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Any notes to the client…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Terms &amp; Conditions</label>
              <textarea
                rows={2}
                value={form.terms}
                onChange={e => setField('terms', e.target.value)}
                placeholder="Payment terms, delivery conditions…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Instructions</label>
              <textarea
                rows={2}
                value={form.paymentInstructions}
                onChange={e => setField('paymentInstructions', e.target.value)}
                placeholder="Bank details, mobile money…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>
          </section>

          {/* Mobile: Collapsible preview toggle */}
          <div className="lg:hidden">
            <button
              onClick={() => setPreviewOpen(o => !o)}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <span className="flex items-center gap-2"><Eye className="w-4 h-4 text-gray-400" />Preview</span>
              {previewOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {previewOpen && (
              <div className="mt-3">
                <DocumentPreview form={form} items={items} totals={totals} />
              </div>
            )}
          </div>

          {/* Spacer so actions bar doesn't cover last field */}
          <div className="h-4" />
        </div>

        {/* ── RIGHT: Live Preview (desktop only) ── */}
        <div className="hidden lg:flex flex-col lg:overflow-y-auto lg:h-[calc(100vh-140px)] p-6 items-center">
          <div className="sticky top-0 w-full max-w-[640px]">
            <p className="text-xs font-medium text-gray-400 mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />Live Preview
            </p>
            <DocumentPreview form={form} items={items} totals={totals} />
          </div>
        </div>
      </div>

      {/* ── Bottom Actions Bar ── */}
      <div className="bg-white border-t border-gray-200 px-4 md:px-6 py-3.5 flex items-center justify-between gap-3 shadow-md">
        <Link href="/business" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Cancel
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={saveDraft}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 min-h-[44px]"
          >
            {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Save Draft
          </button>
          {form.contactId && (
            <button
              onClick={sendWhatsApp}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 min-h-[44px]"
            >
              {sendingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send via WhatsApp
            </button>
          )}
          <button
            onClick={generatePdf}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 min-h-[44px]"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {generatingPdf ? 'Generating…' : 'Generate PDF & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Document Preview Component ──────────────────────────────────────────────

function DocumentPreview({
  form,
  items,
  totals,
}: {
  form: DocumentForm
  items: LineItemInput[]
  totals: ComputedTotals
}) {
  const headerColor = form.themeColor || '#4F46E5'
  const docLabel = form.documentType === 'invoice' ? 'INVOICE' : form.documentType === 'quotation' ? 'QUOTATION' : 'RECEIPT'

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-lg w-full max-w-[640px]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-4" style={{ background: headerColor, color: '#fff' }}>
        <div>
          {form.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoUrl} alt="Logo" className="h-10 object-contain" />
          ) : (
            <p className="text-lg font-bold">{form.companyName || 'Your Company'}</p>
          )}
        </div>
        <p className="text-2xl font-extrabold tracking-wide opacity-90">{docLabel}</p>
      </div>

      {/* Document meta + company info */}
      <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100">
        <div className="space-y-0.5">
          {form.companyName && <p className="text-xs font-semibold text-gray-800">{form.companyName}</p>}
          {form.companyAddress && <p className="text-xs text-gray-500">{form.companyAddress}</p>}
          {form.companyPhone && <p className="text-xs text-gray-500">{form.companyPhone}</p>}
          {form.companyEmail && <p className="text-xs text-gray-500">{form.companyEmail}</p>}
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">#</span> {form.documentNumber || '—'}</p>
          <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Issued:</span> {form.issueDate || '—'}</p>
          {form.documentType === 'invoice' && form.dueDate && (
            <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Due:</span> {form.dueDate}</p>
          )}
        </div>
      </div>

      {/* Bill to */}
      {(form.clientName || form.clientAddress || form.clientPhone) && (
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Bill To</p>
          {form.clientName && <p className="text-xs font-semibold text-gray-800">{form.clientName}</p>}
          {form.clientAddress && <p className="text-xs text-gray-500">{form.clientAddress}</p>}
          {form.clientPhone && <p className="text-xs text-gray-500">{form.clientPhone}</p>}
          {form.clientEmail && <p className="text-xs text-gray-500">{form.clientEmail}</p>}
        </div>
      )}

      {/* Line items */}
      <div className="px-5 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left font-semibold text-gray-500 pb-1.5">Description</th>
              <th className="text-right font-semibold text-gray-500 pb-1.5 w-12">Qty</th>
              <th className="text-right font-semibold text-gray-500 pb-1.5 w-20">Unit Price</th>
              <th className="text-right font-semibold text-gray-500 pb-1.5 w-20">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.filter(i => i.description.trim()).map((item, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5 text-gray-700">{item.description}</td>
                <td className="py-1.5 text-right text-gray-600">{item.quantity}</td>
                <td className="py-1.5 text-right text-gray-600">{item.unitPrice.toFixed(2)}</td>
                <td className="py-1.5 text-right text-gray-700 font-medium">{(item.quantity * item.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
            {items.filter(i => i.description.trim()).length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-gray-300 italic">No items yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-5 py-3 border-t border-gray-100">
        <div className="flex flex-col items-end gap-0.5 text-xs">
          <div className="flex justify-between w-40">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-700">{totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between w-40">
              <span className="text-gray-500">Discount</span>
              <span className="text-gray-700">-{totals.discountAmount.toFixed(2)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && form.documentType !== 'receipt' && (
            <div className="flex justify-between w-40">
              <span className="text-gray-500">Tax</span>
              <span className="text-gray-700">{totals.taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between w-40 border-t border-gray-200 pt-1 mt-0.5">
            <span className="font-bold text-gray-900">TOTAL</span>
            <span className="font-bold text-gray-900">{form.currency} {totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      {(form.notes || form.terms || form.paymentInstructions) && (
        <div className="px-5 py-3 border-t border-gray-100 space-y-2 bg-gray-50">
          {form.notes && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
              <p className="text-xs text-gray-600">{form.notes}</p>
            </div>
          )}
          {form.terms && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Terms</p>
              <p className="text-xs text-gray-600">{form.terms}</p>
            </div>
          )}
          {form.paymentInstructions && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Payment</p>
              <p className="text-xs text-gray-600">{form.paymentInstructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
