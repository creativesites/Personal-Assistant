'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Eye, ArrowLeft, Loader2, Save, Trash2, AlertTriangle, X } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { ContactPicker, type Contact } from '../../_components/contact-picker'
import { LineItemsEditor, type LineItem } from '../../_components/line-items-editor'
import { TemplatePicker } from '../../_components/template-picker'
import { BusinessProfilePicker } from '../../_components/business-profile-picker'
import { DynamicDocFields, type DocType } from '../../_components/dynamic-doc-fields'

const DocumentPreviewModal = dynamic(() => import('@/components/documents/DocumentPreviewModal'), { ssr: false })

interface DocumentDetail {
  id: string
  documentType: string
  documentNumber: string
  title: string
  status: string
  structuredData: {
    items?: { description: string; quantity: number; unitPriceCents: number; discountPct?: number; taxPct?: number }[]
    notes?: string | null
    terms?: string | null
    validUntil?: string | null
    dueDate?: string | null
    manualContact?: { name: string; company?: string; email?: string; phone?: string } | null
    [key: string]: any
  } | null
  currency: string
  contactId: string | null
  templateId: string | null
  businessProfileId: string | null
  contact: { id: string; name: string } | null
}

export default function DocumentEditPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { addToast } = useToast()

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [contactId, setContactId] = useState<string | null>(null)
  const [contactLabel, setContactLabel] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')

  const [items, setItems] = useState<LineItem[]>([])
  const [currency, setCurrency] = useState('ZMW')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null)
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({})

  useEffect(() => {
    if (!token || !params.id) return
    apiClient<{ document: DocumentDetail }>(`/api/documents/${params.id}`, { token })
      .then(({ document }) => {
        setDoc(document)
        setContactId(document.contactId)
        setContactLabel(document.contact?.name ?? null)
        const sd = document.structuredData ?? {}
        const manual = sd.manualContact
        if (!document.contactId && manual) {
          setManualMode(true)
          setManualName(manual.name ?? '')
          setManualCompany(manual.company ?? '')
          setManualEmail(manual.email ?? '')
          setManualPhone(manual.phone ?? '')
        }
        setItems((sd.items ?? []).map((it: any) => ({
          description: it.description, quantity: it.quantity, unitPriceCents: it.unitPriceCents,
          discountPct: it.discountPct ?? 0, taxPct: it.taxPct ?? 0,
        })))
        setCurrency(document.currency)
        setNotes(sd.notes ?? '')
        setTerms(sd.terms ?? '')
        setValidUntil(sd.validUntil ?? '')
        setDueDate(sd.dueDate ?? '')
        setTemplateId(document.templateId)
        setBusinessProfileId(document.businessProfileId)
        setDynamicValues(sd)
      })
      .catch(() => setDoc(null))
      .finally(() => setLoading(false))
  }, [token, params.id])

  function selectContact(c: Contact | null) {
    if (c) {
      setContactId(c.id)
      setContactLabel(c.name)
      setManualMode(false)
    } else {
      setContactId(null)
      setContactLabel(null)
      setManualMode(true)
    }
  }

  function handleDynamicChange(key: string, val: any) {
    setDynamicValues(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    if (!doc || !token) return
    setSaving(true)
    try {
      const mergedStructuredData = {
        ...(doc.structuredData ?? {}),
        ...dynamicValues,
        notes: notes || undefined,
        terms: terms || undefined,
        validUntil: validUntil || undefined,
        dueDate: dueDate || undefined,
      }

      const body: Record<string, unknown> = {
        items,
        currency,
        notes: notes || undefined,
        terms: terms || undefined,
        validUntil: validUntil || undefined,
        dueDate: dueDate || undefined,
        templateId: templateId || undefined,
        businessProfileId: businessProfileId ?? null,
        structuredData: mergedStructuredData,
      }
      if (manualMode) {
        body.contactId = null
        body.manualContact = manualName.trim()
          ? { name: manualName, company: manualCompany || undefined, email: manualEmail || undefined, phone: manualPhone || undefined }
          : undefined
      } else {
        body.contactId = contactId
      }

      let targetId = doc.id
      if (doc.status !== 'draft') {
        const { document: revised } = await apiClient<{ document: { id: string } }>(
          `/api/documents/${doc.id}/revise`, { method: 'POST', token, body: JSON.stringify({}) },
        )
        targetId = revised.id
      }

      await apiClient(`/api/documents/${targetId}`, { method: 'PATCH', token, body: JSON.stringify(body) })
      addToast({
        variant: 'success',
        title: doc.status !== 'draft' ? 'Saved as a new revised draft' : 'Document saved',
      })
      router.push(doc.status !== 'draft' ? `/documents/${targetId}/edit` : '/business')
    } catch (err) {
      addToast({ variant: 'error', title: err instanceof ApiError ? err.message : 'Failed to save document' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!doc || !token) return
    setDeleting(true)
    try {
      const result = await apiClient<{ ok: boolean; deleted: boolean }>(`/api/documents/${doc.id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: result.deleted ? 'Document deleted' : 'Document archived' })
      router.push('/business')
    } catch (err) {
      addToast({ variant: 'error', title: err instanceof ApiError ? err.message : 'Failed to delete document' })
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-gray-500">Document not found.</p>
        <Link href="/business" className="text-sm font-semibold text-indigo-600">Back to Business</Link>
      </div>
    )
  }

  const isDraft = doc.status === 'draft'

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-36">
        <div className="flex items-center justify-between mb-4">
          <Link href="/business" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />Back to Business
          </Link>
          <button
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />Preview / Download PDF
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-950">Edit {doc.documentNumber}</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6 capitalize">{doc.documentType} · {doc.status}</p>

        {!isDraft && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              This document has already been {doc.status}. Saving will create a new revised draft — the original stays unchanged.
            </p>
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Brand Profile</h2>
            <BusinessProfilePicker token={token ?? undefined} value={businessProfileId} onChange={setBusinessProfileId} />
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Client</h2>
            {!manualMode ? (
              <>
                {contactLabel && (
                  <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
                    <span className="text-sm font-medium text-gray-900">{contactLabel}</span>
                    <button onClick={() => selectContact(null)} className="text-xs font-semibold text-gray-400 hover:text-red-500 min-h-11 px-2">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <ContactPicker token={token ?? undefined} onSelect={selectContact} />
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Entering client details manually</span>
                  <button onClick={() => setManualMode(false)} className="text-xs font-semibold text-indigo-600 min-h-11">Search contacts instead</button>
                </div>
                <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Client name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input value={manualCompany} onChange={e => setManualCompany(e.target.value)} placeholder="Company (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email (optional)" type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Phone (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            )}
          </div>

          <DynamicDocFields
            docType={doc.documentType as DocType}
            values={dynamicValues}
            onChange={handleDynamicChange}
          />

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
            <LineItemsEditor items={items} onChange={setItems} currency={currency} />
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Currency</label>
                <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{doc.documentType === 'quotation' ? 'Valid until' : 'Due date'}</label>
                <input
                  type="date"
                  value={doc.documentType === 'quotation' ? validUntil : dueDate}
                  onChange={e => doc.documentType === 'quotation' ? setValidUntil(e.target.value) : setDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Terms (optional)" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
            <TemplatePicker token={token ?? undefined} value={templateId} onChange={setTemplateId} />
          </div>

          {isDraft && (
            <div className="rounded-[1.75rem] border border-red-100 bg-white shadow-sm shadow-gray-200/70 p-5">
              {deleteConfirm ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-600 flex-1">Permanently delete {doc.documentNumber}? This can't be undone.</p>
                  <button onClick={handleDelete} disabled={deleting} className="text-sm font-semibold text-red-600 hover:underline min-h-11 px-2">
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setDeleteConfirm(false)} className="text-sm text-gray-500 hover:underline min-h-11 px-2">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline min-h-11">
                  <Trash2 className="w-4 h-4" />Delete this draft
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed action bar — z-50 md:z-30 ensures visibility over mobile bottom tab bar (z-40) */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 md:z-30 bg-white/95 backdrop-blur-xl border-t border-gray-200/80 shadow-2xl shadow-gray-900/10 p-3 md:p-4"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">Preview PDF</span>
            <span className="sm:hidden">Preview</span>
          </button>

          <div className="flex items-center gap-2">
            <Link
              href="/business"
              className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-2xl text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-2xl bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isDraft ? 'Save Changes' : 'Save as New Draft'}
            </button>
          </div>
        </div>
      </div>

      {previewOpen && doc && token && (
        <DocumentPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          documentId={doc.id}
          token={token}
        />
      )}
    </div>
  )
}
