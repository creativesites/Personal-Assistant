'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FileText, Plus, Trash2, Loader2, Download, RefreshCw, X, Send, ArrowRightCircle,
  Sparkles, ShieldCheck, MessageSquare, Link2, Eye, Package, Lightbulb, Search, Pencil,
  MoreHorizontal, ChevronDown, ChevronUp, Wand2,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, Dropdown, EmptyState, SkeletonCard, useToast } from '@/components/ui'

interface BrandKitSummary {
  companyName?: string | null
  logoUrl?: string | null
  themeColor?: string | null
  defaultCurrency?: string | null
  defaultTerms?: string | null
}

interface DocumentSummary {
  id: string
  documentType: string
  documentNumber: string
  title: string
  status: string
  currency: string
  totalCents: number
  hasPdf: boolean
  aiGenerated: boolean
  aiSummary: string | null
  shareToken: string | null
  viewCount: number
  contact: { id: string; name: string; avatarUrl: string | null } | null
  createdAt: string
}

interface SearchResult {
  id: string
  title: string
  documentType: string
  documentNumber: string
  status: string
  contactName: string | null
  score: number | null
}

interface QualityCheckResult {
  score: number
  issues: string[]
  recommendation: string
}

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
}

interface LineItem {
  description: string
  quantity: number
  unitPriceCents: number
  discountPct: number
  taxPct: number
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'default',
  generated: 'info',
  sent: 'info',
  viewed: 'purple',
  downloaded: 'purple',
  accepted: 'success',
  paid: 'success',
  rejected: 'error',
  expired: 'warning',
  archived: 'default',
}

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'quotation', label: 'Quotations' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'receipt', label: 'Receipts' },
]

// quotation -> invoice -> receipt (see plan §15 Phase 1) — matches the
// backend's CONVERSION_MAP in services/api/src/routes/documents.ts.
const CONVERSION_TARGETS: Record<string, string> = { quotation: 'invoice', invoice: 'receipt' }

const MANUAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'sent', label: 'Mark Sent' },
  { value: 'accepted', label: 'Mark Accepted' },
  { value: 'rejected', label: 'Mark Rejected' },
  { value: 'paid', label: 'Mark Paid' },
  { value: 'archived', label: 'Archive' },
]

function formatMoney(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency })
}

function emptyItem(): LineItem {
  return { description: '', quantity: 1, unitPriceCents: 0, discountPct: 0, taxPct: 0 }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// AI Document Assistant (plan §12/§15 Phase 3) — a small per-document chat.
// Edits structured_data via instructions ("reduce the price by 5%"); never
// touches the PDF directly, so a re-generate is still required to see it.
function DocumentChatPanel({ documentId, token, onChanged }: { documentId: string; token: string; onChanged: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    apiClient<{ messages: ChatMessage[] }>(`/api/documents/${documentId}/chat`, { token })
      .then(data => { setMessages(data.messages); setLoading(false) })
      .catch(() => setLoading(false))
  }, [documentId, token])

  const send = async () => {
    if (!input.trim() || sending) return
    const instruction = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: instruction }])
    setInput('')
    setSending(true)
    try {
      const data = await apiClient<{ reply: string }>(`/api/documents/${documentId}/chat`, {
        method: 'POST', token, body: JSON.stringify({ instruction }),
      })
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      onChanged()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
      <div className="max-h-48 overflow-y-auto p-2.5 space-y-1.5 bg-gray-50">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
        ) : messages.length === 0 ? (
          <p className="text-[11px] text-gray-400">Try &ldquo;reduce the price by 5%&rdquo; or &ldquo;make the terms shorter&rdquo;.</p>
        ) : (
          messages.map((m, i) => (
            <p key={i} className={`text-xs ${m.role === 'user' ? 'text-gray-700 font-medium' : 'text-indigo-700'}`}>
              {m.role === 'user' ? '' : '→ '}{m.content}
            </p>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5 p-2 bg-white">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Tell the AI what to change…"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

export default function BusinessPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [viewDataDoc, setViewDataDoc] = useState<DocumentSummary | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showRecurring, setShowRecurring] = useState(false)
  const [showPacks, setShowPacks] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [checkingQualityId, setCheckingQualityId] = useState<string | null>(null)
  const [qualityResults, setQualityResults] = useState<Record<string, QualityCheckResult>>({})
  const [chatOpenId, setChatOpenId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  const loadDocuments = () => {
    if (!token) return
    setLoading(true)
    const query = typeFilter !== 'all' ? `?type=${typeFilter}` : ''
    apiClient<{ documents: DocumentSummary[] }>(`/api/documents${query}`, { token })
      .then(data => { setDocuments(data.documents); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(loadDocuments, [token, typeFilter])

  const stats = useMemo(() => ({
    drafts: documents.filter(d => d.status === 'draft').length,
    generated: documents.filter(d => ['generated', 'sent', 'viewed', 'downloaded'].includes(d.status)).length,
    paid: documents.filter(d => d.status === 'paid' || d.status === 'accepted').length,
  }), [documents])

  const generatePdf = async (id: string) => {
    if (!token) return
    setGeneratingId(id)
    try {
      await apiClient(`/api/documents/${id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'PDF generated' })
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to generate PDF', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setGeneratingId(null)
    }
  }

  const downloadPdf = async (doc: DocumentSummary) => {
    if (!token) return
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const res = await fetch(`${apiUrl}/api/documents/${doc.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.documentNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast({ variant: 'error', title: 'Failed to download PDF' })
    }
  }

  const sendViaWhatsApp = async (id: string) => {
    if (!token) return
    setSendingId(id)
    try {
      await apiClient(`/api/documents/${id}/send`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Sent via WhatsApp' })
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to send', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSendingId(null)
    }
  }

  const convertDocument = async (doc: DocumentSummary) => {
    if (!token) return
    setConvertingId(doc.id)
    try {
      await apiClient(`/api/documents/${doc.id}/convert`, { method: 'POST', token })
      addToast({ variant: 'success', title: `Converted to ${CONVERSION_TARGETS[doc.documentType]}` })
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to convert', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setConvertingId(null)
    }
  }

  const setStatus = async (id: string, status: string) => {
    if (!token) return
    setStatusUpdatingId(id)
    try {
      await apiClient(`/api/documents/${id}/status`, { method: 'POST', token, body: JSON.stringify({ status }) })
      loadDocuments()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update status' })
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const deleteDocument = async (id: string) => {
    if (!token) return
    setDeletingId(id)
    try {
      const result = await apiClient<{ ok: boolean; deleted: boolean }>(`/api/documents/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: result.deleted ? 'Document deleted' : 'Document archived' })
      setDeleteConfirmId(null)
      loadDocuments()
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete document' })
    } finally {
      setDeletingId(null)
    }
  }

  const checkQuality = async (id: string) => {
    if (!token) return
    setCheckingQualityId(id)
    try {
      const result = await apiClient<QualityCheckResult>(`/api/documents/${id}/quality-check`, { method: 'POST', token })
      setQualityResults(prev => ({ ...prev, [id]: result }))
    } catch {
      addToast({ variant: 'error', title: 'Failed to check quality' })
    } finally {
      setCheckingQualityId(null)
    }
  }

  // Shareable view-tracking link (plan §15 Phase 4) — the same link already
  // sent alongside the WhatsApp attachment, surfaced here for copy/paste
  // into email or other channels.
  const copyShareLink = (doc: DocumentSummary) => {
    if (!doc.shareToken) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    navigator.clipboard.writeText(`${apiUrl}/api/documents/shared/${doc.shareToken}`)
    addToast({ variant: 'success', title: 'Share link copied' })
  }

  const runSearch = async (query: string) => {
    if (!token || !query.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const data = await apiClient<{ results: SearchResult[] }>(`/api/documents/search?q=${encodeURIComponent(query.trim())}`, { token })
      setSearchResults(data.results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6 pb-0">
        {/* Hero — value prop + manual-creation CTA front and center */}
        <div className="relative rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-5 md:p-6 max-w-5xl mx-auto w-full">
          {/* Decorative gradient overlay clipped separately so it doesn't clip the dropdown */}
          <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
          </div>
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                AI-native document management
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950">Documents</h1>
            <p className="text-sm text-gray-600 max-w-xl mt-1 leading-relaxed">
              Branded quotations, invoices &amp; receipts — pulled straight from your Brand Kit and contacts.
              Type a plain-English instruction, or fill one in yourself with live pricing as you go.
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.drafts}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">drafts</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.generated}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">generated</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.paid}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">paid / accepted</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
              <Link
                href="/documents/new"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-500 active:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 min-h-[44px]"
              >
                <Pencil className="w-4 h-4" />Create Document Manually
              </Link>
              <Link
                href="/documents/new"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-950 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/15 min-h-[44px]"
              >
                <Wand2 className="w-4 h-4" />Generate with AI
              </Link>
              <Dropdown
                align="left"
                trigger={
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white/85 border border-white text-gray-700 text-sm font-bold rounded-2xl hover:bg-white transition-all shadow-sm ring-1 ring-gray-100 min-h-[44px] w-full sm:w-auto">
                    <MoreHorizontal className="w-4 h-4" />More tools
                  </button>
                }
                items={[
                  { label: 'Insights', icon: <Lightbulb className="w-3.5 h-3.5 text-amber-500" />, onClick: () => setShowInsights(true) },
                  { label: 'Business Packs', icon: <Package className="w-3.5 h-3.5 text-indigo-500" />, onClick: () => setShowPacks(true) },
                  { label: 'Recurring Documents', icon: <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />, onClick: () => setShowRecurring(true) },
                  { label: 'Full Form (advanced)', icon: <FileText className="w-3.5 h-3.5 text-gray-500" />, href: '/documents/new' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 pt-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 flex-shrink-0">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  typeFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative sm:ml-auto sm:min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); runSearch(e.target.value) }}
              placeholder="Search documents…"
              className="w-full text-xs border border-gray-100 bg-white rounded-2xl pl-8 pr-3 py-2.5 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {searchQuery && (
              <div className="absolute right-0 top-full mt-1.5 w-80 max-w-[90vw] bg-white border border-gray-100 rounded-2xl shadow-lg z-20 max-h-72 overflow-y-auto">
                {searching ? (
                  <div className="p-3"><Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /></div>
                ) : !searchResults || searchResults.length === 0 ? (
                  <p className="text-xs text-gray-400 p-3">No matches.</p>
                ) : (
                  searchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSearchQuery(''); setSearchResults(null); setTypeFilter('all') }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-900 truncate">{r.title}</p>
                      <p className="text-[11px] text-gray-400">{r.contactName ?? 'No contact'} · {r.documentNumber} · {r.status}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-10 h-10 text-indigo-500" />}
            title="No documents yet"
            description="Create your first quotation or invoice — pulls in your contact, products, and Brand Kit automatically."
            action={
              <Link href="/documents/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />New Document
              </Link>
            }
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {documents.map(doc => (
              <div key={doc.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  {doc.contact ? (
                    <Link href={`/contacts/${doc.contact.id}`} className="flex-shrink-0">
                      <Avatar name={doc.contact.name} src={doc.contact.avatarUrl ?? undefined} size="sm" />
                    </Link>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-gray-400" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{doc.contact?.name ?? 'No contact'}</span>
                      <span className="text-xs text-gray-400">{doc.documentNumber}</span>
                      {doc.aiGenerated && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5">
                          <Sparkles className="w-2.5 h-2.5" />AI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{doc.title}</p>
                  </div>
                  {doc.viewCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400" title={`${doc.viewCount} view(s)`}>
                      <Eye className="w-3 h-3" />{doc.viewCount}
                    </span>
                  )}
                  <Badge variant={STATUS_VARIANTS[doc.status] ?? 'default'}>{doc.status}</Badge>
                  <button
                    onClick={() => {
                      if (doc.hasPdf) {
                        // Use the Next.js proxy with token in query so window.open can auth without headers
                        window.open(`/api/proxy/api/documents/${doc.id}/pdf?token=${encodeURIComponent(token ?? '')}`, '_blank')
                      } else {
                        setViewDataDoc(doc)
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                    title={doc.hasPdf ? 'View PDF' : 'View data'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {doc.hasPdf ? 'View' : 'Data'}
                  </button>
                  <Link
                    href={`/documents/${doc.id}/edit`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
                    title="Edit document"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  {doc.status === 'draft' && (
                    deleteConfirmId === doc.id ? (
                      <div className="flex items-center gap-1 text-xs">
                        <button onClick={() => deleteDocument(doc.id)} disabled={deletingId === doc.id} className="font-semibold text-red-600 hover:underline">
                          {deletingId === doc.id ? '…' : 'Yes'}
                        </button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-gray-400 hover:underline">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(doc.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete draft"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>

                {doc.aiSummary && (
                  <p className="text-xs text-gray-500 leading-relaxed mt-2 bg-gray-50 rounded-lg px-2.5 py-1.5">{doc.aiSummary}</p>
                )}

                {qualityResults[doc.id] && (
                  <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <p className="text-xs font-semibold text-amber-800">Quality: {qualityResults[doc.id].score}/10</p>
                    {qualityResults[doc.id].issues.length > 0 && (
                      <ul className="text-[11px] text-amber-700 list-disc list-inside mt-0.5">
                        {qualityResults[doc.id].issues.map((issue, i) => <li key={i}>{issue}</li>)}
                      </ul>
                    )}
                    {qualityResults[doc.id].recommendation && (
                      <p className="text-[11px] text-amber-700 mt-0.5">{qualityResults[doc.id].recommendation}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-semibold text-gray-900">{formatMoney(doc.totalCents, doc.currency)}</span>
                  <div className="flex items-center gap-2">
                    {doc.hasPdf ? (
                      <>
                        {doc.contact && (
                          <button
                            onClick={() => sendViaWhatsApp(doc.id)}
                            disabled={sendingId === doc.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-1.5"
                          >
                            {sendingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send
                          </button>
                        )}
                        <button onClick={() => downloadPdf(doc)} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                          <Download className="w-3.5 h-3.5" />Download
                        </button>
                        <button onClick={() => copyShareLink(doc)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
                          <Link2 className="w-3.5 h-3.5" />Copy Link
                        </button>
                        <button onClick={() => generatePdf(doc.id)} disabled={generatingId === doc.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">
                          {generatingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate
                        </button>
                        <button onClick={() => checkQuality(doc.id)} disabled={checkingQualityId === doc.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">
                          {checkingQualityId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}Check Quality
                        </button>
                        <button onClick={() => setChatOpenId(prev => prev === doc.id ? null : doc.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
                          <MessageSquare className="w-3.5 h-3.5" />AI Assistant
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => generatePdf(doc.id)}
                        disabled={generatingId === doc.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-1.5"
                      >
                        {generatingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate PDF'}
                      </button>
                    )}
                  </div>
                </div>

                {chatOpenId === doc.id && token && (
                  <DocumentChatPanel documentId={doc.id} token={token} onChanged={loadDocuments} />
                )}

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                  {CONVERSION_TARGETS[doc.documentType] ? (
                    <button
                      onClick={() => convertDocument(doc)}
                      disabled={convertingId === doc.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      {convertingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightCircle className="w-3.5 h-3.5" />}
                      Convert to {CONVERSION_TARGETS[doc.documentType][0].toUpperCase() + CONVERSION_TARGETS[doc.documentType].slice(1)}
                    </button>
                  ) : null}
                  {['generated', 'sent', 'viewed'].includes(doc.status) && (
                    <button
                      onClick={() => setStatus(doc.id, 'paid')}
                      disabled={statusUpdatingId === doc.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-2.5 py-1.5 disabled:opacity-50 transition-colors"
                    >
                      {statusUpdatingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Mark Paid
                    </button>
                  )}
                  <div className="ml-auto">
                    <select
                      value=""
                      disabled={statusUpdatingId === doc.id}
                      onChange={e => { if (e.target.value) setStatus(doc.id, e.target.value) }}
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
                    >
                      <option value="">Update status…</option>
                      {MANUAL_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewDoc && (
        <NewDocumentModal
          token={token}
          onClose={() => setShowNewDoc(false)}
          onCreated={() => { setShowNewDoc(false); loadDocuments() }}
        />
      )}

      {viewDataDoc && (
        <ViewDataModal doc={viewDataDoc} onClose={() => setViewDataDoc(null)} />
      )}


      {showRecurring && (
        <RecurringDocumentsModal token={token} onClose={() => setShowRecurring(false)} />
      )}

      {showPacks && (
        <PacksModal token={token} onClose={() => setShowPacks(false)} onRun={() => { setShowPacks(false); loadDocuments() }} />
      )}

      {showInsights && (
        <InsightsModal token={token} onClose={() => setShowInsights(false)} />
      )}
    </div>
  )
}

const AI_DOCUMENT_TYPES = ['quotation', 'invoice', 'proposal', 'contract'] as const

function NewDocumentModal({ token, onClose, onCreated }: { token: string | null | undefined; onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast()
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [documentType, setDocumentType] = useState<'quotation' | 'invoice' | 'receipt'>('quotation')
  const [aiDocumentType, setAiDocumentType] = useState<typeof AI_DOCUMENT_TYPES[number]>('quotation')
  const [instruction, setInstruction] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [brandKit, setBrandKit] = useState<BrandKitSummary | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: { id: string; name: string; avatarUrl: string | null }[] }>('/api/contacts', { token })
      .then(data => setContacts(data.contacts))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return
    apiClient<BrandKitSummary>('/api/business-profile', { token })
      .then(setBrandKit)
      .catch(() => {})
  }, [token])

  const currency = brandKit?.defaultCurrency || 'ZMW'
  const selectedContact = contacts.find(c => c.id === contactId) ?? null

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0
    for (const item of items) {
      const lineSubtotal = Math.round(item.quantity * item.unitPriceCents)
      const lineDiscount = Math.round(lineSubtotal * (item.discountPct / 100))
      const afterDiscount = lineSubtotal - lineDiscount
      const lineTax = Math.round(afterDiscount * (item.taxPct / 100))
      subtotal += lineSubtotal
      discount += lineDiscount
      tax += lineTax
    }
    return { subtotal, discount, tax, total: subtotal - discount + tax }
  }, [items])

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  const create = async () => {
    if (!token || !contactId) return
    const validItems = items.filter(i => i.description.trim())
    if (validItems.length === 0) {
      addToast({ variant: 'error', title: 'Add at least one line item' })
      return
    }
    setSaving(true)
    try {
      const data = await apiClient<{ document: { id: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          contactId, documentType, items: validItems, notes: notes || undefined, terms: terms || undefined,
          validUntil: documentType === 'quotation' ? (validUntil || undefined) : undefined,
          dueDate: documentType === 'invoice' ? (dueDate || undefined) : undefined,
          // receipt: no dueDate or validUntil sent
        }),
      })
      await apiClient(`/api/documents/${data.document.id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: `${documentType[0].toUpperCase()}${documentType.slice(1)} created` })
      onCreated()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create document', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const generateWithAI = async () => {
    if (!token || !contactId || !instruction.trim()) return
    setAiGenerating(true)
    try {
      const data = await apiClient<{ document: { id: string } }>('/api/documents/ai-generate', {
        method: 'POST',
        token,
        body: JSON.stringify({ contactId, documentType: aiDocumentType, instruction: instruction.trim() }),
      })
      await apiClient(`/api/documents/${data.document.id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: `${aiDocumentType[0].toUpperCase()}${aiDocumentType.slice(1)} generated` })
      onCreated()
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        addToast({
          variant: 'warning',
          title: "You've hit your daily AI document limit",
          description: 'Upgrade on the Billing page for unlimited document generation.',
          duration: 6000,
        })
      } else {
        addToast({ variant: 'error', title: 'Failed to generate document', description: err instanceof ApiError ? err.message : undefined })
      }
    } finally {
      setAiGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <div
        className={`bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${
          mode === 'manual' ? 'max-w-4xl' : 'max-w-2xl'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-xl z-10">
          <h2 className="text-sm font-bold text-gray-900">New Document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4">
          {([{ id: 'manual' as const, label: 'Manual' }, { id: 'ai' as const, label: 'AI Generate' }]).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold transition-all ${
                mode === m.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {m.id === 'ai' && <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />}
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'manual' && brandKit && (brandKit.companyName || brandKit.logoUrl) && (
          <div className="mx-5 mt-3.5 flex items-center gap-3 rounded-2xl bg-indigo-50/60 ring-1 ring-indigo-100 px-3.5 py-2.5">
            {brandKit.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandKit.logoUrl} alt="" className="w-9 h-9 rounded-xl object-contain bg-white border border-indigo-100 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black flex-shrink-0">
                {(brandKit.companyName ?? 'Z')[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-indigo-900 truncate">{brandKit.companyName || 'Your Brand Kit'}</p>
              <p className="text-[11px] text-indigo-600">Logo, currency &amp; default terms are pre-filled from your Brand Kit</p>
            </div>
          </div>
        )}

        {mode === 'ai' ? (
          <>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={aiDocumentType}
                    onChange={e => setAiDocumentType(e.target.value as typeof AI_DOCUMENT_TYPES[number])}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {AI_DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contact</label>
                  <select
                    value={contactId}
                    onChange={e => setContactId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a contact…</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Describe what {aiDocumentType === 'quotation' ? 'to quote' : aiDocumentType === 'invoice' ? 'to invoice' : `the ${aiDocumentType} covers`}
                </label>
                <textarea
                  placeholder={
                    aiDocumentType === 'quotation' || aiDocumentType === 'invoice'
                      ? "e.g. 2 iPhone 15 Pro and 5 AirPods, delivery Friday, 10% discount"
                      : "e.g. Website redesign for ABC Construction, budget K120,000, 6-week timeline"
                  }
                  rows={4}
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  AI resolves products against your catalog and fills in the numbers — it never invents pricing or products.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
              <button
                onClick={generateWithAI}
                disabled={aiGenerating || !contactId || !instruction.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiGenerating ? 'Generating…' : 'Generate with AI'}
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="lg:grid lg:grid-cols-[1fr_320px]">
          <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <div className="flex gap-2">
                {(['quotation', 'invoice', 'receipt'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDocumentType(t)}
                    className={`flex-1 text-sm font-medium py-2 rounded-lg border-2 transition-colors ${
                      documentType === t ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Contact</label>
              <select
                value={contactId}
                onChange={e => setContactId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a contact…</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {documentType !== 'receipt' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {documentType === 'quotation' ? 'Valid until' : 'Due date'}
              </label>
              <input
                type="date"
                value={documentType === 'quotation' ? validUntil : dueDate}
                onChange={e => documentType === 'quotation' ? setValidUntil(e.target.value) : setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Mobile: live preview toggle — the desktop sticky column below is hidden on small screens */}
          <div className="lg:hidden">
            <button
              onClick={() => setPreviewOpen(o => !o)}
              className="w-full flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-bold text-gray-600 shadow-sm"
            >
              <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Live preview</span>
              {previewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {previewOpen && (
              <div className="mt-2 overflow-x-auto">
                <ManualDocumentPreview
                  documentType={documentType}
                  brandKit={brandKit}
                  contactName={selectedContact?.name ?? null}
                  items={items}
                  totals={totals}
                  notes={notes}
                  terms={terms}
                  currency={currency}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-2">Line items</label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_60px_60px_28px] gap-1.5 items-center">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateItem(i, { description: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number" min={0} placeholder="Qty"
                    value={item.quantity}
                    onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number" min={0} placeholder="Unit price"
                    value={item.unitPriceCents / 100}
                    onChange={e => updateItem(i, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number" min={0} max={100} placeholder="Disc %"
                    value={item.discountPct}
                    onChange={e => updateItem(i, { discountPct: parseFloat(e.target.value) || 0 })}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number" min={0} max={100} placeholder="Tax %"
                    value={item.taxPct}
                    onChange={e => updateItem(i, { taxPct: parseFloat(e.target.value) || 0 })}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} disabled={items.length === 1}>
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 disabled:opacity-30" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems(prev => [...prev, emptyItem()])}
              className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              + Add line item
            </button>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>-{formatMoney(totals.discount, currency)}</span></div>}
            {totals.tax > 0 && <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatMoney(totals.tax, currency)}</span></div>}
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
          </div>

          <textarea
            placeholder="Notes (optional)"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            placeholder="Terms — leave blank to use your Brand Kit default terms"
            rows={2}
            value={terms}
            onChange={e => setTerms(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          </div>

          {/* Desktop: sticky live preview column */}
          <div className="hidden lg:block border-l border-gray-100 bg-slate-50/40 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />Live preview
            </p>
            <div className="sticky top-4">
              <ManualDocumentPreview
                documentType={documentType}
                brandKit={brandKit}
                contactName={selectedContact?.name ?? null}
                items={items}
                totals={totals}
                notes={notes}
                terms={terms}
                currency={currency}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
          <button
            onClick={create}
            disabled={saving || !contactId}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/25"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Creating…' : 'Create & Generate PDF'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

function ManualDocumentPreview({
  documentType, brandKit, contactName, items, totals, notes, terms, currency,
}: {
  documentType: 'quotation' | 'invoice' | 'receipt'
  brandKit: BrandKitSummary | null
  contactName: string | null
  items: LineItem[]
  totals: { subtotal: number; discount: number; tax: number; total: number }
  notes: string
  terms: string
  currency: string
}) {
  const headerColor = brandKit?.themeColor || '#4F46E5'
  const docLabel = documentType === 'quotation' ? 'QUOTATION' : documentType === 'invoice' ? 'INVOICE' : 'RECEIPT'
  const validItems = items.filter(i => i.description.trim())
  const effectiveTerms = terms.trim() || brandKit?.defaultTerms || ''

  return (
    <div className="w-full min-w-[240px] rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ background: headerColor, color: '#fff' }}>
        {brandKit?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandKit.logoUrl} alt="" className="h-7 object-contain" />
        ) : (
          <p className="text-sm font-bold truncate">{brandKit?.companyName || 'Your Company'}</p>
        )}
        <p className="text-xs font-extrabold tracking-wide opacity-90 flex-shrink-0">{docLabel}</p>
      </div>

      {contactName && (
        <div className="px-4 py-2.5 border-b border-gray-100">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Bill To</p>
          <p className="text-xs font-semibold text-gray-800 truncate">{contactName}</p>
        </div>
      )}

      <div className="px-4 py-2.5">
        {validItems.length === 0 ? (
          <p className="text-xs text-gray-300 italic text-center py-3">No items yet</p>
        ) : (
          <div className="space-y-1">
            {validItems.map((item, i) => (
              <div key={i} className="flex justify-between gap-2 text-xs">
                <span className="text-gray-700 truncate">{item.quantity}× {item.description}</span>
                <span className="text-gray-600 flex-shrink-0">{formatMoney(Math.round(item.quantity * item.unitPriceCents), currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 space-y-0.5">
        <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Discount</span><span>-{formatMoney(totals.discount, currency)}</span></div>}
        {totals.tax > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Tax</span><span>{formatMoney(totals.tax, currency)}</span></div>}
        <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
      </div>

      {(notes.trim() || effectiveTerms) && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 space-y-1.5">
          {notes.trim() && (
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
              <p className="text-[11px] text-gray-600">{notes}</p>
            </div>
          )}
          {effectiveTerms && (
            <div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Terms</p>
              <p className="text-[11px] text-gray-600">{effectiveTerms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface RecurringRule {
  id: string
  contactId: string
  documentType: string
  recurrence: string
  dayOfPeriod: number
  autoSend: boolean
  isActive: boolean
  nextRunAt: string
  contact: { id: string; name: string; avatarUrl: string | null } | null
}

const RECURRENCE_OPTIONS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const

// Scheduled/recurring documents (plan §15 Phase 3) — a rule the polling
// worker (services/api/src/workers/recurring-documents-worker.ts) checks
// every minute, not a one-off scheduled send.
function RecurringDocumentsModal({ token, onClose }: { token: string | null | undefined; onClose: () => void }) {
  const { addToast } = useToast()
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [documentType, setDocumentType] = useState<'quotation' | 'invoice'>('invoice')
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number]>('monthly')
  const [dayOfPeriod, setDayOfPeriod] = useState(1)
  const [autoSend, setAutoSend] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadRules = () => {
    if (!token) return
    apiClient<{ rules: RecurringRule[] }>('/api/recurring-documents', { token })
      .then(data => { setRules(data.rules); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(loadRules, [token])

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: Contact[] }>('/api/contacts', { token }).then(data => setContacts(data.contacts)).catch(() => {})
  }, [token])

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  const createRule = async () => {
    if (!token || !contactId) return
    const validItems = items.filter(i => i.description.trim())
    if (validItems.length === 0) {
      addToast({ variant: 'error', title: 'Add at least one line item' })
      return
    }
    setSaving(true)
    try {
      await apiClient('/api/recurring-documents', {
        method: 'POST', token,
        body: JSON.stringify({ contactId, documentType, items: validItems, recurrence, dayOfPeriod, autoSend }),
      })
      addToast({ variant: 'success', title: 'Recurring rule created' })
      setShowForm(false)
      setItems([emptyItem()])
      setContactId('')
      loadRules()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create rule', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (rule: RecurringRule) => {
    if (!token) return
    try {
      await apiClient(`/api/recurring-documents/${rule.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ isActive: !rule.isActive }),
      })
      loadRules()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update rule' })
    }
  }

  const deleteRule = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/recurring-documents/${id}`, { method: 'DELETE', token })
      loadRules()
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete rule' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900">Recurring Documents</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="p-5 space-y-3">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : rules.length === 0 && !showForm ? (
            <p className="text-sm text-gray-500">No recurring rules yet — e.g. a monthly invoice for a retainer client.</p>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {rule.contact?.name ?? 'Unknown contact'} — {rule.documentType}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {rule.recurrence} · next {new Date(rule.nextRunAt).toLocaleDateString()}{rule.autoSend ? ' · auto-sends' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(rule)} className={`text-xs font-medium px-2 py-1 rounded-lg ${rule.isActive ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'}`}>
                    {rule.isActive ? 'Active' : 'Paused'}
                  </button>
                  <button onClick={() => deleteRule(rule.id)}><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
            ))
          )}

          {showForm ? (
            <div className="border border-gray-200 rounded-xl p-3.5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={contactId} onChange={e => setContactId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select a contact…</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={documentType} onChange={e => setDocumentType(e.target.value as 'quotation' | 'invoice')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="invoice">Invoice</option>
                  <option value="quotation">Quotation</option>
                </select>
              </div>

              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_60px_90px_28px] gap-1.5 items-center">
                    <input placeholder="Description" value={item.description} onChange={e => updateItem(i, { description: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    <input type="number" min={0} placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    <input type="number" min={0} placeholder="Unit price" value={item.unitPriceCents / 100} onChange={e => updateItem(i, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} disabled={items.length === 1}>
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 disabled:opacity-30" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setItems(prev => [...prev, emptyItem()])} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Add line item</button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <select value={recurrence} onChange={e => setRecurrence(e.target.value as typeof recurrence)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {RECURRENCE_OPTIONS.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
                <input
                  type="number" min={0} max={31}
                  value={dayOfPeriod}
                  onChange={e => setDayOfPeriod(parseInt(e.target.value, 10) || 1)}
                  placeholder={recurrence === 'weekly' ? 'Day of week (0-6)' : 'Day of month'}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={autoSend} onChange={e => setAutoSend(e.target.checked)} />
                  Auto-send via WhatsApp
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-gray-500">Cancel</button>
                <button onClick={createRule} disabled={saving || !contactId} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Rule'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
              + New recurring rule
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PACK_OPTIONS = [
  { key: 'new_customer_sales_pack', label: 'New Customer Sales Pack', description: 'Quotation + proposal + a drafted follow-up.' },
  { key: 'renewal_pack', label: 'Renewal Pack', description: "Renewal quotation pre-filled from the contact's last paid/accepted invoice + a drafted reminder." },
  { key: 'project_kickoff_pack', label: 'Project Kickoff Pack', description: 'Service agreement + project plan + a follow-up task.' },
] as const

// Automatic Business Packs (plan §13/§15 Phase 4) — pack definitions live in
// the intelligence service as code constants; this just picks a contact +
// pack and fires the run.
function PacksModal({ token, onClose, onRun }: { token: string | null | undefined; onClose: () => void; onRun: () => void }) {
  const { addToast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [packKey, setPackKey] = useState<typeof PACK_OPTIONS[number]['key']>('new_customer_sales_pack')
  const [instruction, setInstruction] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: Contact[] }>('/api/contacts', { token }).then(data => setContacts(data.contacts)).catch(() => {})
  }, [token])

  const run = async () => {
    if (!token || !contactId) return
    setRunning(true)
    try {
      await apiClient(`/api/documents/packs/${packKey}/run`, {
        method: 'POST', token, body: JSON.stringify({ contactId, instruction: instruction || undefined }),
      })
      addToast({ variant: 'success', title: 'Pack generated' })
      onRun()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to run pack', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setRunning(false)
    }
  }

  const selected = PACK_OPTIONS.find(p => p.key === packKey)!
  const needsInstruction = packKey !== 'renewal_pack'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900">Business Packs</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            {PACK_OPTIONS.map(p => (
              <button
                key={p.key}
                onClick={() => setPackKey(p.key)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
                  packKey === p.key ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{p.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Contact</label>
            <select
              value={contactId}
              onChange={e => setContactId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a contact…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {needsInstruction && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">What&apos;s this for?</label>
              <textarea
                placeholder={selected.key === 'project_kickoff_pack' ? 'e.g. 6-week website redesign, K120,000 budget' : 'e.g. Website redesign, 3 CCTV cameras installed'}
                rows={3}
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
          <button
            onClick={run}
            disabled={running || !contactId || (needsInstruction && !instruction.trim())}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            {running ? 'Running…' : 'Run Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ViewDataModal({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900">{doc.title} — Data</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5">
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(doc, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}

// AI Compares Documents / "Sales-Analyst Mode" (plan §8/§15 Phase 4) —
// aggregated stats in, grounded suggestions out.
function InsightsModal({ token, onClose }: { token: string | null | undefined; onClose: () => void }) {
  const [insights, setInsights] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    apiClient<{ insights: string[] }>('/api/documents/insights', { method: 'POST', token })
      .then(data => { setInsights(data.insights); setLoading(false) })
      .catch(() => { setInsights([]); setLoading(false) })
  }, [token])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-amber-500" />Document Insights</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-2.5">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : !insights || insights.length === 0 ? (
            <p className="text-sm text-gray-500">Not enough documents yet to spot patterns.</p>
          ) : (
            insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">{insight}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
