'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, Trash2, Loader2, Download, RefreshCw, X } from 'lucide-react'
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
  contact: { id: string; name: string; avatarUrl: string | null } | null
  createdAt: string
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

function formatMoney(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency })
}

function emptyItem(): LineItem {
  return { description: '', quantity: 1, unitPriceCents: 0, discountPct: 0, taxPct: 0 }
}

export default function BusinessPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documents"
        description="Quotations and invoices — AI-generated, branded, linked to your contacts."
        action={
          <button
            onClick={() => setShowNewDoc(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />New Document
          </button>
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
                    </div>
                    <p className="text-xs text-gray-500 truncate">{doc.title}</p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[doc.status] ?? 'default'}>{doc.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-semibold text-gray-900">{formatMoney(doc.totalCents, doc.currency)}</span>
                  <div className="flex items-center gap-2">
                    {doc.hasPdf ? (
                      <>
                        <button onClick={() => downloadPdf(doc)} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                          <Download className="w-3.5 h-3.5" />Download
                        </button>
                        <button onClick={() => generatePdf(doc.id)} disabled={generatingId === doc.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">
                          {generatingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate
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
    </div>
  )
}

function NewDocumentModal({ token, onClose, onCreated }: { token: string | null | undefined; onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [documentType, setDocumentType] = useState<'quotation' | 'invoice'>('quotation')
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-gray-900">New Document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

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
      </div>
    </div>
  )
}
