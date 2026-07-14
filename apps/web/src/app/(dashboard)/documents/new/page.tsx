'use client'

import { useState, useEffect, useRef } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import InvoicePage from '@/components/generate-pdf/InvoicePage'
import { Invoice } from '@/components/generate-pdf/data/types'
import { initialInvoice } from '@/components/generate-pdf/data/initialData'
import '@/components/generate-pdf/invoice.css'
import { Search, ChevronDown, X, FileText, FileCheck, BookOpen, File, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  address?: string
}

interface BrandProfile {
  companyName: string | null
  logoUrl: string | null
  tagline: string | null
}

type DocType = 'invoice' | 'quotation' | 'proposal' | 'contract'

const DOC_TYPES: { id: DocType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'invoice',   label: 'Invoice',    icon: FileText },
  { id: 'quotation', label: 'Quotation',  icon: FileCheck },
  { id: 'proposal',  label: 'Proposal',   icon: BookOpen },
  { id: 'contract',  label: 'Contract',   icon: File },
]

const DOC_TITLE_MAP: Record<DocType, string> = {
  invoice:   'INVOICE',
  quotation: 'QUOTATION',
  proposal:  'PROPOSAL',
  contract:  'CONTRACT',
}

// ─── Contact Picker ───────────────────────────────────────────────────────────

function ContactPicker({
  token,
  onSelect,
  selected,
}: {
  token: string | undefined
  onSelect: (c: Contact | null) => void
  selected: Contact | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    const q = query ? `?q=${encodeURIComponent(query)}` : ''
    apiClient<{ contacts: Contact[] }>(`/api/contacts${q}`, { token })
      .then(d => setResults(d.contacts?.slice(0, 8) ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [open, query, token])

  if (selected) {
    return (
      <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {selected.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
          {selected.company && <p className="text-xs text-gray-500 truncate">{selected.company}</p>}
        </div>
        <button onClick={() => onSelect(null)} className="text-gray-400 hover:text-gray-600 p-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:border-indigo-300 transition-colors"
      >
        <Search className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">Search contacts…</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a name…"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-indigo-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-gray-400 text-center py-4">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No contacts found</p>
            ) : (
              results.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {c.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={() => { onSelect({ id: '__manual', name: '' }); setOpen(false) }}
              className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-semibold text-center py-1.5"
            >
              + Enter client manually in the document
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewDocumentPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [docType, setDocType]       = useState<DocType>('invoice')
  const [contact, setContact]       = useState<Contact | null>(null)
  const [brand, setBrand]           = useState<BrandProfile | null>(null)
  const [invoice, setInvoice]       = useState<Invoice | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string>('')

  // Load brand profile for company pre-fill and logo
  useEffect(() => {
    if (!token) return
    apiClient<{ profile: BrandProfile }>('/api/business-profile', { token })
      .then(d => setBrand(d.profile))
      .catch(() => {})
  }, [token])

  // Build initial invoice data from brand + doc type
  useEffect(() => {
    const base: Invoice = {
      ...initialInvoice,
      title: DOC_TITLE_MAP[docType],
      companyName: brand?.companyName ?? initialInvoice.companyName,
      logo: logoDataUrl || '',
    }
    // Pre-fill client from selected contact
    if (contact && contact.id !== '__manual') {
      base.clientName    = contact.name
      base.clientAddress = contact.company ?? ''
    }
    setInvoice(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, brand, contact])

  // When brand logo URL changes, fetch it as a data URL for the PDF
  useEffect(() => {
    if (!brand?.logoUrl) return
    fetch(brand.logoUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onload = () => setLogoDataUrl(reader.result as string)
        reader.readAsDataURL(blob)
      })
      .catch(() => {})
  }, [brand?.logoUrl])

  const handleInvoiceChange = (updated: Invoice) => {
    setInvoice(updated)
    try { localStorage.setItem(`zuriDoc_${docType}`, JSON.stringify(updated)) } catch {}
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/business" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">New Document</h1>
            <p className="text-[11px] text-gray-400 leading-none mt-0.5 hidden sm:block">
              Fill in the fields · click Save PDF to download
            </p>
          </div>
        </div>

        {/* Doc type pills */}
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
          {DOC_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setDocType(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                docType === id
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Client selector ───────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client</p>
        <ContactPicker token={token ?? undefined} onSelect={setContact} selected={contact} />
        {!contact && (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Select a contact to auto-fill client details, or leave blank and type directly in the document.
          </p>
        )}
      </div>

      {/* ── Invoice editor ────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          {invoice ? (
            <InvoicePage
              key={`${docType}-${contact?.id ?? 'none'}`}
              data={invoice}
              onChange={handleInvoiceChange}
            />
          ) : (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>
          )}
        </div>
      </div>

      {/* ── Tip ───────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-8 text-center">
        <p className="text-xs text-gray-400">
          Click any field in the document to edit it · Use the blue button above the form to download the PDF
        </p>
      </div>
    </div>
  )
}
