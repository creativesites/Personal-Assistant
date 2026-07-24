'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Check, FileText, FileCheck, BookOpen, File,
  Search, X, Plus, Trash2, ChevronDown, Download, Building2, User,
  CreditCard, StickyNote, Eye, Loader2, AlertCircle, Sparkles, Bot, Package,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'
import type { TemplateProps } from '@zuri/pdf-templates'
import { CatalogPickerModal, type CatalogProduct } from '../_components/catalog-picker-modal'

// Client-only PDF component — imported without SSR to avoid browser-API errors
const ClientPdfRenderer = dynamic(
  () => import('@/components/documents/ClientPdfRenderer'),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-32 rounded-2xl bg-gray-50 border border-gray-100">
      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
    </div>
  ) }
)

import { DynamicDocFields } from '../_components/dynamic-doc-fields'
import { SignatureSelector, type SelectedSignature } from '../_components/signature-selector'
import { BusinessProfilePicker } from '../_components/business-profile-picker'
import type { BusinessProfile } from '../../studio/_components/brand-module'

// ── Types ────────────────────────────────────────────────────────────────────

type DocType =
  | 'invoice' | 'quotation' | 'receipt' | 'purchase_order' | 'credit_note'
  | 'debit_note' | 'delivery_note' | 'catalog' | 'proposal' | 'contract'
  | 'statement_of_work' | 'service_agreement' | 'nda' | 'msa'
  | 'account_statement' | 'expense_report'

interface LineItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}

interface DocumentFormData {
  docType: DocType
  docNumber: string
  issueDate: string
  dueDate: string
  currency: string
  // Company — read-only, sourced from Brand Kit
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  companyWebsite: string
  companyLogoUrl: string | null
  taxId: string
  nrcNo?: string
  businessProfileId?: string | null
  // Banking — read-only, sourced from Brand Kit
  bankName: string
  bankAccount?: string
  accountName: string
  accountNumber: string
  branchCode: string
  footerText: string
  // Client
  clientName: string
  clientCompany: string
  clientPhone: string
  clientEmail: string
  // Items
  lineItems: LineItem[]
  discountRate: number
  // Extras
  notes: string
  terms: string
  structuredData: Record<string, any>
}

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  jobTitle?: string
}

interface DocTypeConfig {
  id: DocType
  label: string
  category: 'commercial' | 'legal' | 'finance'
  icon: React.FC<{ className?: string }>
  desc: string
}

const DOC_TYPES: DocTypeConfig[] = [
  // Commercial & Sales
  { id: 'quotation', label: 'Quotation', category: 'commercial', icon: FileCheck, desc: 'Send a price estimate before work starts' },
  { id: 'invoice', label: 'Invoice', category: 'commercial', icon: FileText, desc: 'Bill a client for completed work or products' },
  { id: 'receipt', label: 'Receipt', category: 'commercial', icon: CreditCard, desc: 'Payment confirmation receipt for records' },
  { id: 'purchase_order', label: 'Purchase Order', category: 'commercial', icon: Building2, desc: 'Vendor & procurement request with authorization' },
  { id: 'delivery_note', label: 'Delivery Note', category: 'commercial', icon: File, desc: 'Fulfillment & packing slip with recipient signature line' },
  { id: 'credit_note', label: 'Credit Note', category: 'commercial', icon: FileText, desc: 'Financial adjustment or billing credit' },
  { id: 'debit_note', label: 'Debit Note', category: 'commercial', icon: FileText, desc: 'Billing correction or supplemental charge' },
  { id: 'catalog', label: 'Wholesale Catalog', category: 'commercial', icon: BookOpen, desc: 'Product showcase with tiered volume pricing' },

  // Legal & Compliance
  { id: 'proposal', label: 'Proposal', category: 'legal', icon: BookOpen, desc: 'Pitch a project, scope, and deliverables' },
  { id: 'contract', label: 'Contract', category: 'legal', icon: File, desc: 'Formal agreement with terms and signature blocks' },
  { id: 'statement_of_work', label: 'Statement of Work', category: 'legal', icon: FileText, desc: 'Detailed project scope, milestones, and SOW' },
  { id: 'service_agreement', label: 'Service Agreement', category: 'legal', icon: FileCheck, desc: 'Framework agreement governing ongoing services' },
  { id: 'nda', label: 'NDA', category: 'legal', icon: FileText, desc: 'Non-disclosure agreement (Bilateral / Unilateral)' },
  { id: 'msa', label: 'MSA', category: 'legal', icon: File, desc: 'Master Services Agreement for long-term engagements' },

  // Finance & Operations
  { id: 'account_statement', label: 'Account Statement', category: 'finance', icon: FileText, desc: 'Client account ledger & 30/60/90-day aging summary' },
  { id: 'expense_report', label: 'Expense Report', category: 'finance', icon: CreditCard, desc: 'Internal/contractor expense reimbursement claim' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'ZAR', 'NGN', 'GHS', 'TZS', 'UGX', 'XOF', 'MAD', 'EGP', 'ZMW']
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
  let subtotal = 0, discount = 0, tax = 0
  for (const li of items) {
    const q = parseFloat(li.quantity) || 0
    const p = parseFloat(li.unitPrice) || 0
    const t = parseFloat(li.taxRate) || 0
    const lineSubtotal = q * p
    const lineDiscount = lineSubtotal * (discountRate / 100)
    const afterDiscount = lineSubtotal - lineDiscount
    const lineTax = afterDiscount * (t / 100)
    subtotal += lineSubtotal
    discount += lineDiscount
    tax += lineTax
  }
  return { subtotal, tax, discount, grand: subtotal - discount + tax }
}

function fmt(cur: string, n: number) {
  return `${cur} ${n.toFixed(2)}`
}

function brandAssetUrl(path: string, token?: string | null): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `/api/proxy${path}?token=${encodeURIComponent(token ?? '')}`
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
  const { addToast } = useToast()

  const [step, setStep] = useState(1)
  const [brandLoaded, setBrandLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedSignature, setSelectedSignature] = useState<SelectedSignature | null>(null)

  // AI Generate mode
  const [aiMode, setAiMode] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLimitReached, setAiLimitReached] = useState(false)

  const [form, setForm] = useState<DocumentFormData>({
    docType: 'invoice',
    docNumber: `INV-${String(Date.now()).slice(-6)}`,
    issueDate: todayStr(),
    dueDate: in30DaysStr(),
    currency: 'USD',
    companyName: '', companyAddress: '', companyPhone: '', companyEmail: '',
    companyWebsite: '', companyLogoUrl: '', taxId: '',
    bankName: '', accountName: '', accountNumber: '', branchCode: '', footerText: '',
    clientName: '', clientCompany: '', clientPhone: '', clientEmail: '',
    lineItems: [newLineItem()],
    discountRate: 0,
    notes: '',
    terms: 'Payment is due within 30 days of the invoice date.',
    structuredData: {},
  })

  const set = useCallback(<K extends keyof DocumentFormData>(key: K, val: DocumentFormData[K]) => {
    setForm(f => ({ ...f, [key]: val }))
  }, [])

  const setStructuredDataField = useCallback((key: string, val: any) => {
    setForm(f => ({
      ...f,
      structuredData: {
        ...(f.structuredData || {}),
        [key]: val,
      },
    }))
  }, [])

  // Load brand profile
  useEffect(() => {
    if (!token) return
    apiClient<Record<string, unknown>>('/api/business-profile', { token })
      .then(p => {
        const bank = (p.bankDetails as Record<string, string> | null) ?? {}
        setForm(f => ({
          ...f,
          companyName: (p.companyName as string) || f.companyName,
          companyAddress: (p.address as string) || f.companyAddress,
          companyPhone: (p.phone as string) || f.companyPhone,
          companyEmail: (p.email as string) || f.companyEmail,
          companyWebsite: (p.website as string) || f.companyWebsite,
          companyLogoUrl: (p.logoUrl as string) || f.companyLogoUrl,
          taxId: (p.taxId as string) || f.taxId,
          currency: (p.defaultCurrency as string) || f.currency,
          bankName: bank.bankName || f.bankName,
          accountName: bank.accountName || f.accountName,
          accountNumber: bank.accountNumber || f.accountNumber,
          branchCode: bank.branchCode || f.branchCode,
          footerText: (p.footerText as string) || f.footerText,
          notes: f.notes || (p.defaultTerms ? '' : f.notes),
          terms: f.terms || (p.defaultTerms as string) || f.terms,
        }))
        setBrandLoaded(true)
      })
      .catch(() => setBrandLoaded(true))
  }, [token])

  // Update doc number prefix when doc type changes
  useEffect(() => {
    if (documentId) return
    const prefixes: Record<DocType, string> = {
      invoice: 'INV',
      quotation: 'QT',
      receipt: 'RC',
      purchase_order: 'PO',
      credit_note: 'CN',
      debit_note: 'DN',
      delivery_note: 'DEL',
      catalog: 'CAT',
      proposal: 'PROP',
      contract: 'CON',
      statement_of_work: 'SOW',
      service_agreement: 'SA',
      nda: 'NDA',
      msa: 'MSA',
      account_statement: 'STMT',
      expense_report: 'EXP',
    }
    setForm(f => ({ ...f, docNumber: `${prefixes[f.docType]}-${String(Date.now()).slice(-6)}` }))
  }, [form.docType, documentId])

  // ── Catalog Product Selection ────────────────────────────────────────────────
  const [catalogModalOpen, setCatalogModalOpen] = useState(false)
  const handleSelectCatalogProduct = useCallback((p: CatalogProduct) => {
    const displayPrice = p.sellingPrice ?? p.price ?? 0
    const newItem: LineItem = {
      id: Math.random().toString(36).slice(2),
      description: `${p.name}${p.description ? ` — ${p.description}` : ''}`,
      quantity: '1',
      unitPrice: String(Number(displayPrice).toFixed(2)),
      taxRate: '0',
    }
    setForm(f => ({
      ...f,
      currency: p.currency || f.currency,
      lineItems: [...f.lineItems.filter(li => li.description.trim() !== ''), newItem],
    }))
  }, [])

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
    if (!c) { setSelectedContactId(null); return }
    setSelectedContactId(c.id)
    setForm(f => ({
      ...f,
      clientName: c.name || '',
      clientCompany: c.company || '',
      clientPhone: c.phone || '',
      clientEmail: c.email || '',
    }))
  }

  // Totals
  const { subtotal, tax, discount, grand } = useMemo(
    () => calcTotals(form.lineItems, form.discountRate),
    [form.lineItems, form.discountRate]
  )

  // Render context — once the document is saved (documentId is set), the
  // preview/download step fetches the same {templateKey, document, business,
  // contact} shape the server-render path used to build, and renders it
  // client-side via the real template the document/brand profile actually
  // resolve to (see docs/PDF_TEMPLATE_GUIDE.md) rather than a single
  // hardcoded layout derived from raw form state.
  const [renderContext, setRenderContext] = useState<(TemplateProps & { documentType: string; templateKey: string }) | null>(null)
  const [renderContextError, setRenderContextError] = useState<string | null>(null)

  useEffect(() => {
    if (!documentId || !token) return
    let isMounted = true
    apiClient<TemplateProps & { documentType: string; templateKey: string }>(`/api/documents/${documentId}/render-context`, { token })
      .then(data => { if (isMounted) setRenderContext(data) })
      .catch((err: any) => { if (isMounted) setRenderContextError(err.message || 'Failed to load PDF preview') })
    return () => { isMounted = false }
  }, [documentId, token])

  // Save document to backend (persistence only — no PDF generation)
  const saveDocument = useCallback(async () => {
    if (!token || saving) return
    setSaving(true)
    setSaveError(null)

    let items = form.lineItems
      .filter(li => li.description.trim())
      .map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 0,
        unitPriceCents: Math.round((parseFloat(li.unitPrice) || 0) * 100),
        taxPct: parseFloat(li.taxRate) || 0,
        discountPct: form.discountRate || undefined,
      }))

    if (items.length === 0) {
      if (['nda', 'msa', 'contract', 'proposal', 'statement_of_work', 'service_agreement'].includes(form.docType)) {
        items = [{
          description: 'Execution of Agreement Terms & Scope of Work',
          quantity: 1,
          unitPriceCents: 0,
          taxPct: 0,
          discountPct: undefined,
        }]
      } else {
        setSaveError('Add at least one line item before generating.')
        setSaving(false)
        return
      }
    }

    const body: Record<string, unknown> = {
      documentType: form.docType,
      businessProfileId: form.businessProfileId || undefined,
      signatureId: selectedSignature?.id || undefined,
      currency: form.currency,
      items,
      structuredData: {
        ...(form.structuredData || {}),
        signature: selectedSignature || undefined,
      },
      notes: form.notes || undefined,
      terms: form.terms || undefined,
      dueDate: form.dueDate || undefined,
    }
    if (selectedContactId) {
      body.contactId = selectedContactId
    } else if (form.clientName.trim()) {
      body.manualContact = {
        name: form.clientName.trim(),
        company: form.clientCompany || undefined,
        email: form.clientEmail || undefined,
        phone: form.clientPhone || undefined,
      }
    }

    try {
      if (documentId) {
        const { document: updated } = await apiClient<{ document: { id: string; documentNumber: string } }>(
          `/api/documents/${documentId}`,
          { token, method: 'PATCH', body: JSON.stringify(body) },
        )
        setDocumentId(updated.id)
        setForm(f => ({ ...f, docNumber: updated.documentNumber }))
      } else {
        const { document: created } = await apiClient<{ document: { id: string; documentNumber: string } }>(
          '/api/documents',
          { token, method: 'POST', body: JSON.stringify(body) },
        )
        setDocumentId(created.id)
        setForm(f => ({ ...f, docNumber: created.documentNumber }))
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }, [token, form, selectedContactId, saving, documentId, selectedSignature])

  // Generate with AI — calls /api/documents/ai-generate and fills form
  const generateWithAI = useCallback(async () => {
    if (!token || !selectedContactId) {
      setAiError('Please select a contact first — AI generation needs a contact to personalise the document.')
      return
    }
    if (!aiInstruction.trim()) {
      setAiError('Please describe what you need (e.g. "Invoice for 3 months of web design at $2000/month").')
      return
    }
    setAiGenerating(true)
    setAiError(null)
    setAiLimitReached(false)

    try {
      const { document: doc } = await apiClient<{ document: {
        id: string; documentNumber: string; structuredData: {
          items: { description: string; quantity: number; unitPriceCents: number; taxPct: number; discountPct?: number }[];
          notes: string | null; terms: string | null; dueDate: string | null; validUntil: string | null;
        };
      }}>(
        '/api/documents/ai-generate',
        {
          token, method: 'POST',
          body: JSON.stringify({
            contactId: selectedContactId,
            documentType: form.docType,
            instruction: aiInstruction,
          }),
        }
      )

      const sd = doc.structuredData
      const lineItems: LineItem[] = (sd.items || []).map(item => ({
        id: Math.random().toString(36).slice(2),
        description: item.description,
        quantity: String(item.quantity || 1),
        unitPrice: String(((item.unitPriceCents || 0) / 100).toFixed(2)),
        taxRate: String(item.taxPct || 0),
      }))

      setDocumentId(doc.id)
      setForm(f => ({
        ...f,
        docNumber: doc.documentNumber,
        lineItems: lineItems.length > 0 ? lineItems : [newLineItem()],
        notes: sd.notes || f.notes,
        terms: sd.terms || f.terms,
        dueDate: sd.dueDate || sd.validUntil || f.dueDate,
      }))

      addToast({ variant: 'success', title: 'Document generated with AI' })
      setStep(4)
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setAiLimitReached(true)
      } else {
        setAiError(err instanceof ApiError ? err.message : 'AI generation failed. Try again or switch to manual.')
      }
    } finally {
      setAiGenerating(false)
    }
  }, [token, selectedContactId, form.docType, aiInstruction, addToast])

  const goNext = () => {
    if (step === 3) {
      saveDocument()
    }
    setStep(s => Math.min(s + 1, 4))
    window.scrollTo({ top: 0 })
  }
  const goPrev = () => { setStep(s => Math.max(s - 1, 1)); window.scrollTo({ top: 0 }) }

  const pdfFileName = `${form.docNumber || form.docType}.pdf`
  const docLabel = form.docType.charAt(0).toUpperCase() + form.docType.slice(1)
  const isNonBillingDoc = ['nda', 'msa', 'contract', 'proposal', 'statement_of_work', 'service_agreement', 'delivery_note', 'account_statement', 'expense_report'].includes(form.docType)

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
            {/* Mode toggle: Manual vs AI */}
            <div className="flex gap-2 p-1 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <button
                onClick={() => { setAiMode(false); setAiError(null) }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !aiMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />Manual
              </button>
              <button
                onClick={() => { setAiMode(true); setAiError(null) }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  aiMode ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Sparkles className="w-4 h-4" />Generate with AI
              </button>
            </div>

            {/* Doc type */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                  Document Type
                </span>
              </h2>

              <div className="space-y-4">
                {[
                  { cat: 'commercial', name: 'Commercial & Sales' },
                  { cat: 'legal', name: 'Legal & Compliance' },
                  { cat: 'finance', name: 'Finance & Operations' },
                ].map(group => {
                  const items = DOC_TYPES.filter(d => d.category === group.cat)
                  return (
                    <div key={group.cat} className="space-y-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">{group.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {items.map(({ id, label, icon: Icon, desc }) => (
                          <button
                            key={id}
                            onClick={() => set('docType', id)}
                            className={`flex items-start gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                              form.docType === id
                                ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-100'
                                : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              form.docType === id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-bold ${form.docType === id ? 'text-indigo-700' : 'text-gray-900'}`}>{label}</p>
                              <p className="text-[10px] text-gray-500 leading-snug truncate mt-0.5">{desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Client */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                Client Details
                {aiMode && <span className="ml-1 text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">Required for AI</span>}
              </h2>
              <div className="space-y-3">
                {selectedContactId ? (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{form.clientName || 'Contact'}</p>
                      {form.clientCompany && <p className="text-xs text-gray-500 truncate">{form.clientCompany}</p>}
                      {(form.clientEmail || form.clientPhone) && (
                        <p className="text-xs text-gray-500 truncate">
                          {[form.clientEmail, form.clientPhone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button onClick={() => fillContact(null)}
                      className="flex-shrink-0 text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                      <X className="w-3 h-3" />Change
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      {aiMode ? 'Select a contact — AI uses their conversation history to generate accurate line items.' : 'Search your contacts to auto-fill, or type manually.'}
                    </p>
                    <ContactPicker token={token ?? undefined} onSelect={fillContact} />
                    {!aiMode && (
                      <div className="space-y-3 mt-2">
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
                    )}
                  </>
                )}
              </div>
            </div>

            {/* AI instruction panel */}
            {aiMode && (
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-[1.75rem] border border-indigo-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-950">AI Document Generation</p>
                    <p className="text-[11px] text-gray-500">Describe what you need in plain language</p>
                  </div>
                </div>
                <textarea
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  rows={4}
                  placeholder={'Examples:\n• "Invoice for 3 months of web design at $1,500/month with 16% VAT"\n• "Quotation for office renovation: painting, flooring, and furniture"\n• "Software development proposal for e-commerce platform"'}
                  className={textareaCls}
                />
                {aiLimitReached && (
                  <div className="flex items-start gap-3 mt-3 p-3 bg-amber-50 rounded-2xl border border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-900">You've hit your daily AI document limit.</p>
                      <p className="text-xs text-amber-700 mt-0.5">Upgrade for unlimited document generation.</p>
                    </div>
                    <a
                      href="/billing"
                      className="flex-shrink-0 rounded-xl bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-700 transition-colors"
                    >
                      Upgrade
                    </a>
                  </div>
                )}
                {aiError && !aiLimitReached && (
                  <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{aiError}</p>
                  </div>
                )}
                <button
                  onClick={generateWithAI}
                  disabled={aiGenerating || !aiInstruction.trim()}
                  className="mt-4 w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                  {aiGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating your document…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate {docLabel}</>
                  )}
                </button>
              </div>
            )}

            {/* Your company details & brand switcher */}
            <CompanySection form={form} setForm={setForm} token={token} />
          </div>
        )}

        {/* ── STEP 2: Doc Specifications & Dynamic Fields ──────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Dynamic Type-Specific Fields */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-black text-gray-950 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                {docLabel} Specifications
              </h2>
              <DynamicDocFields
                docType={form.docType}
                values={form.structuredData || {}}
                onChange={setStructuredDataField}
              />
            </div>

            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-gray-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                    <FileText className="w-3 h-3" />
                  </span>
                  {isNonBillingDoc ? 'Itemized Schedule / Deliverables / Fees (Optional)' : 'Services / Products & Line Items'}
                </h2>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-500 font-semibold">Currency</label>
                  <select value={form.currency} onChange={e => set('currency', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {isNonBillingDoc && (
                <p className="text-xs text-gray-500 mb-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  Note: For contracts, NDAs, proposals, and agreements, itemized fee breakdowns are optional. Leave blank if overall contract consideration is set in the fields above.
                </p>
              )}

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
                        placeholder={`Item ${i + 1} — e.g. Scope milestone, Deliverable #1`}
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

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={addLine}
                  className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-semibold transition-colors">
                  <Plus className="w-4 h-4" />Add line item
                </button>
              </div>
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

        {/* ── STEP 3: Details & Terms ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                  <StickyNote className="w-3 h-3" />
                </span>
                Document Info
              </h2>
              <div className="space-y-3">
                <Field label="Document Number">
                  <input value={form.docNumber} disabled
                    className={inputCls + ' opacity-60 cursor-not-allowed'} />
                  <p className="text-[10px] text-gray-400 mt-1">Assigned automatically when you save the document.</p>
                </Field>
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
              </div>
            </div>

            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <SignatureSelector
                token={token ?? undefined}
                value={selectedSignature}
                onChange={setSelectedSignature}
              />
            </div>

            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-black text-gray-950">Payment Details</h2>
              </div>
              <p className="text-xs text-gray-500">
                Banking details shown on the PDF come from your{' '}
                <Link href="/business" className="text-indigo-600 hover:text-indigo-700 font-semibold">Brand Kit</Link>{' '}
                — update them there and every document will reflect it.
              </p>
              {form.bankName && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {form.bankName && <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-lg border border-gray-100">{form.bankName}</span>}
                  {form.accountNumber && <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-lg border border-gray-100">Acc: {form.accountNumber}</span>}
                  {form.branchCode && <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-lg border border-gray-100">Branch: {form.branchCode}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 4: Preview ─────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                Document Summary
                {documentId && (
                  <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Saved
                  </span>
                )}
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
                  const d = form.discountRate || 0
                  const afterDiscount = q * p * (1 - d / 100)
                  return (
                    <div key={li.id} className={`grid grid-cols-[1fr_60px_90px] px-4 py-3 border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                      <p className="text-sm text-gray-900">{li.description}</p>
                      <p className="text-sm text-gray-600 text-right">{li.quantity}</p>
                      <p className="text-sm font-semibold text-gray-900 text-right">{fmt(form.currency, afterDiscount * (1 + t / 100))}</p>
                    </div>
                  )
                })}
              </div>

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

            {/* Save status (if currently saving to backend) */}
            {saving && (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
                <p className="text-sm text-indigo-700 font-semibold">Saving to your documents library…</p>
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-semibold">{saveError}</p>
                </div>
                <button onClick={saveDocument} className="text-xs text-red-600 font-bold hover:text-red-700">Retry</button>
              </div>
            )}

            {/* PDF Preview + Download — rendered client-side */}
            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-950">Download Your {docLabel}</p>
                  <p className="text-xs text-gray-500">Preview and download your branded PDF document</p>
                </div>
              </div>
              {renderContextError ? (
                <div className="flex items-center justify-center h-24 rounded-2xl border border-red-100 bg-red-50">
                  <p className="text-xs text-red-500 font-semibold">{renderContextError}</p>
                </div>
              ) : renderContext ? (
                <ClientPdfRenderer
                  documentId={documentId!}
                  templateKey={renderContext.templateKey}
                  data={{ document: renderContext.document, business: renderContext.business, contact: renderContext.contact }}
                  fileName={pdfFileName}
                  docLabel={docLabel}
                  token={token}
                />
              ) : (
                <div className="flex items-center justify-center h-32 rounded-2xl bg-gray-50 border border-gray-100">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                </div>
              )}
            </div>

            {/* Edit shortcuts */}
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
      {/* z-50 beats the global MobileBottomNav's z-40 (layout.tsx) — both are
          fixed to bottom-0, and without a higher z-index here the app's own
          tab bar (rendered after <main> in the DOM) paints on top of these
          buttons on mobile, hiding them entirely. */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 md:z-30 bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg shadow-gray-200/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={goPrev} disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <ArrowLeft className="w-4 h-4" />Back
          </button>
          <div className="text-xs text-gray-400 font-semibold">Step {step} of {STEPS.length}</div>
          {step < 4 ? (
            /* Hide "Next" in step 1 when AI mode is active — user clicks "Generate" instead */
            step === 1 && aiMode ? (
              <div className="w-24" />
            ) : (
              <button onClick={goNext}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 active:bg-indigo-700 transition-all shadow-sm shadow-indigo-200">
                {step === 3 ? <>Save &amp; Preview<Eye className="w-4 h-4" /></> : <>Next<ArrowRight className="w-4 h-4" /></>}
              </button>
            )
          ) : (
            <Link href="/business"
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-950 text-white text-sm font-bold hover:bg-gray-800 transition-all">
              <Check className="w-4 h-4" />Done
            </Link>
          )}
        </div>
      </div>
      {/* Catalog Product Selection Modal */}
      <CatalogPickerModal
        open={catalogModalOpen}
        token={token ?? undefined}
        onClose={() => setCatalogModalOpen(false)}
        onSelect={handleSelectCatalogProduct}
      />
    </div>
  )
}

function CompanySection({
  form, setForm, token,
}: {
  form: DocumentFormData
  setForm: React.Dispatch<React.SetStateAction<DocumentFormData>>
  token?: string | null
}) {
  const [open, setOpen] = useState(true)

  const handleProfileSelect = (prof: BusinessProfile) => {
    setForm(f => ({
      ...f,
      businessProfileId: prof.id,
      companyName: prof.companyName || '',
      companyLogoUrl: prof.logoUrl || null,
      companyAddress: prof.address || '',
      companyPhone: prof.phone || '',
      companyEmail: prof.email || '',
      companyWebsite: prof.website || '',
      taxId: prof.taxId || (prof.bankDetails?.taxId as string) || '',
      bankName: prof.bankDetails?.bankName as string || '',
      bankAccount: prof.bankDetails?.accountNumber as string || '',
      terms: prof.defaultTerms || f.terms,
      currency: prof.defaultCurrency || f.currency,
    }))
  }

  return (
    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-950">Your Company &amp; Brand Details</p>
            <p className="text-[11px] text-gray-500">
              Select or edit the brand profile appearing on this document
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(v => !v)}>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="pt-2 border-t border-gray-50 space-y-3">
          <BusinessProfilePicker
            token={token ?? undefined}
            value={form.businessProfileId ?? null}
            onChange={id => setForm(f => ({ ...f, businessProfileId: id ?? undefined }))}
            onProfileSelect={handleProfileSelect}
          />

          <div className="bg-gray-50/80 rounded-2xl p-3 border border-gray-100 space-y-1.5 text-xs text-gray-600">
            {form.companyLogoUrl && (
              <img
                src={brandAssetUrl(form.companyLogoUrl, token)}
                alt="Logo"
                className="h-10 object-contain rounded-lg border border-gray-200 bg-white p-1 mb-2"
              />
            )}
            <p className="font-bold text-gray-900">{form.companyName || 'No business name set'}</p>
            {form.companyAddress && <p className="text-gray-500">{form.companyAddress}</p>}
            <p className="text-gray-500">
              {[form.companyPhone, form.companyEmail, form.companyWebsite].filter(Boolean).join(' · ') || 'No contact details'}
            </p>
            {(form.taxId || form.nrcNo) && (
              <p className="text-gray-500">
                {[form.taxId ? `Tax ID/TPIN: ${form.taxId}` : null, form.nrcNo ? `NRC/Reg: ${form.nrcNo}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
