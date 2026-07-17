'use client'

import { useState } from 'react'
import { Check, X, Loader2, ClipboardCheck, Building2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// Job Search OS Phase 3 — Depth (docs/CV_STUDIO_PLAN.md §15.11-§15.14).
// Extracted out of opportunity-card.tsx once that file started approaching
// the 500-line threshold with three more expandable panels, per this
// codebase's File Architecture convention — one small file per sub-concern
// used by only one parent component. Each panel here is lazy: it fetches
// on first expand, the same on-demand pattern opportunity-card.tsx's own
// introduction-path button already established.

interface ReadinessItem {
  key: string
  label: string
  ready: boolean
  fixHref: string
}

interface ReadinessResponse {
  checklist: ReadinessItem[]
  readyCount: number
  totalCount: number
}

export function ReadinessChecklist({ opportunityId, token }: { opportunityId: string; token: string }) {
  const { addToast } = useToast()
  const [data, setData] = useState<ReadinessResponse | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !data) {
      setLoading(true)
      try {
        setData(await apiClient<ReadinessResponse>(`/api/career/opportunities/${opportunityId}/readiness`, { token }))
      } catch (err) {
        addToast({ variant: 'error', title: 'Could not load application readiness', description: err instanceof ApiError ? err.message : undefined })
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <ClipboardCheck className="w-3.5 h-3.5" />
        Readiness{data && ` (${data.readyCount}/${data.totalCount})`}
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-xl bg-gray-50 px-3 py-2 space-y-1">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          {data?.checklist.map(item => (
            <div key={item.key} className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                {item.ready ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3 text-rose-500" />}
                {item.label}
              </span>
              {!item.ready && (
                <Link href={item.fixHref} className="text-indigo-600 hover:text-indigo-700 font-semibold">Fix</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ResumeMatch {
  documentId: string
  title: string
  matchScore: number
}

interface ResumeMatchResponse {
  hasResumes: boolean
  matches: ResumeMatch[]
  bestScore: number | null
  suggestTailoring: boolean
}

export function ResumeMatchPanel({ opportunityId, token }: { opportunityId: string; token: string }) {
  const { addToast } = useToast()
  const [data, setData] = useState<ResumeMatchResponse | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !data) {
      setLoading(true)
      try {
        setData(await apiClient<ResumeMatchResponse>(`/api/career/opportunities/${opportunityId}/resume-match`, { token }))
      } catch (err) {
        addToast({ variant: 'error', title: 'Could not check resume match', description: err instanceof ApiError ? err.message : undefined })
        setExpanded(false)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
        Resume match{data?.bestScore != null && ` (${data.bestScore}%)`}
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-xl bg-gray-50 px-3 py-2 space-y-1 text-[11px]">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          {data && !data.hasResumes && (
            <p className="text-gray-500">No resumes on file yet — generate or upload one in Resume Studio.</p>
          )}
          {data?.matches.map(m => (
            <div key={m.documentId} className="flex items-center justify-between">
              <span className="text-gray-700 truncate">{m.title}</span>
              <span className="font-semibold text-gray-900 tabular-nums">{m.matchScore}%</span>
            </div>
          ))}
          {data?.suggestTailoring && (
            <p className="text-amber-700 pt-1">
              Your best-matching resume scores below 70% — consider generating a tailored version for this opportunity in Resume Studio.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface CompanyIntelligenceResponse {
  companyName: string
  cultureNotes: string | null
  recentNews: string | null
  interviewProcessNotes: string | null
  sourceCount: number
  ghosting: { hasHistory: boolean; applicationCount: number; likelyGhoster: boolean; note: string | null }
  pastInterviews: { interviewCount: number; typeFrequency: { type: string; count: number }[]; averageDifficulty: number | null; pastQuestions: string[] }
}

export function CompanyIntelligencePanel({ opportunityId, token, companyOrOrg }: { opportunityId: string; token: string; companyOrOrg: string | null }) {
  const { addToast } = useToast()
  const [data, setData] = useState<CompanyIntelligenceResponse | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!companyOrOrg) return null

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !data) {
      setLoading(true)
      try {
        setData(await apiClient<CompanyIntelligenceResponse>(`/api/career/opportunities/${opportunityId}/company-intelligence`, { token }))
      } catch (err) {
        addToast({ variant: 'error', title: 'Could not research this company', description: err instanceof ApiError ? err.message : undefined })
        setExpanded(false)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <Building2 className="w-3.5 h-3.5" />
        Company intel
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 space-y-1.5 text-[11px]">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          {data && (
            <>
              {data.ghosting.likelyGhoster && (
                <p className="inline-flex items-start gap-1 text-rose-600 font-semibold">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{data.ghosting.note}
                </p>
              )}
              {!data.ghosting.likelyGhoster && data.ghosting.note && (
                <p className="text-gray-500">{data.ghosting.note}</p>
              )}
              {data.cultureNotes && <p className="text-gray-700"><span className="font-semibold">Culture:</span> {data.cultureNotes}</p>}
              {data.recentNews && <p className="text-gray-700"><span className="font-semibold">Recent news:</span> {data.recentNews}</p>}
              {data.interviewProcessNotes && <p className="text-gray-700"><span className="font-semibold">Interview process:</span> {data.interviewProcessNotes}</p>}
              {!data.cultureNotes && !data.recentNews && !data.interviewProcessNotes && (
                <p className="text-gray-500">Nothing meaningful turned up in a web search for this company.</p>
              )}
              {data.pastInterviews.interviewCount > 0 && (
                <p className="text-gray-500 pt-1 border-t border-slate-200">
                  From your own {data.pastInterviews.interviewCount} past interview(s) here
                  {data.pastInterviews.averageDifficulty != null && ` (avg. difficulty ${data.pastInterviews.averageDifficulty}/5)`}:
                  {' '}{data.pastInterviews.typeFrequency.map(t => `${t.type} ×${t.count}`).join(', ')}
                </p>
              )}
              {data.sourceCount > 0 && <p className="text-gray-400">Based on {data.sourceCount} source(s) found.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
