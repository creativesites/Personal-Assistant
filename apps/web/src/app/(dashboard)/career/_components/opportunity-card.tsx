'use client'

import { useState } from 'react'
import { Sparkles, Building2, MapPin, Briefcase, ChevronDown, ChevronUp, Loader2, Plus, ExternalLink, Users, Check, X } from 'lucide-react'
import Link from 'next/link'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, BadgeVariant, useToast } from '@/components/ui'
import { ReadinessChecklist, ResumeMatchPanel, CompanyIntelligencePanel } from './opportunity-insights'
import { CvTailoringPanel } from './cv-tailoring-panel'

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
  contactEmail?: string | null
  contactPhone?: string | null
  matchScore: number | null
  matchBreakdown?: {
    skills?: number
    location?: number
    salary?: number
    category?: number
    freshness?: number
    matchedSkills?: string[]
    missingSkills?: string[]
  } | null
  applicationUrl?: string | null
  projectId: string | null
  confidence?: number | null
  createdAt: string
}

// Job Search OS §15.10 — "Why this job?" renders directly from
// match_breakdown, never a separately-generated narrative that could drift
// from the actual score. Only web_search-sourced opportunities carry a
// breakdown today (job_discovery.py is its only writer).
const BREAKDOWN_LABELS: Record<string, string> = {
  skills: 'Skills match', location: 'Location fit', salary: 'Salary fit',
  category: 'Role/industry fit', freshness: 'Freshness',
}

function hasBreakdown(b: CareerOpportunity['matchBreakdown']): b is NonNullable<CareerOpportunity['matchBreakdown']> {
  return !!b && b.skills != null
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

interface IntroductionPathHop {
  contactId: string
  contactName: string
  connectionType: string | null
}

interface IntroductionPathResponse {
  hasTarget: boolean
  isDirect: boolean
  targetContactName?: string
  path: IntroductionPathHop[]
  draft: string | null
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
  opp, token, onStatusChange, onApplied, badges,
}: {
  opp: CareerOpportunity
  token: string
  onStatusChange: (opp: CareerOpportunity, status: string) => void
  onApplied: (opp: CareerOpportunity, projectId: string) => void
  // Career OS Living Companion redesign, Phase 3 — job-feed.tsx's source
  // badges (🇿🇲/🌐/⚡/🌍/🤝), computed once per feed render rather than
  // recomputed inside this card, since job-feed.tsx already needs the same
  // freshness/remote/source checks for sorting.
  badges?: { emoji: string; label: string }[]
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

  const [introPath, setIntroPath] = useState<IntroductionPathResponse | null>(null)
  const [loadingIntroPath, setLoadingIntroPath] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

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

  const findIntroductionPath = async () => {
    setLoadingIntroPath(true)
    try {
      const data = await apiClient<IntroductionPathResponse>(`/api/career/opportunities/${opp.id}/introduction-path`, { token })
      setIntroPath(data)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not find an introduction path', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLoadingIntroPath(false)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/career/jobs/${opp.id}`} className="font-semibold text-indigo-700 hover:underline text-sm truncate block">
              {opp.title}
            </Link>
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
          {opp.applicationUrl && (
            <p className="text-xs mt-1">
              <a
                href={opp.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline font-semibold"
              >
                <span>🔗 Direct Apply / Listing</span>
                <ExternalLink className="w-3 h-3 text-indigo-600 animate-pulse" />
              </a>
            </p>
          )}
          {(opp.contactEmail || opp.contactPhone || opp.contactName) && (
            <div className="text-xs text-gray-500 mt-1.5 bg-slate-50 border border-slate-100/50 rounded-xl p-2 flex flex-col gap-1 max-w-sm">
              {opp.contactName && <p className="text-gray-700 font-semibold">Contact: {opp.contactName}</p>}
              {opp.contactEmail && (
                <p className="inline-flex items-center gap-1 text-gray-600">
                  <span>📧</span>
                  <a href={`mailto:${opp.contactEmail}`} className="text-indigo-600 hover:underline font-medium break-all">
                    {opp.contactEmail}
                  </a>
                </p>
              )}
              {opp.contactPhone && (
                <p className="inline-flex items-center gap-1 text-gray-600">
                  <span>📞</span>
                  <a href={`tel:${opp.contactPhone}`} className="text-indigo-600 hover:underline font-medium">
                    {opp.contactPhone}
                  </a>
                </p>
              )}
            </div>
          )}
          {!!badges?.length && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {badges.map(b => (
                <span key={b.label} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-100">
                  {b.emoji} {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {opp.matchScore != null && (
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className="shrink-0 text-right"
            disabled={!hasBreakdown(opp.matchBreakdown)}
          >
            <p className="text-lg font-black text-gray-950 tabular-nums">{opp.matchScore}%</p>
            <p className="text-[10px] text-gray-400 inline-flex items-center gap-0.5">
              match{hasBreakdown(opp.matchBreakdown) && (showBreakdown ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
            </p>
          </button>
        )}
      </div>

      {showBreakdown && hasBreakdown(opp.matchBreakdown) && (
        <div className="mt-2 rounded-xl bg-indigo-50/70 px-3 py-2 space-y-1">
          {(['skills', 'location', 'salary', 'category', 'freshness'] as const)
            .filter(k => opp.matchBreakdown?.[k] != null)
            .map(k => (
              <div key={k} className="flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1 text-indigo-800">
                  {(opp.matchBreakdown![k] as number) >= 60
                    ? <Check className="w-3 h-3 text-emerald-600" />
                    : <X className="w-3 h-3 text-rose-500" />}
                  {BREAKDOWN_LABELS[k]}
                </span>
                <span className="font-semibold text-indigo-700 tabular-nums">{opp.matchBreakdown![k]}%</span>
              </div>
            ))}
          {!!opp.matchBreakdown.missingSkills?.length && (
            <p className="text-[11px] text-rose-600 pt-1">Missing: {opp.matchBreakdown.missingSkills.join(', ')}</p>
          )}
          {opp.applicationUrl && (
            <a href={opp.applicationUrl} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 pt-1">
              View listing<ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

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

      {/* grid, not flex-wrap: each panel's expanded content used to inherit
          its flex item's shrink-to-fit width (as narrow as its own button
          label), squashing any real content into an unreadable column —
          worst on mobile, where there's the least width to go around. A
          grid gives every panel a full, predictable column regardless of
          whether it's collapsed or expanded. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mt-2 pt-2 border-t border-gray-50">
        <ReadinessChecklist opportunityId={opp.id} token={token} />
        <ResumeMatchPanel opportunityId={opp.id} token={token} />
        <CompanyIntelligencePanel opportunityId={opp.id} token={token} companyOrOrg={opp.companyOrOrg} />
        <CvTailoringPanel opportunityId={opp.id} token={token} />
      </div>

      <div className="mt-2">
        {!introPath ? (
          <button
            onClick={findIntroductionPath}
            disabled={loadingIntroPath}
            className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-60"
          >
            {loadingIntroPath ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            Who can introduce me?
          </button>
        ) : (
          <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs">
            {!introPath.hasTarget ? (
              <p className="text-violet-700">No known hiring contact for this opportunity yet — add one on the opportunity to unlock this.</p>
            ) : introPath.isDirect ? (
              <p className="text-violet-700">You already know <strong>{introPath.targetContactName}</strong> directly — reach out yourself.</p>
            ) : introPath.path.length === 0 ? (
              <p className="text-violet-700"><strong>{introPath.targetContactName}</strong> isn't reachable through your network yet — a cold outreach may be the only option.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-violet-700">
                  {introPath.path.map(h => h.contactName).join(' → ')} → <strong>{introPath.targetContactName}</strong>
                </p>
                {introPath.draft && (
                  <div className="rounded-lg bg-white px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">Draft ask to {introPath.path[0].contactName}:</p>
                    <p className="text-gray-700 italic">&ldquo;{introPath.draft}&rdquo;</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
