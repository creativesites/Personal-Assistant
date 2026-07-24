'use client'

import { useEffect, useState, useRef } from 'react'
import { FileText, Sparkles, Upload, Loader2, ExternalLink, Radar as RadarIcon, MessageSquare, Inbox, Mail, Phone, Building, Clock, Copy } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, Modal, Textarea, useToast } from '@/components/ui'

// Career & Growth Engine Phase 3 — AI Resume Studio (docs/CAREER_GROWTH_ENGINE_PLAN.md
// §8). Extracted into its own file per CLAUDE.md's File Architecture
// convention (career/page.tsx was already ~435 lines before this addition).

interface CareerDocument {
  id: string
  documentType: string
  title: string
  status: string
  structuredData: { score?: ResumeScore; source?: string } | null
  hasPdf: boolean
  createdAt: string
}

interface ResumeScore {
  atsCompatibility: number
  recruiterAppeal: number
  technicalStrength: number
  achievementFraming: number
  formatting: number
  overallScore: number
  suggestions: { issue: string; fix: string; example?: string }[]
}

interface OpportunityOption {
  id: string
  title: string
  companyOrOrg: string | null
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

function pdfUrl(documentId: string, token: string) {
  return `${API_URL}/api/documents/${documentId}/pdf?token=${encodeURIComponent(token)}`
}

interface PortfolioInquiry {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  topic?: string
  message: string
  createdAt: string
  status: 'unread' | 'read'
}

export function ResumeStudio({ token, opportunities }: { token: string; opportunities: OpportunityOption[] }) {
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<CareerDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [inquiries, setInquiries] = useState<PortfolioInquiry[]>([])
  const [showInquiriesModal, setShowInquiriesModal] = useState(false)

  const [showGenerate, setShowGenerate] = useState<'resume' | 'cover_letter' | null>(null)
  const [instruction, setInstruction] = useState('')
  const [opportunityId, setOpportunityId] = useState('')
  const [generating, setGenerating] = useState(false)

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scoringId, setScoringId] = useState<string | null>(null)

  const [scoreModalDoc, setScoreModalDoc] = useState<CareerDocument | null>(null)
  const [matchResults, setMatchResults] = useState<{ opportunityId: string; title: string; companyOrOrg: string | null; matchScore: number }[] | null>(null)
  const [matchingId, setMatchingId] = useState<string | null>(null)

  const loadDocuments = () => {
    if (!token) return
    setLoading(true)
    apiClient<{ documents: CareerDocument[] }>('/api/career/documents', { token })
      .then(data => { setDocuments(data.documents); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const loadInquiries = () => {
    fetch('/api/p/default')
      .then((res) => res.json())
      .then((data) => {
        if (data.portfolio?.inquiries) {
          setInquiries(data.portfolio.inquiries)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadDocuments()
    loadInquiries()
  }, [token])

  const generate = async () => {
    if (!token || !instruction.trim()) return
    if (showGenerate === 'cover_letter' && !opportunityId) return
    setGenerating(true)
    try {
      if (showGenerate === 'resume') {
        await apiClient('/api/career/resume', { method: 'POST', token, body: JSON.stringify({ instruction }) })
      } else {
        await apiClient('/api/career/cover-letter', {
          method: 'POST', token,
          body: JSON.stringify({ careerOpportunityId: opportunityId, instruction }),
        })
      }
      addToast({ variant: 'success', title: showGenerate === 'resume' ? 'Resume generated' : 'Cover letter generated' })
      setShowGenerate(null); setInstruction(''); setOpportunityId('')
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Generation failed', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setGenerating(false)
    }
  }

  const uploadResume = async (file: File) => {
    if (!token) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_URL}/api/career/resume/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(body.error || 'Upload failed')
      }
      const data = await res.json() as { document: CareerDocument; score: ResumeScore | null; scoreFailed: boolean }
      if (data.scoreFailed || !data.score) {
        addToast({ variant: 'info', title: 'Resume saved', description: 'Analysis failed — you can retry it any time from the list below.' })
      } else {
        addToast({ variant: 'success', title: `Resume saved — scored ${data.score.overallScore}/100` })
      }
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save resume', description: err instanceof Error ? err.message : undefined })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const scoreResume = async (doc: CareerDocument) => {
    if (!token) return
    setScoringId(doc.id)
    try {
      const data = await apiClient<{ score: ResumeScore }>(`/api/career/resume/${doc.id}/score`, { method: 'POST', token })
      addToast({ variant: 'success', title: `Scored ${data.score.overallScore}/100` })
      loadDocuments()
    } catch (err) {
      addToast({ variant: 'error', title: 'Analysis failed', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setScoringId(null)
    }
  }

  const matchResume = async (doc: CareerDocument) => {
    if (!token) return
    setMatchingId(doc.id)
    setMatchResults(null)
    try {
      const data = await apiClient<{ matches: typeof matchResults }>(`/api/career/resume/${doc.id}/match`, {
        method: 'POST', token, body: JSON.stringify({ limit: 5 }),
      })
      setMatchResults(data.matches ?? [])
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not match resume', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setMatchingId(null)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Resume Studio</h2>
        </div>
      </div>

      {/* Living Web Share Portfolio & Inbound Messages Banner */}
      <div className="mx-4 my-2 p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 font-bold shrink-0">
            <MessageSquare className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-100">Living Web Share Portfolio</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                Live Online
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Recruiter & Client Inquiries: <strong className="text-amber-300">{inquiries.length} received</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInquiriesModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow flex items-center gap-1.5"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Inbound Messages ({inquiries.length})</span>
          </button>

          <a
            href="/p/winston-zulu"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <span>Open Portfolio</span>
            <ExternalLink className="w-3 h-3 text-indigo-400" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button
          onClick={() => setShowGenerate('resume')}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 min-h-[40px]"
        >
          <Sparkles className="w-3.5 h-3.5" />Generate Resume
        </button>
        <button
          onClick={() => setShowGenerate('cover_letter')}
          disabled={opportunities.length === 0}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 shadow-sm hover:bg-indigo-50 min-h-[40px] disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />Generate Cover Letter
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-gray-700 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload &amp; Score
        </button>
        <input
          ref={fileInputRef} type="file" accept="application/pdf,text/plain" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadResume(f) }}
        />
      </div>

      {!loading && documents.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-gray-500">No resumes or cover letters yet — generate one from your profile, or upload an existing resume to get it scored.</p>
      ) : (
        <div>
          {documents.map(doc => (
            <div key={doc.id} className="flex items-start gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                  <Badge variant={doc.documentType === 'resume' ? 'purple' : 'info'}>
                    {doc.documentType === 'resume' ? 'Resume' : 'Cover Letter'}
                  </Badge>
                  {doc.structuredData?.score ? (
                    <button onClick={() => setScoreModalDoc(doc)} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                      {doc.structuredData.score.overallScore}/100
                    </button>
                  ) : doc.documentType === 'resume' && doc.structuredData?.source === 'uploaded' && (
                    <button
                      onClick={() => scoreResume(doc)}
                      disabled={scoringId === doc.id}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 disabled:opacity-60"
                    >
                      {scoringId === doc.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                      {scoringId === doc.id ? 'Analysing…' : 'Analyse'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {doc.documentType === 'resume' && (
                  <button
                    onClick={() => matchResume(doc)}
                    disabled={matchingId === doc.id}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-60"
                  >
                    {matchingId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RadarIcon className="w-3 h-3" />}
                    Match to opportunities
                  </button>
                )}
                {matchingId !== doc.id && matchResults && (
                  <div className="mt-2 space-y-1">
                    {matchResults.length === 0 ? (
                      <p className="text-[11px] text-gray-400">No open opportunities to match against.</p>
                    ) : matchResults.map(m => (
                      <div key={m.opportunityId} className="flex items-center justify-between text-[11px] bg-gray-50 rounded-lg px-2 py-1">
                        <span className="text-gray-700 truncate">{m.title}{m.companyOrOrg ? ` · ${m.companyOrOrg}` : ''}</span>
                        <span className="font-bold text-violet-600 shrink-0 ml-2">{m.matchScore}%</span>
                      </div>
                    ))}
                  </div>
                )}
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

      {showGenerate && (
        <Modal open={!!showGenerate} onClose={() => setShowGenerate(null)} title={showGenerate === 'resume' ? 'Generate Resume' : 'Generate Cover Letter'}>
          <div className="space-y-4 p-1">
            {showGenerate === 'cover_letter' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Opportunity</label>
                <select
                  value={opportunityId}
                  onChange={e => setOpportunityId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select an opportunity</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>{o.title}{o.companyOrOrg ? ` — ${o.companyOrOrg}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <Textarea
              label="Instruction"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              rows={4}
              placeholder={showGenerate === 'resume'
                ? 'e.g. Tailor this for senior backend engineering roles, emphasize distributed systems experience'
                : 'e.g. Emphasize my 5 years of fintech experience and enthusiasm for their mission'}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowGenerate(null)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">Cancel</button>
              <button
                onClick={generate}
                disabled={generating || !instruction.trim() || (showGenerate === 'cover_letter' && !opportunityId)}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                Generate
              </button>
            </div>
          </div>
        </Modal>
      )}

      {scoreModalDoc?.structuredData?.score && (
        <Modal open={!!scoreModalDoc} onClose={() => setScoreModalDoc(null)} title="Resume Score">
          <div className="space-y-3 p-1">
            {(['atsCompatibility', 'recruiterAppeal', 'technicalStrength', 'achievementFraming', 'formatting'] as const).map(key => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                <span className="text-sm font-bold text-gray-900">{scoreModalDoc.structuredData!.score![key]}/100</span>
              </div>
            ))}
            {scoreModalDoc.structuredData.score.suggestions.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-900 mb-2">Suggestions</p>
                <div className="space-y-2">
                  {scoreModalDoc.structuredData.score.suggestions.map((s, i) => (
                    <div key={i} className="rounded-xl bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-800">{s.issue}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{s.fix}</p>
                      {s.example && <p className="text-xs text-amber-600 italic mt-1">&ldquo;{s.example}&rdquo;</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Inbound Messages & Portfolio Inquiries Modal */}
      {showInquiriesModal && (
        <Modal
          open={showInquiriesModal}
          onClose={() => setShowInquiriesModal(false)}
          title={`Inbound Portfolio Messages (${inquiries.length})`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-xs text-gray-500">
              Direct inquiries and messages sent by recruiters or clients visiting your public web share portfolio page (<code className="text-indigo-600 font-mono">/p/[slug]</code>).
            </p>

            {inquiries.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-2">
                <Inbox className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-xs text-gray-600 font-medium">No inbound messages received yet.</p>
                <p className="text-[11px] text-gray-400">Share your portfolio link to start receiving direct recruitment inquiries!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inquiries.map((inq) => (
                  <div key={inq.id} className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-2.5 shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-100">{inq.name}</span>
                          {inq.company && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Building className="w-3 h-3 text-amber-400" /> {inq.company}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-bold border border-amber-400/20">
                            {inq.topic || 'Inquiry'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                          {inq.email && (
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-indigo-400" /> {inq.email}</span>
                          )}
                          {inq.phone && (
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-400" /> {inq.phone}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(inq.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans">
                      "{inq.message}"
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {inq.phone && (
                        <a
                          href={`https://wa.me/${inq.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Reply via WhatsApp</span>
                        </a>
                      )}
                      {inq.email && (
                        <a
                          href={`mailto:${inq.email}?subject=Re: ${encodeURIComponent(inq.topic || 'Portfolio Inquiry')}`}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-colors flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" />
                          <span>Reply via Email</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
