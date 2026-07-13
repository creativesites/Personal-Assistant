'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, Trash2, Loader2, Download, RefreshCw, X, Send, ArrowRightCircle, Sparkles, ShieldCheck, MessageSquare } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

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
  contact: { id: string; name: string; avatarUrl: string | null } | null
  createdAt: string
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
  const [showRecurring, setShowRecurring] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [checkingQualityId, setCheckingQualityId] = useState<string | null>(null)
  const [qualityResults, setQualityResults] = useState<Record<string, QualityCheckResult>>({})
  const [chatOpenId, setChatOpenId] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documents"
        description="Quotations and invoices — AI-generated, branded, linked to your contacts."
        action={
          <>
            <button
              onClick={() => setShowRecurring(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />Recurring
            </button>
            <button
              onClick={() => setShowNewDoc(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />New Document
            </button>
          </>
        }
      />

      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-6 flex-shrink-0 overflow-x-auto">
        <div><span className="text-lg font-bold text-gray-900">{stats.drafts}</span><span className="text-xs text-gray-500 ml-1.5">drafts</span></div>
        <div><span className="text-lg font-bold text-gray-900">{stats.generated}</span><span className="text-xs text-gray-500 ml-1.5">generated</span></div>
        <div><span className="text-lg font-bold text-gray-900">{stats.paid}</span><span className="text-xs text-gray-500 ml-1.5">paid/accepted</span></div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              typeFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
              <button onClick={() => setShowNewDoc(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />New Document
              </button>
            }
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {documents.map(doc => (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5">
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
                  <Badge variant={STATUS_VARIANTS[doc.status] ?? 'default'}>{doc.status}</Badge>
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

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  {CONVERSION_TARGETS[doc.documentType] ? (
                    <button
                      onClick={() => convertDocument(doc)}
                      disabled={convertingId === doc.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      {convertingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightCircle className="w-3.5 h-3.5" />}
                      Convert to {CONVERSION_TARGETS[doc.documentType][0].toUpperCase() + CONVERSION_TARGETS[doc.documentType].slice(1)}
                    </button>
                  ) : <span />}
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

      {showRecurring && (
        <RecurringDocumentsModal token={token} onClose={() => setShowRecurring(false)} />
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
  const [documentType, setDocumentType] = useState<'quotation' | 'invoice'>('quotation')
  const [aiDocumentType, setAiDocumentType] = useState<typeof AI_DOCUMENT_TYPES[number]>('quotation')
  const [instruction, setInstruction] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: { id: string; name: string; avatarUrl: string | null }[] }>('/api/contacts', { token })
      .then(data => setContacts(data.contacts))
      .catch(() => {})
  }, [token])

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
      addToast({ variant: 'error', title: 'Failed to generate document', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setAiGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900">New Document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4">
          {([{ id: 'manual' as const, label: 'Manual' }, { id: 'ai' as const, label: 'AI Generate' }]).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                mode === m.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m.id === 'ai' && <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />}
              {m.label}
            </button>
          ))}
        </div>

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
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <div className="flex gap-2">
                {(['quotation', 'invoice'] as const).map(t => (
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
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(totals.subtotal, 'ZMW')}</span></div>
            {totals.discount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>-{formatMoney(totals.discount, 'ZMW')}</span></div>}
            {totals.tax > 0 && <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatMoney(totals.tax, 'ZMW')}</span></div>}
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{formatMoney(totals.total, 'ZMW')}</span></div>
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

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
          <button
            onClick={create}
            disabled={saving || !contactId}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
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
