'use client'

import { useEffect, useState } from 'react'
import { Mail, Sparkles, Loader2, ExternalLink, FileBadge, Images, Plus } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, Modal, Textarea, useToast } from '@/components/ui'
import { AiRewriteToolbar } from './cv-studio/ai-rewrite-toolbar'

// CV Studio Phase 9 — Cover Letter Studio + Supporting Documents
// (docs/CV_STUDIO_PLAN.md §12, §13, §18 Phase 9). Its own file per the
// File Architecture convention — resume-studio.tsx is already ~300 lines,
// and this isn't a small addition. The compose flow below is deliberately
// NOT the old instruction-driven "AI writes it from scratch" pattern still
// used by /api/career/cover-letter (kept, per Phase 1's deferral, since
// Resume Studio's own "Generate Cover Letter" button still calls it):
// every field here is either the user's own real, already-listed
// achievement text (click to insert) or something the user typed
// themselves — "Polish" only rewrites what's already there, reusing the
// exact same generic AiRewriteToolbar the wizard's own steps use.

const LETTER_TYPES = [
  { key: 'cover_letter', label: 'Cover Letter' },
  { key: 'application_letter', label: 'Application Letter' },
  { key: 'expression_of_interest', label: 'Expression of Interest' },
  { key: 'personal_statement', label: 'Personal Statement' },
  { key: 'motivation_letter', label: 'Motivation Letter' },
] as const

type LetterType = typeof LETTER_TYPES[number]['key']

const CAREER_DOC_LABELS: Record<string, string> = {
  cover_letter: 'Cover Letter', application_letter: 'Application Letter',
  expression_of_interest: 'Expression of Interest', personal_statement: 'Personal Statement',
  motivation_letter: 'Motivation Letter', reference_sheet: 'Reference Sheet', portfolio_pdf: 'Portfolio',
}

interface OpportunityOption {
  id: string
  title: string
  companyOrOrg: string | null
}

interface EmploymentEntry {
  id: string
  title: string
  employer: string
  achievements?: string[]
}

interface CareerDocument {
  id: string
  documentType: string
  title: string
  hasPdf: boolean
  createdAt: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
function pdfUrl(documentId: string, token: string) {
  return `${API_URL}/api/documents/${documentId}/pdf?token=${encodeURIComponent(token)}`
}

export function CoverLetterStudio({ token, opportunities }: { token: string; opportunities: OpportunityOption[] }) {
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<CareerDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [showCompose, setShowCompose] = useState(false)
  const [documentType, setDocumentType] = useState<LetterType>('cover_letter')
  const [opportunityId, setOpportunityId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)

  const [achievements, setAchievements] = useState<EmploymentEntry[] | null>(null)
  const [generatingSupport, setGeneratingSupport] = useState<'reference_sheet' | 'portfolio_pdf' | null>(null)

  const load = () => {
    setLoading(true)
    apiClient<{ documents: CareerDocument[] }>('/api/career/documents', { token })
      .then(data => {
        setDocuments(data.documents.filter(d => d.documentType !== 'resume'))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [token])

  const openCompose = async () => {
    setShowCompose(true)
    if (achievements === null) {
      try {
        const data = await apiClient<{ items: EmploymentEntry[] }>('/api/career/employment-history', { token })
        setAchievements(data.items)
      } catch {
        setAchievements([])
      }
    }
  }

  const closeCompose = () => {
    setShowCompose(false)
    setBodyText(''); setCompanyName(''); setRecipientName(''); setOpportunityId('')
  }

  const pickOpportunity = (id: string) => {
    setOpportunityId(id)
    const opp = opportunities.find(o => o.id === id)
    if (opp?.companyOrOrg) setCompanyName(opp.companyOrOrg)
  }

  const insertAchievement = (text: string) => {
    setBodyText(prev => (prev ? `${prev}\n\n${text}` : text))
  }

  const save = async () => {
    if (!bodyText.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/career/letters/compose', {
        method: 'POST', token,
        body: JSON.stringify({
          documentType, recipientName: recipientName || null, companyName: companyName || null, body: bodyText,
        }),
      })
      addToast({ variant: 'success', title: `${CAREER_DOC_LABELS[documentType]} saved` })
      closeCompose()
      load()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save this document', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const generateSupportingDoc = async (type: 'reference_sheet' | 'portfolio_pdf') => {
    setGeneratingSupport(type)
    try {
      await apiClient(type === 'reference_sheet' ? '/api/career/reference-sheet' : '/api/career/portfolio-pdf', {
        method: 'POST', token,
      })
      addToast({ variant: 'success', title: `${CAREER_DOC_LABELS[type]} generated` })
      load()
    } catch (err) {
      addToast({ variant: 'error', title: `Could not generate ${CAREER_DOC_LABELS[type]}`, description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setGeneratingSupport(null)
    }
  }

  const allAchievements = (achievements ?? []).flatMap(e =>
    (e.achievements ?? []).map(a => ({ entry: e, text: a })),
  )

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Cover Letter Studio</h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button
          onClick={openCompose}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 min-h-[40px]"
        >
          <Sparkles className="w-3.5 h-3.5" />Compose a Letter
        </button>
        <button
          onClick={() => generateSupportingDoc('reference_sheet')}
          disabled={generatingSupport === 'reference_sheet'}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-gray-700 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
        >
          {generatingSupport === 'reference_sheet' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileBadge className="w-3.5 h-3.5" />}
          Reference Sheet
        </button>
        <button
          onClick={() => generateSupportingDoc('portfolio_pdf')}
          disabled={generatingSupport === 'portfolio_pdf'}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-gray-700 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
        >
          {generatingSupport === 'portfolio_pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
          Portfolio PDF
        </button>
      </div>

      {!loading && documents.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-gray-500">No letters or supporting documents yet — compose a letter from your real achievements, or generate a reference sheet / portfolio PDF.</p>
      ) : (
        <div>
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                  <Badge variant="info">{CAREER_DOC_LABELS[doc.documentType] ?? doc.documentType}</Badge>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              {doc.hasPdf && (
                <a
                  href={pdfUrl(doc.id, token)} target="_blank" rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {showCompose && (
        <Modal open={showCompose} onClose={closeCompose} title="Compose a Letter">
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Document type</label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value as LetterType)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {LETTER_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            {opportunities.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Opportunity (optional)</label>
                <select
                  value={opportunityId}
                  onChange={e => pickOpportunity(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>{o.title}{o.companyOrOrg ? ` — ${o.companyOrOrg}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Recipient name</label>
                <input
                  value={recipientName} onChange={e => setRecipientName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Company / organisation</label>
                <input
                  value={companyName} onChange={e => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {allAchievements.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Insert a real achievement</p>
                <div className="flex flex-wrap gap-1.5">
                  {allAchievements.slice(0, 8).map((a, i) => (
                    <button
                      key={i}
                      onClick={() => insertAchievement(a.text)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                      title={a.text}
                    >
                      <Plus className="w-3 h-3" />{a.text.length > 40 ? `${a.text.slice(0, 40)}…` : a.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Textarea
                label="Letter body"
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                rows={8}
                placeholder="Write your letter, or insert a real achievement above to start from"
              />
              <AiRewriteToolbar text={bodyText} token={token} onRewritten={setBodyText} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeCompose} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !bodyText.trim()}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
