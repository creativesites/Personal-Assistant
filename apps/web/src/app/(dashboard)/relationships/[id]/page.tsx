'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Clock,
  Flag,
  RefreshCw,
  Loader2,
  Target,
  Check,
  Sparkles,
  Gift,
  ShoppingCart,
  TrendingUp,
  Calendar,
  ChevronRight,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, EmptyState, useToast } from '@/components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RelationshipItem {
  id: string
  name: string
  avatarUrl: string | null
  customerStatus: string
  relationshipType: string
  importanceTier: number
  healthScore: number
  healthTrend: 'improving' | 'stable' | 'declining'
  changeReason: string | null
  lastInteractionAt: string | null
  relationshipCreatedAt: string
  networkValue: Record<string, unknown>
  revenueCents: number
  nextSuggestion: { id: string; title: string } | null
  currentDeal: { title: string; stage: string; probability: number; valueCents: number } | null
  products: string[]
  nextReplacementDate: string | null
  sharedInterests: string[]
  importantDates: Array<{ title: string; type: string; date: string | null; isRecurring: boolean }>
  sharedHistorySince: string | null
}

interface HealthHistoryEntry {
  healthScore: number
  previousScore: number | null
  changeReason: string | null
  contributingFactors: Record<string, number> | null
  loggedAt: string
}

interface RelationshipClock {
  id: string
  clock_type: string
  is_enabled: boolean
  avg_days_between_messages: number | null
  dormancy_days_threshold: number | null
  last_triggered_at: string | null
  next_trigger_at: string | null
}

interface RelationshipGoal {
  id: string
  goalType: string
  title: string
  description: string | null
  targetDate: string | null
  status: 'active' | 'achieved' | 'abandoned'
  aiNextStep: string | null
  createdAt: string
  achievedAt: string | null
}

type TabKey = 'overview' | 'health' | 'clocks' | 'goals'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

function formatClockType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const

const TREND: Record<string, { variant: 'success' | 'error' | 'default'; label: string }> = {
  improving: { variant: 'success', label: '↑ Improving' },
  declining:  { variant: 'error',   label: '↓ Declining' },
  stable:     { variant: 'default', label: '→ Stable' },
}

const FACTOR_COLORS: Record<string, string> = {
  recency:          'bg-blue-500',
  frequency:        'bg-indigo-500',
  sentiment:        'bg-green-500',
  responsiveness:   'bg-amber-500',
  pipelineVelocity: 'bg-purple-500',
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const color = FACTOR_COLORS[label] ?? 'bg-gray-400'
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-gray-500 capitalize">{label.replace(/([A-Z])/g, ' $1')}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-gray-400">{pct}%</span>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ contact }: { contact: RelationshipItem }) {
  const trend = TREND[contact.healthTrend] ?? TREND.stable
  const nv = contact.networkValue
  const isBusiness = 'financialValueCents' in nv || contact.revenueCents > 0 || !!contact.currentDeal
  const financialValue = nv.financialValueCents as number | undefined
  const referralValue  = nv.referralValue  as number | undefined
  const influenceScore = nv.influenceScore as number | undefined
  const closenessScore = nv.closenessScore as number | undefined
  const reciprocity    = nv.reciprocity    as number | undefined
  const supportScore   = nv.supportScore   as number | undefined

  return (
    <div className="space-y-4">
      {/* Health card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Relationship Health</h3>
          <Badge variant={trend.variant}>{trend.label}</Badge>
        </div>
        <div className="mb-4">
          <div className="flex items-end gap-3 mb-2">
            <span className="text-4xl font-bold text-gray-900">{contact.healthScore}</span>
            <span className="text-sm text-gray-400 pb-1">/ 100</span>
          </div>
          <HealthBar score={contact.healthScore} showLabel size="sm" />
        </div>
        {contact.changeReason && (
          <p className="text-sm text-gray-500 leading-relaxed mt-3 pt-3 border-t border-gray-100">
            {contact.changeReason}
          </p>
        )}
      </div>

      {/* Value card — business or personal */}
      {isBusiness ? (
        (financialValue !== undefined || referralValue !== undefined || influenceScore !== undefined) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <TrendingUp size={15} className="text-indigo-500" /> Business Value
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {financialValue !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-base font-semibold text-gray-900">{formatCents(financialValue)}</p>
                </div>
              )}
              {referralValue !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Referral value</p>
                  <p className="text-base font-semibold text-gray-900">{formatCents(referralValue)}</p>
                </div>
              )}
              {influenceScore !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Influence</p>
                  <p className="text-base font-semibold text-gray-900">{influenceScore}</p>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        (closenessScore !== undefined || reciprocity !== undefined || supportScore !== undefined) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Sparkles size={15} className="text-purple-500" /> Connection Value
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {closenessScore !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Closeness</p>
                  <p className="text-base font-semibold text-gray-900">{closenessScore}</p>
                </div>
              )}
              {reciprocity !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Reciprocity</p>
                  <p className="text-base font-semibold text-gray-900">{reciprocity}</p>
                </div>
              )}
              {supportScore !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">Support</p>
                  <p className="text-base font-semibold text-gray-900">{supportScore}</p>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Current deal */}
      {contact.currentDeal && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Flag size={15} className="text-amber-500" /> Active Deal
          </h3>
          <p className="font-medium text-gray-900 text-sm">{contact.currentDeal.title}</p>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="info" className="capitalize">{contact.currentDeal.stage.replace(/_/g, ' ')}</Badge>
            <span className="text-sm text-gray-500">{contact.currentDeal.probability}% probability</span>
            <span className="text-sm font-medium text-green-600">{formatCents(contact.currentDeal.valueCents)}</span>
          </div>
        </div>
      )}

      {/* Products */}
      {contact.products.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingCart size={15} className="text-gray-500" /> Products
          </h3>
          <div className="flex flex-wrap gap-2">
            {contact.products.map(p => (
              <span key={p} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                <ShoppingCart size={10} /> {p}
              </span>
            ))}
          </div>
          {contact.nextReplacementDate && (
            <p className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
              <Clock size={11} /> Reorder around {new Date(contact.nextReplacementDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Important dates */}
      {contact.importantDates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar size={15} className="text-pink-500" /> Important Dates
          </h3>
          <div className="space-y-2.5">
            {contact.importantDates.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                {d.type === 'birthday' ? (
                  <Gift size={15} className="text-pink-400 flex-shrink-0" />
                ) : (
                  <Calendar size={15} className="text-blue-400 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{d.title}</p>
                  {d.date && (
                    <p className="text-xs text-gray-400">
                      {new Date(d.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                      {d.isRecurring ? ' · recurring' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proactive suggestion */}
      {contact.nextSuggestion && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <p className="text-xs font-medium text-indigo-500 mb-1.5 flex items-center gap-1.5">
            <Sparkles size={12} /> AI Suggestion
          </p>
          <p className="text-sm text-indigo-800">{contact.nextSuggestion.title}</p>
          <a
            href="/proactive"
            className="mt-3 inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800 gap-1 transition-colors"
          >
            View in proactive queue <ChevronRight size={12} />
          </a>
        </div>
      )}

      {/* Shared interests */}
      {contact.sharedInterests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Shared Interests</h3>
          <div className="flex flex-wrap gap-2">
            {contact.sharedInterests.map(topic => (
              <span key={topic} className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 capitalize">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Health History tab ───────────────────────────────────────────────────────

function HealthHistoryTab({ contactId, token }: { contactId: string; token: string }) {
  const { data, loading, error } = useApi<{ history: HealthHistoryEntry[] }>(
    `/api/relationships/${contactId}/health-history`,
    token,
  )
  const history = data?.history ?? []

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)}</div>
  if (error) return <EmptyState icon="⚠️" title="Couldn't load health history" description="Check that the API is running." />
  if (history.length === 0) return <EmptyState icon="📊" title="No health history yet" description="Health scores are logged over time as conversations happen." />

  return (
    <div className="space-y-3">
      {history.map((entry, i) => {
        const delta = entry.previousScore !== null ? entry.healthScore - entry.previousScore : null
        const factors = entry.contributingFactors ? Object.entries(entry.contributingFactors) : []
        return (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-gray-900">{entry.healthScore}</span>
                {delta !== null && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    delta > 0 ? 'bg-green-50 text-green-700' : delta < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {delta > 0 ? '+' : ''}{delta} from {entry.previousScore}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{formatDate(entry.loggedAt)}</span>
            </div>
            <HealthBar score={entry.healthScore} size="sm" className="mb-2" />
            {entry.changeReason && (
              <p className="text-sm text-gray-500 mt-2 mb-3">{entry.changeReason}</p>
            )}
            {factors.length > 0 && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Contributing factors</p>
                {factors.map(([key, val]) => (
                  <FactorBar key={key} label={key} value={val} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Clocks tab ───────────────────────────────────────────────────────────────

function ClocksTab({ contactId, token }: { contactId: string; token: string }) {
  const { data, loading, error, refetch } = useApi<{ clocks: RelationshipClock[] }>(
    `/api/relationships/${contactId}/clocks`,
    token,
  )
  const { addToast } = useToast()
  const [updating, setUpdating] = useState<string | null>(null)
  const [thresholdEdits, setThresholdEdits] = useState<Record<string, string>>({})

  const clocks = data?.clocks ?? []

  const patchClock = async (clockId: string, payload: { isEnabled?: boolean; dormancyDaysThreshold?: number }) => {
    setUpdating(clockId)
    try {
      await apiClient(`/api/relationships/${contactId}/clocks/${clockId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      })
      refetch()
      addToast({ variant: 'success', title: 'Clock updated' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to update clock' })
    } finally {
      setUpdating(null)
    }
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}</div>
  if (error) return <EmptyState icon="⚠️" title="Couldn't load clocks" description="Check that the API is running." />
  if (clocks.length === 0) {
    return (
      <EmptyState
        icon="⏰"
        title="No clocks configured"
        description="Clocks are created automatically when conversations start."
      />
    )
  }

  return (
    <div className="space-y-3">
      {clocks.map(clock => {
        const thresholdKey = clock.id
        const thresholdVal = thresholdEdits[thresholdKey] ?? String(clock.dormancy_days_threshold ?? '')
        const isUpdating = updating === clock.id

        return (
          <div key={clock.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-indigo-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-800">{formatClockType(clock.clock_type)}</span>
              </div>
              {/* Toggle */}
              <button
                onClick={() => patchClock(clock.id, { isEnabled: !clock.is_enabled })}
                disabled={isUpdating}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-60 ${
                  clock.is_enabled ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
                aria-label={clock.is_enabled ? 'Disable clock' : 'Enable clock'}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  clock.is_enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Status chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {clock.is_enabled ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                  <Bell size={9} /> Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                  <BellOff size={9} /> Disabled
                </span>
              )}
              {clock.avg_days_between_messages !== null && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  Typical gap: {clock.avg_days_between_messages}d
                </span>
              )}
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 mb-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Last triggered</p>
                <p>{formatDate(clock.last_triggered_at)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Next trigger</p>
                <p>{formatDate(clock.next_trigger_at)}</p>
              </div>
            </div>

            {/* Dormancy threshold editor */}
            {clock.clock_type === 'dormancy_watch' && (
              <div className="pt-3 border-t border-gray-100 flex items-center gap-2">
                <label className="text-xs text-gray-500 flex-shrink-0">Dormancy threshold</label>
                <input
                  type="number"
                  min={1}
                  value={thresholdVal}
                  onChange={e => setThresholdEdits(prev => ({ ...prev, [thresholdKey]: e.target.value }))}
                  className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-400">days</span>
                <button
                  disabled={isUpdating || thresholdVal === String(clock.dormancy_days_threshold ?? '')}
                  onClick={() => {
                    const parsed = parseInt(thresholdVal, 10)
                    if (!isNaN(parsed) && parsed > 0) {
                      patchClock(clock.id, { dormancyDaysThreshold: parsed })
                    }
                  }}
                  className="ml-auto inline-flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Save
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Goals tab ────────────────────────────────────────────────────────────────

const GOAL_STATUS_ORDER: RelationshipGoal['status'][] = ['active', 'achieved', 'abandoned']
const GOAL_STATUS_STYLES: Record<RelationshipGoal['status'], { variant: 'success' | 'default' | 'error'; label: string }> = {
  active:    { variant: 'default', label: 'Active' },
  achieved:  { variant: 'success', label: 'Achieved' },
  abandoned: { variant: 'error',   label: 'Abandoned' },
}

function GoalsTab({ contactId, token }: { contactId: string; token: string }) {
  const { data, loading, error } = useApi<{ goals: RelationshipGoal[] }>(
    `/api/relationships/${contactId}/goals`,
    token,
  )
  const goals = data?.goals ?? []

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}</div>
  if (error) return <EmptyState icon="⚠️" title="Couldn't load goals" description="Check that the API is running." />
  if (goals.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="No goals set"
        description="No goals set for this relationship yet."
      />
    )
  }

  const grouped = GOAL_STATUS_ORDER.reduce<Record<RelationshipGoal['status'], RelationshipGoal[]>>(
    (acc, status) => {
      acc[status] = goals.filter(g => g.status === status)
      return acc
    },
    { active: [], achieved: [], abandoned: [] },
  )

  return (
    <div className="space-y-6">
      {GOAL_STATUS_ORDER.map(status => {
        const group = grouped[status]
        if (group.length === 0) return null
        const style = GOAL_STATUS_STYLES[status]
        return (
          <div key={status}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{style.label}</h3>
            <div className="space-y-3">
              {group.map(goal => (
                <div key={goal.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
                      {goal.description && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{goal.description}</p>
                      )}
                    </div>
                    <Badge variant={style.variant}>{style.label}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                      <Target size={9} /> {goal.goalType.replace(/_/g, ' ')}
                    </span>
                    {goal.targetDate && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        <Calendar size={9} /> Target {formatDate(goal.targetDate)}
                      </span>
                    )}
                    {goal.achievedAt && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                        <Check size={9} /> Achieved {formatDate(goal.achievedAt)}
                      </span>
                    )}
                  </div>

                  {goal.aiNextStep && (
                    <div className="mt-2 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <Sparkles size={10} /> AI Next Step
                      </p>
                      <p className="text-xs text-indigo-700 leading-relaxed">{goal.aiNextStep}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'health',   label: 'Health History' },
  { key: 'clocks',   label: 'Clocks' },
  { key: 'goals',    label: 'Goals' },
]

export default function RelationshipDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken ?? ''

  const [tab, setTab] = useState<TabKey>('overview')
  const [recalculating, setRecalculating] = useState(false)

  const {
    data,
    loading,
    error,
    refetch: refetchRelationship,
  } = useApi<{ relationship: RelationshipItem }>(`/api/relationships/${id}`, token)

  const contact = data?.relationship

  const recalculate = async () => {
    setRecalculating(true)
    try {
      await apiClient('/api/relationships/analyze-all', { method: 'POST', token })
      addToast({ variant: 'success', title: 'Recalculation queued', description: 'Health scores will update shortly' })
      setTimeout(() => refetchRelationship(), 3000)
    } catch {
      addToast({ variant: 'error', title: 'Failed to recalculate' })
    } finally {
      setRecalculating(false)
    }
  }

  // Loading state
  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  // Error / not found
  if (error || !contact) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-lg font-semibold text-gray-900 mb-1">Relationship not found</p>
        <p className="text-sm text-gray-500 mb-6">This contact may not exist or the API is unreachable.</p>
        <button
          onClick={() => router.push('/relationships')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <ArrowLeft size={15} /> Back to Relationships
        </button>
      </div>
    )
  }

  const trend = TREND[contact.healthTrend] ?? TREND.stable
  const tierLabel = TIER_LABELS[contact.importanceTier]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push('/relationships')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        <div className="flex items-start gap-3">
          <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="lg" className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 truncate">{contact.name}</h1>
            <p className="text-sm text-gray-500 capitalize mt-0.5">
              {contact.relationshipType.replace(/_/g, ' ')}
              {tierLabel ? ` · ${tierLabel}` : ''}
              {' · '}Last seen {formatLastSeen(contact.lastInteractionAt)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant={trend.variant}>{trend.label}</Badge>
              <span className="text-xs text-gray-400 font-medium">{contact.healthScore}/100 health</span>
              <Badge variant="default">{contact.customerStatus}</Badge>
            </div>
          </div>
          <button
            onClick={recalculate}
            disabled={recalculating}
            title="Recalculate health scores from message history"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {recalculating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline text-xs">Recalculate</span>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 flex gap-0 flex-shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          {tab === 'overview' && <OverviewTab contact={contact} />}
          {tab === 'health'   && <HealthHistoryTab contactId={id} token={token} />}
          {tab === 'clocks'   && <ClocksTab contactId={id} token={token} />}
          {tab === 'goals'    && <GoalsTab contactId={id} token={token} />}
        </div>
      </div>
    </div>
  )
}
