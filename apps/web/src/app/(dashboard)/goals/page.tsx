'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Target, Plus, Loader2, ChevronRight, Briefcase, Heart } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, BadgeVariant, EmptyState, Input, SkeletonCard, useToast } from '@/components/ui'

// Zuri Neural Layer Phase 2 — cross-module Goal Engine
// (docs/NEURAL_LAYER_PLAN.md §4.4). Deliberately a separate surface from
// the per-relationship goals already shown on /contacts/[id] — a goal
// here spans the whole business/life ("grow monthly revenue to $20k") and
// links to deals/projects/products rather than a single contact.

interface GoalSummary {
  id: string
  title: string
  goalType: 'business' | 'personal'
  targetValue: { metric?: string; target?: number; byDate?: string } | null
  status: 'active' | 'achieved' | 'abandoned' | 'paused'
  linkedCount: number
  createdAt: string
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'achieved', label: 'Achieved' },
  { key: 'paused', label: 'Paused' },
  { key: 'abandoned', label: 'Abandoned' },
]

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'info', achieved: 'success', abandoned: 'default', paused: 'warning',
}

export default function GoalsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [goals, setGoals] = useState<GoalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'business' | 'personal'>('business')
  const [newTarget, setNewTarget] = useState('')

  const loadGoals = () => {
    if (!token) return
    setLoading(true)
    const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    apiClient<{ goals: GoalSummary[] }>(`/api/goal-profiles${query}`, { token })
      .then(data => { setGoals(data.goals); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(loadGoals, [token, statusFilter])

  const createGoal = async () => {
    if (!token || !newTitle.trim()) return
    setCreating(true)
    try {
      await apiClient('/api/goal-profiles', {
        method: 'POST', token,
        body: JSON.stringify({
          title: newTitle.trim(),
          goalType: newType,
          targetValue: newTarget.trim() ? { metric: newTarget.trim() } : undefined,
        }),
      })
      addToast({ variant: 'success', title: 'Goal created' })
      setShowNew(false)
      setNewTitle('')
      setNewTarget('')
      loadGoals()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create goal', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setCreating(false)
    }
  }

  const stats = {
    active: goals.filter(g => g.status === 'active').length,
    business: goals.filter(g => g.goalType === 'business').length,
    personal: goals.filter(g => g.goalType === 'personal').length,
  }

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6 pb-0">
        <div className="relative rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-5 md:p-6 max-w-5xl mx-auto w-full">
          <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
          </div>
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                Zuri Neural Layer
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950">Goals</h1>
            <p className="text-sm text-gray-600 max-w-xl mt-1 leading-relaxed">
              Goals that span the whole business or life — not just one relationship. Link deals, projects,
              and products to a goal so Zuri can flag when an action works against it.
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.active}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">active</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.business}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">business</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.personal}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">personal</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
              <button
                onClick={() => setShowNew(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-500 active:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />New Goal
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 pt-4">
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : goals.length === 0 ? (
          <EmptyState
            icon={<Target className="w-10 h-10 text-indigo-500" />}
            title="No goals yet"
            description="Create a goal — a revenue target, a life milestone — and link deals, projects, or products to it."
            action={
              <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />New Goal
              </button>
            }
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {goals.map(g => (
              <Link
                key={g.id}
                href={`/goals/${g.id}`}
                className="block bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 px-4 py-3.5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${g.goalType === 'business' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                    {g.goalType === 'business' ? <Briefcase className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{g.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {g.targetValue?.metric ? g.targetValue.metric : 'No target metric set'}
                      {g.linkedCount > 0 && ` · ${g.linkedCount} linked`}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[g.status] ?? 'default'}>{g.status}</Badge>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New Goal</h2>
            <div className="space-y-4">
              <Input label="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Grow monthly revenue to $20,000" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewType('business')}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${newType === 'business' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    Business
                  </button>
                  <button
                    onClick={() => setNewType('personal')}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${newType === 'personal' ? 'bg-rose-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    Personal
                  </button>
                </div>
              </div>
              <Input
                label="Target metric (optional)"
                value={newTarget}
                onChange={e => setNewTarget(e.target.value)}
                placeholder="e.g. monthly_revenue, or a free-text description"
                helper="Zuri uses this to notice when an action works against the goal."
              />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={createGoal}
                disabled={creating || !newTitle.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
