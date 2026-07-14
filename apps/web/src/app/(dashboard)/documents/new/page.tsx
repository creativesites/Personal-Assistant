'use client'

// @ts-nocheck — @react-pdf/renderer types incompatible with React 19; runtime fine

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Check, FileText, FileCheck, BookOpen, File,
  Search, X, Plus, Trash2, ChevronDown, Download, Building2, User,
  CreditCard, StickyNote, Eye, Loader2,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import type { ZuriDocData } from '@/components/documents/ZuriDocumentPDF'

// ── Dynamic imports so PDF renderer only loads client-side ───────────────────
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => ({ default: m.PDFDownloadLink })),
  { ssr: false, loading: () => null }
)
const ZuriDocumentPDF = dynamic(
  () => import('@/components/documents/ZuriDocumentPDF'),
  { ssr: false }
)

// ── Types ────────────────────────────────────────────────────────────────────

type DocType = 'invoice' | 'quotation' | 'proposal' | 'contract'

interface LineItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}

interface FormData {
  docType: DocType
  docNumber: string
  issueDate: string
  dueDate: string
  reference: string
  currency: string
  // Company (from brand, editable)
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  companyWebsite: string
  companyLogoUrl: string
  taxId: string
  // Banking (from brand, editable)
  bankName: string
  accountName: string
  accountNumber: string
  branchCode: string
  // Client
  clientName: string
  clientCompany: string
  clientAddress: string
  clientPhone: string
  clientEmail: string
  // Items
  lineItems: LineItem[]
  discountRate: number
  // Extras
  notes: string
  terms: string
  footerText: string
}

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  jobTitle?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DOC_TYPES: { id: DocType; label: string; icon: React.FC<{ className?: string }>; desc: string }[] = [
  { id: 'invoice',   label: 'Invoice',    icon: FileText,   desc: 'Bill a client for completed work' },
  { id: 'quotation', label: 'Quotation',  icon: FileCheck,  desc: 'Send a price estimate before work starts' },
  { id: 'proposal',  label: 'Proposal',   icon: BookOpen,   desc: 'Pitch a project or service' },
  { id: 'contract',  label: 'Contract',   icon: File,       desc: 'Formal agreement with terms' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'ZAR', 'NGN', 'GHS', 'TZS', 'UGX', 'XOF', 'MAD', 'EGP']
const TAX_PRESETS = ['0', '5', '7.5', '10', '14', '15', '16', '18', '20', '25']

function newLineItem(): LineItem {
  return { id: Math.random().toString(36).slice(2), description: '', quantity: '1', unitPrice: '', taxRate: '0' }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function in30DaysStr() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function calcTotals(items: LineItem[], discountRate: number) {
  const subtotal = items.reduce((s, li) => {
    const q = parseFloat(li.quantity) || 0
    const p = parseFloat(li.unitPrice) || 0
    return s + q * p
  }, 0)
  const tax = items.reduce((s, li) => {
    const q = parseFloat(li.quantity) || 0
    const p = parseFloat(li.unitPrice) || 0
    const t = parseFloat(li.taxRate) || 0
    return s + q * p * (t / 100)
  }, 0)
  const discount = subtotal * (discountRate / 100)
  return { subtotal, tax, discount, grand: subtotal + tax - discount }
}

function fmt(cur: string, n: number) {
  return `${cur} ${n.toFixed(2)}`
}

// ── Contact Picker ───────────────────────────────────────────────────────────

function ContactPicker({ token, onSelect }: { token?: string; onSelect: (c: Contact | null) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    const q = query ? `?q=${encodeURIComponent(query)}` : ''
    apiClient<{ contacts: Contact[] }>(`/api/contacts${q}`, { token })
      .then(d => setResults(d.contacts?.slice(0, 10) ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [open, query, token])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:border-indigo-300 bg-white transition-colors"
      >
        <Search className="w-4 h-4 flex-shrink-0 text-gray-400" />
        <span className="flex-1 text-left">Search contacts…</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Type a name…"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-indigo-400" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? <p className="text-xs text-center py-4 text-gray-400">Searching…</p>
              : results.length === 0 ? <p className="text-xs text-center py-4 text-gray-400">No contacts found</p>
              : results.map(c => (
                <button key={c.id} onClick={() => { onSelect(c); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {c.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                  </div>
                </button>
              ))}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button onClick={() => { onSelect(null); setOpen(false) }}
              className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-semibold text-center py-1.5">
              + Enter client details manually ↓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? 'flex-1 min-w-0' : 'w-full'}>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white'
const textareaCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white resize-none'

// ── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Type & Client', icon: User },
  { id: 2, label: 'Line Items',    icon: FileText },
  { id: 3, label: 'Details',       icon: StickyNote },
  { id: 4, label: 'Preview',       icon: Eye },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewDocumentPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [step, setStep] = useState(1)
  const [brandLoaded, setBrandLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    docType: 'invoice',
    docNumber: `INV-${String(Date.now()).slice(-6)}`,
    issueDate: todayStr(),
    dueDate: in30DaysStr(),
    reference: '',
    currency: 'USD',
    companyName: '', companyAddress: '', companyPhone: '', companyEmail: '',
    companyWebsite: '', companyLogoUrl: '', taxId: '',
    bankName: '', accountName: '', accountNumber: '', branchCode: '',
    clientName: '', clientCompany: '', clientAddress: '', clientPhone: '', clientEmail: '',
    lineItems: [newLineItem()],
    discountRate: 0,
    notes: '',
    terms: 'Payment is due within 30 days of the invoice date.',
    footerText: '',
  })

  const set = useCallback(<K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm(f => ({ ...f, [key]: val }))
  }, [])

  // Load brand profile
  useEffect(() => {
    if (!token) return
    apiClient<{ profile: Record<string, unknown> }>('/api/business-profile', { token })
      .then(d => {
        const p = d.profile || {}
        const bank = (p.bankDetails as Record<string, string>) || {}
        setForm(f => ({
          ...f,
          companyName: (p.companyName as string) || f.companyName,
          companyAddress: (p.address as string) || f.companyAddress,
          companyPhone: (p.phone as string) || f.companyPhone,
          companyEmail: (p.email as string) || f.companyEmail,
          companyWebsite: (p.website as string) || f.companyWebsite,
          companyLogoUrl: (p.logoUrl as string) || f.companyLogoUrl,
          taxId: (p.taxId as string) || f.taxId,
          footerText: (p.footerText as string) || f.footerText,
          bankName: bank.bankName || f.bankName,
          accountName: bank.accountName || f.accountName,
          accountNumber: bank.accountNumber || f.accountNumber,
          branchCode: bank.branchCode || f.branchCode,
          currency: (p.defaultCurrency as string) || f.currency,
        }))
        setBrandLoaded(true)
      })
      .catch(() => setBrandLoaded(true))
  }, [token])

  // Derive doc number prefix from doc type
  useEffect(() => {
    const prefixes: Record<DocType, string> = { invoice: 'INV', quotation: 'QT', proposal: 'PROP', contract: 'CON' }
    setForm(f => ({ ...f, docNumber: `${prefixes[f.docType]}-${String(Date.now()).slice(-6)}` }))
  }, [form.docType])

  // ── Line items helpers ──────────────────────────────────────────────────────
  const updateLine = (id: string, field: keyof LineItem, val: string) => {
    setForm(f => ({ ...f, lineItems: f.lineItems.map(li => li.id === id ? { ...li, [field]: val } : li) }))
  }
  const addLine = () => setForm(f => ({ ...f, lineItems: [...f.lineItems, newLineItem()] }))
  const removeLine = (id: string) => setForm(f => ({
    ...f, lineItems: f.lineItems.length > 1 ? f.lineItems.filter(li => li.id !== id) : f.lineItems
  }))

  // Contact fill
  const fillContact = (c: Contact | null) => {
    if (!c) return
    setForm(f => ({
      ...f,
      clientName: c.name || f.clientName,
      clientCompany: c.company || f.clientCompany,
      clientPhone: c.phone || f.clientPhone,
      clientEmail: c.email || f.clientEmail,
    }))
  }

  // Totals
  const { subtotal, tax, discount, grand } = useMemo(
    () => calcTotals(form.lineItems, form.discountRate),
    [form.lineItems, form.discountRate]
  )

  // PDF data
  const pdfData: ZuriDocData = { ...form }

  // Save to backend
  const saveDocument = async () => {
    if (!token) return
    setSaving(true)
    try {
      await apiClient('/api/documents', {
        token,
        method: 'POST',
        body: JSON.stringify({
          type: form.docType,
          title: `${form.docType.charAt(0).toUpperCase() + form.docType.slice(1)} – ${form.clientName || 'Draft'}`,
          content: form,
          status: 'draft',
          clientName: form.clientName,
          totalAmount: grand,
          currency: form.currency,
        }),
      })
    } catch {
      // ok — proceed to preview anyway
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => {
    if (step === 3) saveDocument()
    setStep(s => Math.min(s + 1, 4))
    window.scrollTo({ top: 0 })
  }
  const goPrev = () => { setStep(s => Math.max(s - 1, 1)); window.scrollTo({ top: 0 }) }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_220px,#f8fafc_100%)] min-h-screen pb-24">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-4 flex items-center gap-3 max-w-3xl mx-auto">
        <Link href="/business" className="p-2 rounded-xl hover:bg-white/70 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-base font-black text-gray-950 tracking-tight">New Document</h1>
          <p className="text-[11px] text-gray-500 leading-none mt-0.5">
            {brandLoaded ? form.companyName || 'Fill in your details below' : 'Loading brand profile…'}
          </p>
        </div>
      </div>

      {/* ── Stepper ───────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 mb-6">
        <div className="relative flex items-center">
          {/* Track line */}
          <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200 -z-10" />
          <div
            className="absolute left-0 top-4 h-0.5 bg-indigo-600 -z-10 transition-all duration-500"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          />
          {STEPS.map(s => (
            <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5">
              <button
                onClick={() => s.id < step && setStep(s.id)}
                disabled={s.id > step}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                  s.id < step
                    ? 'bg-indigo-600 text-white'
                    : s.id === step
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-white border-2 border-gray-200 text-gray-400'
                }`}
              >
                {s.id < step ? <Check className="w-3.5 h-3.5" /> : s.id}
              </button>
              <span className={`text-[10px] font-semibold whitespace-nowrap transition-colors ${
                s.id === step ? 'text-indigo-700' : s.id < step ? 'text-gray-600' : 'text-gray-400'
              }`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Step content ──────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 md:px-6">

        {/* ── STEP 1: Type + Client ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Doc type */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                Document Type
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {DOC_TYPES.map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => set('docType', id)}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
                      form.docType === id
                        ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-100'
                        : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      form.docType === id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${form.docType === id ? 'text-indigo-700' : 'text-gray-900'}`}>{label}</p>
                      <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Client */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                Client Details
              </h2>
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Search your contacts to auto-fill, or type manually.</p>
                <ContactPicker token={token ?? undefined} onSelect={fillContact} />
                <div className="flex gap-3">
                  <Field label="Client / Individual Name *" half>
                    <input value={form.clientName} onChange={e => set('clientName', e.target.value)}
                      placeholder="John Doe" className={inputCls} />
                  </Field>
                  <Field label="Company (optional)" half>
                    <input value={form.clientCompany} onChange={e => set('clientCompany', e.target.value)}
                      placeholder="Acme Ltd." className={inputCls} />
                  </Field>
                </div>
                <Field label="Address">
                  <textarea value={form.clientAddress} onChange={e => set('clientAddress', e.target.value)}
                    placeholder="123 Main St, City, Country" rows={2} className={textareaCls} />
                </Field>
                <div className="flex gap-3">
                  <Field label="Email" half>
                    <input type="email" value={form.clientEmail} onChange={e => set('clientEmail', e.target.value)}
                      placeholder="client@company.com" className={inputCls} />
                  </Field>
                  <Field label="Phone" half>
                    <input value={form.clientPhone} onChange={e => set('clientPhone', e.target.value)}
                      placeholder="+1 555 000 0000" className={inputCls} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Your company (collapsed by default) */}
            <CompanySection form={form} set={set} />
          </div>
        )}

        {/* ── STEP 2: Line Items ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-gray-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                    <FileText className="w-3 h-3" />
                  </span>
                  Services / Products
                </h2>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-500 font-semibold">Currency</label>
                  <select value={form.currency} onChange={e => set('currency', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_80px_110px_80px_36px] gap-2 px-1 mb-1.5">
                {['Description', 'Qty', 'Unit Price', 'Tax %', ''].map(h => (
                  <p key={h} className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{h}</p>
                ))}
              </div>

              <div className="space-y-2">
                {form.lineItems.map((li, i) => (
                  <div key={li.id} className="grid grid-cols-1 md:grid-cols-[1fr_80px_110px_80px_36px] gap-2 p-3 md:p-1.5 rounded-2xl bg-gray-50/60 border border-gray-100 md:border-transparent md:bg-transparent">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 md:hidden">Description</p>
                      <input value={li.description} onChange={e => updateLine(li.id, 'description', e.target.value)}
                        placeholder={`Item ${i + 1} — e.g. Web design, 1 month support`}
                        className={inputCls} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 md:hidden">Qty</p>
                      <input type="number" min="0" value={li.quantity} onChange={e => updateLine(li.id, 'quantity', e.target.value)}
                        className={inputCls} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 md:hidden">Unit Price</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{form.currency}</span>
                        <input type="number" min="0" step="0.01" value={li.unitPrice} onChange={e => updateLine(li.id, 'unitPrice', e.target.value)}
                          placeholder="0.00" className={inputCls + ' pl-10'} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 md:hidden">Tax %</p>
                      <select value={li.taxRate} onChange={e => updateLine(li.id, 'taxRate', e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25">
                        {TAX_PRESETS.map(t => <option key={t} value={t}>{t}%</option>)}
                      </select>
                    </div>
                    <button onClick={() => removeLine(li.id)} disabled={form.lineItems.length === 1}
                      className="self-center flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={addLine}
                className="mt-3 flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-semibold transition-colors">
                <Plus className="w-4 h-4" />Add line item
              </button>
            </div>

            {/* Totals summary */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                  <CreditCard className="w-3 h-3" />
                </span>
                Totals
              </h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-semibold text-gray-900">{fmt(form.currency, subtotal)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span className="font-semibold text-gray-900">{fmt(form.currency, tax)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Discount</span>
                      <span className="font-semibold text-red-600">-{fmt(form.currency, discount)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between">
                    <span className="text-sm font-black text-gray-950">Total Due</span>
                    <span className="text-lg font-black text-indigo-600">{fmt(form.currency, grand)}</span>
                  </div>
                </div>
                <div className="sm:w-48">
                  <Field label="Global Discount %">
                    <input type="number" min="0" max="100" value={form.discountRate}
                      onChange={e => set('discountRate', parseFloat(e.target.value) || 0)}
                      className={inputCls} />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Details ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Doc metadata */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                  <StickyNote className="w-3 h-3" />
                </span>
                Document Info
              </h2>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Field label="Document Number" half>
                    <input value={form.docNumber} onChange={e => set('docNumber', e.target.value)}
                      className={inputCls} />
                  </Field>
                  <Field label="Reference / PO No." half>
                    <input value={form.reference} onChange={e => set('reference', e.target.value)}
                      placeholder="Optional" className={inputCls} />
                  </Field>
                </div>
                <div className="flex gap-3">
                  <Field label="Issue Date" half>
                    <input type="date" value={form.issueDate} onChange={e => set('issueDate', e.target.value)}
                      className={inputCls} />
                  </Field>
                  <Field label="Due / Expiry Date" half>
                    <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
                      className={inputCls} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Notes + Terms */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4">Notes &amp; Terms</h2>
              <div className="space-y-3">
                <Field label="Notes (shown on document)">
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                    rows={3} placeholder="Additional notes for the client…" className={textareaCls} />
                </Field>
                <Field label="Terms &amp; Conditions">
                  <textarea value={form.terms} onChange={e => set('terms', e.target.value)}
                    rows={3} className={textareaCls} />
                </Field>
                <Field label="Footer Text (appears at bottom of PDF)">
                  <input value={form.footerText} onChange={e => set('footerText', e.target.value)}
                    placeholder={`Thank you for your business — ${form.companyName || 'Your Company'}`}
                    className={inputCls} />
                </Field>
              </div>
            </div>

            {/* Banking */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                Banking Details (shown on PDF)
              </h2>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Field label="Bank Name" half>
                    <input value={form.bankName} onChange={e => set('bankName', e.target.value)}
                      placeholder="First National Bank" className={inputCls} />
                  </Field>
                  <Field label="Account Name" half>
                    <input value={form.accountName} onChange={e => set('accountName', e.target.value)}
                      placeholder="Your Company LLC" className={inputCls} />
                  </Field>
                </div>
                <div className="flex gap-3">
                  <Field label="Account Number" half>
                    <input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)}
                      placeholder="1234567890" className={inputCls} />
                  </Field>
                  <Field label="Branch Code / SWIFT" half>
                    <input value={form.branchCode} onChange={e => set('branchCode', e.target.value)}
                      placeholder="250655" className={inputCls} />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Preview ─────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            {/* Summary card */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                Document Summary
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Type</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5 capitalize">{form.docType}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Number</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{form.docNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Client</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{form.clientName || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</p>
                  <p className="text-sm font-black text-indigo-600 mt-0.5">{fmt(form.currency, grand)}</p>
                </div>
              </div>

              {/* Items preview */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="bg-indigo-50 grid grid-cols-[1fr_60px_90px] px-4 py-2.5">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Item</p>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide text-right">Qty</p>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide text-right">Total</p>
                </div>
                {form.lineItems.filter(li => li.description.trim()).map((li, i) => {
                  const q = parseFloat(li.quantity) || 0
                  const p = parseFloat(li.unitPrice) || 0
                  const t = parseFloat(li.taxRate) || 0
                  return (
                    <div key={li.id} className={`grid grid-cols-[1fr_60px_90px] px-4 py-3 border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                      <p className="text-sm text-gray-900">{li.description}</p>
                      <p className="text-sm text-gray-600 text-right">{li.quantity}</p>
                      <p className="text-sm font-semibold text-gray-900 text-right">{fmt(form.currency, q * p * (1 + t / 100))}</p>
                    </div>
                  )
                })}
              </div>

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <div className="w-52 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{fmt(form.currency, subtotal)}</span>
                  </div>
                  {tax > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Tax</span><span className="font-medium">{fmt(form.currency, tax)}</span></div>}
                  {discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Discount</span><span className="font-medium text-red-600">-{fmt(form.currency, discount)}</span></div>}
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-sm font-black text-gray-950">Total Due</span>
                    <span className="text-base font-black text-indigo-600">{fmt(form.currency, grand)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Download */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-[1.75rem] p-5 text-white shadow-lg shadow-indigo-300/40">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Download className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-lg">Download PDF</h3>
                  <p className="text-indigo-200 text-sm mt-0.5">
                    Your branded {form.docType} is ready. The PDF includes your company logo, banking details, and all line items.
                  </p>
                  <div className="mt-4">
                    <PDFDownloadLink
                      document={<ZuriDocumentPDF data={pdfData} />}
                      fileName={`${form.docNumber}-${form.clientName || 'document'}.pdf`.replace(/\s+/g, '-').toLowerCase()}
                    >
                      {({ loading: pdfLoading }) => (
                        <button className="inline-flex items-center gap-2.5 px-5 py-3 bg-white text-indigo-700 font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-lg shadow-indigo-900/20 text-sm">
                          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {pdfLoading ? 'Preparing PDF…' : `Download ${form.docType.charAt(0).toUpperCase() + form.docType.slice(1)} PDF`}
                        </button>
                      )}
                    </PDFDownloadLink>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit buttons */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors bg-white">
                <User className="w-3.5 h-3.5" />Edit Client
              </button>
              <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors bg-white">
                <FileText className="w-3.5 h-3.5" />Edit Items
              </button>
              <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors bg-white">
                <StickyNote className="w-3.5 h-3.5" />Edit Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:z-30 bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg shadow-gray-200/60">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={goPrev} disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <ArrowLeft className="w-4 h-4" />Back
          </button>
          <div className="text-xs text-gray-400 font-semibold">Step {step} of {STEPS.length}</div>
          {step < 4 ? (
            <button onClick={goNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 active:bg-indigo-700 transition-all shadow-sm shadow-indigo-200">
              {step === 3 ? (saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Preview<Eye className="w-4 h-4" /></>) : <>Next<ArrowRight className="w-4 h-4" /></>}
            </button>
          ) : (
            <Link href="/business"
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-950 text-white text-sm font-bold hover:bg-gray-800 transition-all">
              <Check className="w-4 h-4" />Done
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Company Section (collapsible) ─────────────────────────────────────────────

function CompanySection({ form, set }: { form: FormData; set: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  const [open, setOpen] = useState(false)
  const hasBrand = form.companyName || form.companyAddress

  return (
    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4.5 h-4.5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-950">Your Company Details</p>
            <p className="text-[11px] text-gray-500">
              {hasBrand ? `${form.companyName} — auto-filled from Brand Kit` : 'Auto-filled from Brand Kit · tap to edit'}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
          <div className="flex gap-3 pt-3">
            <Field label="Company Name" half>
              <input value={form.companyName} onChange={e => set('companyName', e.target.value)}
                placeholder="Your Company" className={inputCls} />
            </Field>
            <Field label="Tax ID / VAT" half>
              <input value={form.taxId} onChange={e => set('taxId', e.target.value)}
                placeholder="Optional" className={inputCls} />
            </Field>
          </div>
          <Field label="Address">
            <textarea value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)}
              rows={2} placeholder="123 Business Rd, City, Country" className={textareaCls} />
          </Field>
          <div className="flex gap-3">
            <Field label="Phone" half>
              <input value={form.companyPhone} onChange={e => set('companyPhone', e.target.value)}
                placeholder="+1 555 000 0000" className={inputCls} />
            </Field>
            <Field label="Email" half>
              <input value={form.companyEmail} onChange={e => set('companyEmail', e.target.value)}
                placeholder="hello@company.com" className={inputCls} />
            </Field>
          </div>
          <Field label="Website">
            <input value={form.companyWebsite} onChange={e => set('companyWebsite', e.target.value)}
              placeholder="www.company.com" className={inputCls} />
          </Field>
          {form.companyLogoUrl && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logo (from Brand Kit)</p>
              <img src={form.companyLogoUrl} alt="Logo" className="h-12 object-contain rounded-lg border border-gray-100 bg-gray-50 p-1.5" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
