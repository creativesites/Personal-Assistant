'use client'

import { useState } from 'react'
import { Sparkles, Building2, MapPin, Briefcase, ChevronDown, ChevronUp, Loader2, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, BadgeVariant, useToast } from '@/components/ui'

// Career & Growth Engine Phase 4 — Applications as Projects + Interview
// Memory (docs/CAREER_GROWTH_ENGINE_PLAN.md §9/§10). Extracted out of
// career/page.tsx's inline opportunity card (same File Architecture
// convention as resume-studio.tsx) once it grew an Apply action and an
// expandable interview tracker.

export interface CareerOpportunity {
  id: string
  category: string
  title: string
  companyOrOrg: string | null
  location: string | null
  isRemote: boolean | null
  source: string
  status: string
  contactName?: string
  matchScore: number | null
  projectId: string | null
  createdAt: string
}

interface CareerInterview {
  id: string
  roundNumber: number
  interviewType: string
  scheduledAt: string | null
  questionsAsked: string[]
  userNotes: string | null
  outcome: string
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  detected: 'default', shortlisted: 'info', applied: 'info', interviewing: 'warning',
  offered: 'success', accepted: 'success', rejected: 'error', withdrawn: 'default', archived: 'default',
}

const INTERVIEW_TYPES = ['phone_screen', 'technical', 'behavioral', 'case', 'panel', 'final']
const OUTCOME_VARIANTS: Record<string, BadgeVariant> = {
  pending: 'default', passed: 'success', failed: 'error', withdrawn: 'default',
}

function formatCategory(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function OpportunityCard({
  opp, token, onStatusChange, onApplied,
}: {
  opp: CareerOpportunity
  token: string
  onStatusChange: (opp: CareerOpportunity, status: string) => void
  onApplied: (opp: CareerOpportunity, projectId: string) => void
}) {
  const { addToast } = useToast()
  const [applying, setApplying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [interviews, setInterviews] = useState<CareerInterview[] | null>(null)
  const [loadingInterviews, setLoadingInterviews] = useState(false)
  const [showAddInterview, setShowAddInterview] = useState(false)
  const [newType, setNewType] = useState('phone_screen')
  const [newScheduledAt, setNewScheduledAt] = useState('')
  const [addingInterview, setAddingInterview] = useState(false)

  const apply = async () => {
    setApplying(true)
    try {
      const data = await apiClient<{ projectId: string; alreadyExisted?: boolean }>(
        `/api/career/opportunities/${opp.id}/apply`, { method: 'POST', token },
      )
      addToast({ variant: 'success', title: data.alreadyExisted ? 'Already has a project' : 'Project created — resume, cover letter & follow-up tasks added' })
      onApplied(opp, data.projectId)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not create project', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setApplying(false)
    }
  }

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    if (next && interviews === null) {
      setLoadingInterviews(true)
      apiClient<{ interviews: CareerInterview[] }>(`/api/career/opportunities/${opp.id}/interviews`, { token })
        .then(data => { setInterviews(data.interviews); setLoadingInterviews(false) })
        .catch(() => setLoadingInterviews(false))
    }
  }

  const addInterview = async () => {
    setAddingInterview(true)
    try {
      const data = await apiClient<{ interview: CareerInterview }>(
        `/api/career/opportunities/${opp.id}/interviews`, {
          method: 'POST', token,
          body: JSON.stringify({ interviewType: newType, scheduledAt: newScheduledAt || undefined }),
        },
      )
      setInterviews(prev => [...(prev ?? []), data.interview])
      setShowAddInterview(false); setNewScheduledAt('')
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not add interview round', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setAddingInterview(false)
    }
  }

  const setOutcome = async (interview: CareerInterview, outcome: string) => {
    setInterviews(prev => prev?.map(i => i.id === interview.id ? { ...i, outcome } : i) ?? null)
    try {
      await apiClient(`/api/career/interviews/${interview.id}`, { method: 'PATCH', token, body: JSON.stringify({ outcome }) })
    } catch {
      // best-effort — a stale badge here isn't worth a full refetch
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{opp.title}</p>
            <Badge variant="purple">{formatCategory(opp.category)}</Badge>
            {opp.source === 'whatsapp_detected' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <Sparkles className="w-3 h-3" />Zuri noticed
              </span>
            )}
          </div>
          {(opp.companyOrOrg || opp.location) && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
              {opp.companyOrOrg && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{opp.companyOrOrg}</span>}
              {opp.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{opp.location}</span>}
            </p>
          )}
          {opp.contactName && <p className="text-xs text-gray-400 mt-0.5">via {opp.contactName}</p>}
        </div>
        {opp.matchScore != null && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-black text-gray-950 tabular-nums">{opp.matchScore}%</p>
            <p className="text-[10px] text-gray-400">match</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 gap-2">
        <Badge variant={STATUS_VARIANTS[opp.status] ?? 'default'}>{opp.status}</Badge>
        <select
          value={opp.status}
          onChange={e => onStatusChange(opp, e.target.value)}
          className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700 font-medium"
        >
          {['detected', 'shortlisted', 'applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'archived'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        {opp.projectId ? (
          <Link href={`/projects/${opp.projectId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            <Briefcase className="w-3.5 h-3.5" />View Project<ExternalLink className="w-3 h-3" />
          </Link>
        ) : (
          <button
            onClick={apply}
            disabled={applying}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />}
            Apply — create project
          </button>
        )}
        <button onClick={toggleExpanded} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
          Interviews {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          {loadingInterviews ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <div className="space-y-2">
              {(interviews ?? []).map(iv => (
                <div key={iv.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">Round {iv.roundNumber} · {formatCategory(iv.interviewType)}</p>
                    {iv.scheduledAt && (
                      <p className="text-gray-400">{new Date(iv.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    )}
                  </div>
                  <select
                    value={iv.outcome}
                    onChange={e => setOutcome(iv, e.target.value)}
                    className="text-[11px] rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-gray-700 font-medium shrink-0"
                  >
                    {['pending', 'passed', 'failed', 'withdrawn'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {(interviews ?? []).length === 0 && <p className="text-xs text-gray-400">No interview rounds logged yet.</p>}

              {showAddInterview ? (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <select
                      value={newType} onChange={e => setNewType(e.target.value)}
                      className="flex-1 text-xs rounded-lg border border-gray-200 px-2 py-1.5"
                    >
                      {INTERVIEW_TYPES.map(t => <option key={t} value={t}>{formatCategory(t)}</option>)}
                    </select>
                    <input
                      type="datetime-local" value={newScheduledAt} onChange={e => setNewScheduledAt(e.target.value)}
                      className="flex-1 text-xs rounded-lg border border-gray-200 px-2 py-1.5"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddInterview(false)} className="text-xs font-semibold text-gray-500">Cancel</button>
                    <button
                      onClick={addInterview} disabled={addingInterview}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 disabled:opacity-60"
                    >
                      {addingInterview && <Loader2 className="w-3 h-3 animate-spin" />}Save
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddInterview(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  <Plus className="w-3.5 h-3.5" />Log an interview round
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
