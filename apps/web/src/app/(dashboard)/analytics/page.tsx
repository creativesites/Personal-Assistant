'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ---------------------------------------------------------------------------
// Sub-nav (scrollable on mobile)
// ---------------------------------------------------------------------------

const SUB_NAV = [
  { href: '/analytics', label: 'Overview' },
  { href: '/analytics/sales', label: 'Sales' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/conversations', label: 'Chats' },
  { href: '/analytics/operations', label: 'Operations' },
  { href: '/analytics/opportunities', label: 'Opportunities' },
  { href: '/analytics/predictions', label: 'Predictions' },
  { href: '/analytics/health', label: 'Health' },
  { href: '/analytics/roi', label: 'ROI' },
  { href: '/analytics/campaigns', label: 'Campaigns' },
  { href: '/analytics/reports', label: 'Reports' },
]

function AnalyticsSubNav() {
  const pathname = usePathname()
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="flex min-w-max px-4">
        {SUB_NAV.map((item) => {
          const active =
            item.href === '/analytics'
              ? pathname === '/analytics'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecutiveData {
  kpis: {
    totalConversations30d: number
    totalConversationsTrend: number
    aiMessagesSent: number
    aiAutomationRate: number
    activeContacts: number
    atRiskContacts: number
    avgResponseTimeMinutes: number
    avgResponseTimeTrend: number
  }
  health: { score: number; trend: number; components: { label: string; score: number }[] }
  opportunities: { id: string; contactName: string; reason: string; estimatedValue: string; urgency: 'high' | 'medium' | 'low' }[]
  alerts: { id: string; severity: 'high' | 'medium' | 'low'; message: string; timestamp: string }[]
  aiRepliesSent: number
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function KpiSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health ring (SVG)
// ---------------------------------------------------------------------------

function HealthRing({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const dims = size === 'sm' ? 80 : 128
  const r = size === 'sm' ? 32 : 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  const fontSize = size === 'sm' ? 22 : 28
  const subFontSize = size === 'sm' ? 9 : 11

  return (
    <svg width={dims} height={dims} viewBox={`0 0 ${dims} ${dims}`} aria-hidden="true">
      <circle cx={dims / 2} cy={dims / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
      <circle
        cx={dims / 2}
        cy={dims / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform={`rotate(-90 ${dims / 2} ${dims / 2})`}
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text
        x={dims / 2}
        y={dims / 2 - 3}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill="#111827"
        fontFamily="system-ui, sans-serif"
      >
        {score}
      </text>
      <text
        x={dims / 2}
        y={dims / 2 + (size === 'sm' ? 16 : 20)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={subFontSize}
        fill="#9ca3af"
        fontFamily="system-ui, sans-serif"
      >
        /100
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Trend badge
// ---------------------------------------------------------------------------

function TrendBadge({ value, unit = '%' }: { value: number; unit?: string }) {
  const isGood = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}
    >
      <span aria-hidden="true">{value >= 0 ? '↑' : '↓'}</span>
      {Math.abs(value)}{unit}
    </span>
  )
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: number
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {trend !== undefined && <TrendBadge value={trend} />}
        {sub && <span className="text-xs text-gray-500">{sub}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3 px-4">
      <span className="text-4xl" aria-hidden="true">📊</span>
      <h2 className="text-lg font-semibold text-gray-800">No data yet</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Connect WhatsApp and start chatting — your dashboard will fill up within a day.
      </p>
      <Link
        href="/onboarding"
        className="mt-2 inline-flex items-center justify-center h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        Connect WhatsApp
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnalyticsExecutivePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<ExecutiveData | null>(null)
  const [loading, setLoading] = useState(true)

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/executive', { token: token ?? undefined })
        if (!cancelled) setData((res as ExecutiveData) ?? null)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const d = data
  const isEmpty = !loading && (!d || (d.kpis.totalConversations30d === 0 && d.kpis.activeContacts === 0))

  return (
    <div className="flex flex-col min-h-0">
      <AnalyticsSubNav />

      <div className="flex-1 bg-gray-50 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-5">

          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">How your business is doing</h1>
              <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
            </div>

            {!loading && d && !isEmpty && (
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm self-start sm:self-auto">
                <HealthRing score={d.health.score} size="sm" />
                <div>
                  <p className="text-xs text-gray-500">Business Health</p>
                  <p className="text-lg font-bold text-gray-900">
                    {d.health.score}
                    <span className="text-gray-400 font-normal text-sm">/100</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Empty ───────────────────────────────────────────────── */}
          {isEmpty && <EmptyState />}

          {/* ── KPI grid ────────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <KpiSkeleton key={i} />
              ))}
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Conversations" value={d.kpis.totalConversations30d.toLocaleString()} trend={d.kpis.totalConversationsTrend} sub="last 30 days" />
              <KpiCard label="AI replies sent" value={d.kpis.aiMessagesSent.toLocaleString()} sub={`${d.kpis.aiAutomationRate}% automatic`} />
              <KpiCard label="Active contacts" value={d.kpis.activeContacts.toLocaleString()} sub={d.kpis.atRiskContacts > 0 ? `${d.kpis.atRiskContacts} need attention` : 'All good'} />
              <KpiCard label="Avg reply time" value={`${d.kpis.avgResponseTimeMinutes}m`} trend={d.kpis.avgResponseTimeTrend} sub="last 30 days" />
            </div>
          ) : null}

          {/* ── Health + AI automation ──────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Health card */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Business Health</h2>
                <div className="flex items-start gap-5 flex-wrap">
                  <HealthRing score={d.health.score} />
                  <div className="flex-1 min-w-0 space-y-3">
                    {d.health.components.map((c) => (
                      <div key={c.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600">{c.label}</span>
                          <span className="text-xs font-semibold text-gray-800">{c.score}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.score >= 80 ? 'bg-emerald-500' : c.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${c.score}%`, transition: 'width 0.6s ease' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI automation card */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">AI at work</h2>
                <p className="text-4xl font-bold text-gray-900 mb-1">{d.kpis.aiAutomationRate}%</p>
                <p className="text-sm text-gray-500 mb-4">of replies handled by Zuri automatically</p>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${d.kpis.aiAutomationRate}%` }} />
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{(d.aiRepliesSent ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">AI replies sent</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">{d.kpis.aiMessagesSent.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">total messages</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Opportunities ───────────────────────────────────────── */}
          {!isEmpty && d && d.opportunities.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opportunities</h2>
                <Link href="/analytics/opportunities" className="text-xs text-indigo-600 font-medium">View all →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {d.opportunities.slice(0, 5).map((opp) => (
                  <div key={opp.id} className="flex items-start gap-3 py-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {opp.contactName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{opp.contactName}</p>
                      <p className="text-xs text-gray-500 truncate">{opp.reason}</p>
                    </div>
                    {opp.estimatedValue && (
                      <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{opp.estimatedValue}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Alerts ──────────────────────────────────────────────── */}
          {!isEmpty && d && d.alerts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Alerts</h2>
              <div className="space-y-2">
                {d.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`border-l-4 rounded-r-lg px-4 py-3 ${
                      alert.severity === 'high'
                        ? 'border-l-rose-500 bg-rose-50'
                        : alert.severity === 'medium'
                        ? 'border-l-amber-500 bg-amber-50'
                        : 'border-l-blue-500 bg-blue-50'
                    }`}
                  >
                    <p className="text-sm text-gray-800">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{alert.timestamp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Timestamp ───────────────────────────────────────────── */}
          {!loading && d?.generatedAt && !isEmpty && (
            <p className="text-xs text-gray-400 text-center">
              Last updated {new Date(d.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

        </div>
      </div>
    </div>
  )
                    }
