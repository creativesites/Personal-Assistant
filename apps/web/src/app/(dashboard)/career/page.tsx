'use client'

import { useEffect, useState } from 'react'
import { Briefcase, Plus, Loader2, X, Sparkles, Target, MapPin, Building2, Radar } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, BadgeVariant, EmptyState, Input, Modal, SkeletonCard, Textarea, useToast } from '@/components/ui'

// Zuri Career & Growth Engine, Phase 1 (see docs/CAREER_GROWTH_ENGINE_PLAN.md
// §3/§5) — a Career Profile (the single professional-identity source) plus
// the Opportunity Engine's status-lifecycle list. Deliberately ungated by
// workspace mode (business/personal) — career growth matters in both, same
// reasoning as the Goals page sitting in this codebase's ungated nav group.

interface CareerProfile {
  headline: string | null
  summary: string | null
  skills: { name: string; level?: string; yearsExperience?: number }[]
  targetRoles: string[]
  targetIndustries: string[]
  salaryExpectationCents: number | null
  salaryCurrency: string
  remotePreference: string | null
  country: string | null
  githubUrl: string | null
  linkedinUrl: string | null
  portfolioUrl: string | null
}

interface CareerOpportunity {
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
  createdAt: string
}

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

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  detected: 'default', shortlisted: 'info', applied: 'info', interviewing: 'warning',
  offered: 'success', accepted: 'success', rejected: 'error', withdrawn: 'default', archived: 'default',
}

function formatCategory(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function CareerPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [profile, setProfile] = useState<CareerProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [headlineDraft, setHeadlineDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [targetRolesDraft, setTargetRolesDraft] = useState('')
  const [remotePrefDraft, setRemotePrefDraft] = useState('')

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

  const loadActivity = () => {
    if (!token) return
    setActivityLoading(true)
    apiClient<{ events: ActivityEvent[] }>('/api/career/activity', { token })
      .then(data => { setActivity(data.events); setActivityLoading(false) })
      .catch(() => setActivityLoading(false))
  }

  const loadProfile = () => {
    if (!token) return
    setProfileLoading(true)
    apiClient<{ profile: CareerProfile }>('/api/career/profile', { token })
      .then(data => {
        setProfile(data.profile)
        setHeadlineDraft(data.profile.headline ?? '')
        setSummaryDraft(data.profile.summary ?? '')
        setTargetRolesDraft((data.profile.targetRoles ?? []).join(', '))
        setRemotePrefDraft(data.profile.remotePreference ?? '')
        setProfileLoading(false)
      })
      .catch(() => setProfileLoading(false))
  }

  const loadOpportunities = () => {
    if (!token) return
    setOppsLoading(true)
    const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    apiClient<{ opportunities: CareerOpportunity[] }>(`/api/career/opportunities${query}`, { token })
      .then(data => { setOpportunities(data.opportunities); setOppsLoading(false) })
      .catch(() => setOppsLoading(false))
  }

  useEffect(loadProfile, [token])
  useEffect(loadOpportunities, [token, statusFilter])
  useEffect(loadActivity, [token])

  const saveProfile = async () => {
    if (!token) return
    setSavingProfile(true)
    try {
      await apiClient('/api/career/profile', {
        method: 'PATCH', token,
        body: JSON.stringify({
          headline: headlineDraft.trim() || null,
          summary: summaryDraft.trim() || null,
          targetRoles: targetRolesDraft.split(',').map(s => s.trim()).filter(Boolean),
          remotePreference: remotePrefDraft || null,
        }),
      })
      addToast({ variant: 'success', title: 'Career profile updated' })
      setShowProfileEdit(false)
      loadProfile()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save profile', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSavingProfile(false)
    }
  }

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
          <button
            onClick={() => setShowProfileEdit(true)}
            className="relative mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 active:bg-indigo-700 min-h-[44px]"
          >
            {profile?.headline ? 'Edit Profile' : 'Set Up Profile'}
          </button>
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Opportunities</h2>
            <button
              onClick={() => setShowNewOpp(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 shadow-sm hover:bg-indigo-50 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />Add
            </button>
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
                <div key={opp.id} className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4">
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
                      {opp.contactName && (
                        <p className="text-xs text-gray-400 mt-0.5">via {opp.contactName}</p>
                      )}
                    </div>
                    {opp.matchScore != null && (
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-gray-950 tabular-nums">{opp.matchScore}%</p>
                        <p className="text-[10px] text-gray-400">match</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <Badge variant={STATUS_VARIANTS[opp.status] ?? 'default'}>{opp.status}</Badge>
                    <select
                      value={opp.status}
                      onChange={e => updateStatus(opp, e.target.value)}
                      className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700 font-medium"
                    >
                      {['detected', 'shortlisted', 'applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'archived'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showProfileEdit && (
        <Modal open={showProfileEdit} onClose={() => setShowProfileEdit(false)} title="Career Profile">
          <div className="space-y-4 p-1">
            <Input label="Headline" value={headlineDraft} onChange={e => setHeadlineDraft(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            <Textarea
              label="Summary"
              value={summaryDraft}
              onChange={e => setSummaryDraft(e.target.value)}
              rows={3}
              placeholder="A short professional summary"
            />
            <Input label="Target roles (comma-separated)" value={targetRolesDraft} onChange={e => setTargetRolesDraft(e.target.value)} placeholder="Senior AI Engineer, Tech Lead" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Remote preference</label>
              <select
                value={remotePrefDraft}
                onChange={e => setRemotePrefDraft(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No preference set</option>
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
                <option value="no_preference">No preference</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowProfileEdit(false)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">Cancel</button>
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </Modal>
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
