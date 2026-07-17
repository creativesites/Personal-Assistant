'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Plus, Loader2, Target, Radar, Search } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, EmptyState, Input, Modal, SkeletonCard, useToast } from '@/components/ui'
import { ResumeStudio } from './_components/resume-studio'
import { CoverLetterStudio } from './_components/cover-letter-studio'
import { OpportunityCard, type CareerOpportunity } from './_components/opportunity-card'
import { CareerRadar } from './_components/career-radar'
import { CareerProfileEditor } from './_components/career-profile-editor'
import { useCareerProfile } from './_components/cv-studio/use-career-profile'
import { FeatureGate } from '@/components/ui'

// Zuri Career & Growth Engine, Phase 1 (see docs/CAREER_GROWTH_ENGINE_PLAN.md
// §3/§5) — a Career Profile (the single professional-identity source) plus
// the Opportunity Engine's status-lifecycle list. Deliberately ungated by
// workspace mode (business/personal) — career growth matters in both, same
// reasoning as the Goals page sitting in this codebase's ungated nav group.

interface ActivityEvent {
  id: string
  eventType: string
  confidence: number | null
  evidence: string[]
  status: string
  bundleId: string | null
  contactName: string | null
  createdAt: string
}

const ACTIVITY_LABELS: Record<string, string> = {
  career_opportunity_detected: 'Career opportunity noticed',
}

const CATEGORIES = [
  'job', 'contract', 'consulting', 'investment', 'speaking', 'partnership',
  'collaboration', 'freelance', 'board_position', 'research', 'mentorship',
  'grant', 'scholarship', 'tender', 'supplier_opportunity', 'acquisition',
]

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'detected', label: 'Detected' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'applied', label: 'Applied' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offered', label: 'Offered' },
]

function formatCategory(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function CareerPageInner() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const careerProfile = useCareerProfile(token ?? '')
  const { profile } = careerProfile
  const [showProfileEdit, setShowProfileEdit] = useState(false)

  const [opportunities, setOpportunities] = useState<CareerOpportunity[]>([])
  const [oppsLoading, setOppsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showNewOpp, setShowNewOpp] = useState(false)
  const [creatingOpp, setCreatingOpp] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('job')
  const [newCompany, setNewCompany] = useState('')
  const [newLocation, setNewLocation] = useState('')

  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [activityLoading, setActivityLoading] = useState(true)

  const [jobDiscoveryStatus, setJobDiscoveryStatus] = useState<{ cap: number; usedToday: number; remaining: number } | null>(null)
  const [fetchingJobs, setFetchingJobs] = useState(false)

  const loadActivity = () => {
    if (!token) return
    setActivityLoading(true)
    apiClient<{ events: ActivityEvent[] }>('/api/career/activity', { token })
      .then(data => { setActivity(data.events); setActivityLoading(false) })
      .catch(() => setActivityLoading(false))
  }

  const loadJobDiscoveryStatus = () => {
    if (!token) return
    apiClient<{ cap: number; usedToday: number; remaining: number }>('/api/career/job-discovery/status', { token })
      .then(setJobDiscoveryStatus)
      .catch(() => {})
  }

  const fetchJobsNow = async () => {
    if (!token || fetchingJobs || (jobDiscoveryStatus && jobDiscoveryStatus.remaining <= 0)) return
    setFetchingJobs(true)
    try {
      const result = await apiClient<{ opportunitiesFound: number; remaining: number; cap: number }>(
        '/api/career/job-discovery/run', { method: 'POST', token },
      )
      setJobDiscoveryStatus({ cap: result.cap, usedToday: result.cap - result.remaining, remaining: result.remaining })
      addToast({
        variant: 'success',
        title: result.opportunitiesFound > 0 ? `Found ${result.opportunitiesFound} new opportunit${result.opportunitiesFound === 1 ? 'y' : 'ies'}` : 'No new opportunities this time',
        description: `${result.remaining} manual search${result.remaining === 1 ? '' : 'es'} left today.`,
      })
      loadOpportunities()
      loadActivity()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not fetch jobs', description: err instanceof ApiError ? err.message : undefined })
      loadJobDiscoveryStatus()
    } finally {
      setFetchingJobs(false)
    }
  }

  const loadOpportunities = () => {
    if (!token) return
    setOppsLoading(true)
    const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    apiClient<{ opportunities: CareerOpportunity[] }>(`/api/career/opportunities${query}`, { token })
      .then(data => { setOpportunities(data.opportunities); setOppsLoading(false) })
      .catch(() => setOppsLoading(false))
  }

  useEffect(loadOpportunities, [token, statusFilter])
  useEffect(loadActivity, [token])
  useEffect(loadJobDiscoveryStatus, [token])

  const createOpportunity = async () => {
    if (!token || !newTitle.trim()) return
    setCreatingOpp(true)
    try {
      await apiClient('/api/career/opportunities', {
        method: 'POST', token,
        body: JSON.stringify({
          title: newTitle.trim(), category: newCategory,
          companyOrOrg: newCompany.trim() || undefined, location: newLocation.trim() || undefined,
          source: 'manual',
        }),
      })
      addToast({ variant: 'success', title: 'Opportunity added' })
      setShowNewOpp(false)
      setNewTitle(''); setNewCompany(''); setNewLocation('')
      loadOpportunities()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not add opportunity', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setCreatingOpp(false)
    }
  }

  const updateStatus = async (opp: CareerOpportunity, status: string) => {
    if (!token) return
    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, status } : o))
    try {
      await apiClient(`/api/career/opportunities/${opp.id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
    } catch {
      loadOpportunities()
    }
  }

  const handleApplied = (opp: CareerOpportunity, projectId: string) => {
    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, projectId, status: 'applied' } : o))
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] pb-10">
      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-5 md:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)] pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100 mb-3">
                <Briefcase className="w-3.5 h-3.5" />
                Career OS
              </div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-gray-950">
                {profile?.headline || 'Build your career profile'}
              </h1>
              <p className="text-sm text-gray-600 mt-1 max-w-lg">
                Help me create more opportunities — not just find a job. Your profile powers every generated resume,
                match score, and introduction Zuri suggests.
              </p>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setShowProfileEdit(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 active:bg-indigo-700 min-h-[44px]"
            >
              {profile?.headline ? 'Edit Profile' : 'Set Up Profile'}
            </button>
            <Link
              href="/career/cv-studio"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-950 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-slate-900/15 hover:bg-slate-800 min-h-[44px]"
            >
              CV Studio
            </Link>
          </div>
        </div>

        {profile && (profile.targetRoles?.length > 0 || profile.remotePreference) && (
          <div className="flex flex-wrap gap-2">
            {profile.targetRoles?.map(role => (
              <span key={role} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 shadow-sm">
                <Target className="w-3 h-3" />{role}
              </span>
            ))}
            {profile.remotePreference && (
              <Badge variant="info">{profile.remotePreference.replace('_', ' ')}</Badge>
            )}
          </div>
        )}

        {token && <CareerRadar token={token} />}

        {!activityLoading && activity.length > 0 && (
          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
              <div className="w-8 h-8 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <Radar className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Zuri Noticed</h2>
            </div>
            <div>
              {activity.map(event => (
                <div key={event.id} className="flex items-start gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      {ACTIVITY_LABELS[event.eventType] ?? event.eventType}
                      {event.contactName && <span className="text-gray-400"> · via {event.contactName}</span>}
                    </p>
                    {event.evidence[0] && (
                      <p className="text-xs text-gray-500 mt-0.5 italic truncate">&ldquo;{event.evidence[0]}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {event.confidence != null && (
                        <span className="text-[10px] font-semibold text-violet-600">{Math.round(event.confidence * 100)}% confident</span>
                      )}
                      {event.status === 'bundled' && <Badge variant="info">In pending bundle</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {token && <ResumeStudio token={token} opportunities={opportunities.map(o => ({ id: o.id, title: o.title, companyOrOrg: o.companyOrOrg }))} />}

        {token && <CoverLetterStudio token={token} opportunities={opportunities.map(o => ({ id: o.id, title: o.title, companyOrOrg: o.companyOrOrg }))} />}

        <div>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Opportunities</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchJobsNow}
                disabled={fetchingJobs || (jobDiscoveryStatus != null && jobDiscoveryStatus.remaining <= 0)}
                title={jobDiscoveryStatus ? `${jobDiscoveryStatus.remaining}/${jobDiscoveryStatus.cap} manual searches left today` : undefined}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100 shadow-sm hover:bg-emerald-50 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                {fetchingJobs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Fetch Jobs
                {jobDiscoveryStatus ? (
                  <span className="text-[10px] font-semibold text-emerald-500">{jobDiscoveryStatus.remaining}/{jobDiscoveryStatus.cap}</span>
                ) : null}
              </button>
              <button
                onClick={() => setShowNewOpp(true)}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 shadow-sm hover:bg-indigo-50 min-h-[40px]"
              >
                <Plus className="w-4 h-4" />Add
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`shrink-0 inline-flex min-h-10 items-center rounded-2xl px-3 text-xs font-bold transition-colors ${
                  statusFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {oppsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : opportunities.length === 0 ? (
            <EmptyState
              icon="💼"
              title="No opportunities yet"
              description="Add one manually, or Zuri will surface opportunities it notices in your WhatsApp conversations."
              action={<button onClick={() => setShowNewOpp(true)} className="text-sm font-semibold text-indigo-600">+ Add an opportunity</button>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {opportunities.map(opp => (
                <OpportunityCard key={opp.id} opp={opp} token={token ?? ''} onStatusChange={updateStatus} onApplied={handleApplied} />
              ))}
            </div>
          )}
        </div>
      </div>

      {token && (
        <CareerProfileEditor
          token={token}
          open={showProfileEdit}
          onClose={() => setShowProfileEdit(false)}
          sharedProfile={careerProfile}
        />
      )}

      {showNewOpp && (
        <Modal open={showNewOpp} onClose={() => setShowNewOpp(false)} title="Add Opportunity">
          <div className="space-y-4 p-1">
            <Input label="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Senior React Developer" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{formatCategory(c)}</option>)}
              </select>
            </div>
            <Input label="Company / Organization" value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="e.g. Zanaco" />
            <Input label="Location" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. Lusaka, Zambia or Remote" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewOpp(false)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">Cancel</button>
              <button
                onClick={createOpportunity}
                disabled={creatingOpp || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {creatingOpp && <Loader2 className="w-4 h-4 animate-spin" />}
                Add
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function CareerPage() {
  return (
    <FeatureGate requiredFamily="personal" featureLabel="Career OS">
      <CareerPageInner />
    </FeatureGate>
  )
}
