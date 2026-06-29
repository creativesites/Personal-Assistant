'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ---------------------------------------------------------------------------
// Sub-nav
// ---------------------------------------------------------------------------

const SUB_NAV = [
  { href: '/analytics', label: 'Executive' },
  { href: '/analytics/sales', label: 'Sales' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/conversations', label: 'Conversations' },
  { href: '/analytics/operations', label: 'Operations' },
  { href: '/analytics/opportunities', label: 'Opportunities' },
  { href: '/analytics/predictions', label: 'Predictions' },
  { href: '/analytics/health', label: 'Health Score' },
  { href: '/analytics/roi', label: 'ROI' },
  { href: '/analytics/timeline', label: 'Timeline' },
  { href: '/analytics/reports', label: 'Reports' },
]

function AnalyticsSubNav() {
  const pathname = usePathname()
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white">
      <div className="flex min-w-max px-4 md:px-6">
        {SUB_NAV.map(item => {
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
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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

interface KpiData {
  totalConversations30d: number
  totalConversationsTrend: number
  aiMessagesSent: number
  aiAutomationRate: number
  activeContacts: number
  atRiskContacts: number
  avgResponseTimeMinutes: number
  avgResponseTimeTrend: number
}

interface HealthComponent {
  label: string
  score: number
}

interface HealthData {
  score: number
  trend: number
  components: HealthComponent[]
}

interface Opportunity {
  id: string
  contactName: string
  reason: string
  estimatedValue: string
  urgency: 'high' | 'medium' | 'low'
}

interface Alert {
  id: string
  severity: 'high' | 'medium' | 'low'
  message: string
  timestamp: string
}

interface ExecutiveData {
  kpis: KpiData
  health: HealthData
  opportunities: Opportunity[]
  alerts: Alert[]
  aiRepliesSent: number
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers: skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function KpiSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health ring (SVG — no external deps)
// ---------------------------------------------------------------------------

function gradeFromScore(score: number): { letter: string; color: string; textColor: string; bg: string; border: string } {
  if (score >= 90) return { letter: 'A', color: '#10b981', textColor: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (score >= 80) return { letter: 'B', color: '#6366f1', textColor: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' }
  if (score >= 70) return { letter: 'C', color: '#f59e0b', textColor: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
  if (score >= 60) return { letter: 'D', color: '#f97316', textColor: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' }
  return { letter: 'F', color: '#ef4444', textColor: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' }
}

function HealthRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const { color } = gradeFromScore(score)

  return (
    <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true" role="img">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text
        x="64" y="58"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="28"
        fontWeight="700"
        fill="#111827"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        {score}
      </text>
      <text
        x="64" y="79"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fill="#9ca3af"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        out of 100
      </text>
    </svg>
  )
}

function GradePill({ score }: { score: number }) {
  const { letter, textColor, bg, border } = gradeFromScore(score)
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${bg} ${textColor} ${border}`}
      aria-label={`Grade ${letter}`}
    >
      {letter}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

function TrendBadge({ value, unit = '%', invertColor = false }: { value: number; unit?: string; invertColor?: boolean }) {
  const isGood = invertColor ? value <= 0 : value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
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
  trendUnit = '%',
  invertTrendColor = false,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: number
  trendUnit?: string
  invertTrendColor?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <p
        className="text-xs font-semibold text-gray-500 uppercase mb-2"
        style={{ letterSpacing: '0.07em' }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-bold text-gray-900 mb-1.5"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {trend !== undefined && (
          <TrendBadge value={trend} unit={trendUnit} invertColor={invertTrendColor} />
        )}
        {sub && <span className="text-xs text-gray-500">{sub}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component progress bar (health breakdown)
// ---------------------------------------------------------------------------

function ComponentBar({ label, score }: { label: string; score: number }) {
  const barColor =
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span
          className="text-xs font-semibold text-gray-800"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {score}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${score}%`, transition: 'width 0.6s ease' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Urgency chip
// ---------------------------------------------------------------------------

function UrgencyChip({ urgency }: { urgency: 'high' | 'medium' | 'low' }) {
  const styles = {
    high:   'bg-rose-50 text-rose-700 border-rose-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low:    'bg-blue-50 text-blue-700 border-blue-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[urgency]}`}>
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Alert item — left border severity stripe
// ---------------------------------------------------------------------------

function AlertItem({ alert }: { alert: Alert }) {
  const styles = {
    high:   { wrap: 'border-l-rose-500 bg-rose-50',   label: 'Critical', labelColor: 'text-rose-600',  text: 'text-rose-900' },
    medium: { wrap: 'border-l-amber-500 bg-amber-50', label: 'Warning',  labelColor: 'text-amber-600', text: 'text-amber-900' },
    low:    { wrap: 'border-l-blue-500 bg-blue-50',   label: 'Info',     labelColor: 'text-blue-600',  text: 'text-blue-900' },
  }
  const s = styles[alert.severity]
  return (
    <div className={`border-l-4 rounded-r-lg px-4 py-3 ${s.wrap}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-xs font-semibold uppercase tracking-wide ${s.labelColor}`} style={{ letterSpacing: '0.06em' }}>
          {s.label}
        </span>
        <span className="text-xs text-gray-400">{alert.timestamp}</span>
      </div>
      <p className={`text-sm ${s.text}`}>{alert.message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state — first-time user
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3 px-4">
      <span className="text-5xl select-none" aria-hidden="true">📊</span>
      <h2 className="text-lg font-semibold text-gray-800">No data yet</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Connect WhatsApp and start conversations — your executive dashboard
        populates automatically within 24 hours.
      </p>
      <Link
        href="/settings"
        className="mt-2 inline-flex items-center justify-center h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        Connect WhatsApp
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Build safe mock/empty data so rendering never crashes
// ---------------------------------------------------------------------------

function emptyData(): ExecutiveData {
  return {
    kpis: {
      totalConversations30d: 0,
      totalConversationsTrend: 0,
      aiMessagesSent: 0,
      aiAutomationRate: 0,
      activeContacts: 0,
      atRiskContacts: 0,
      avgResponseTimeMinutes: 0,
      avgResponseTimeTrend: 0,
    },
    health: { score: 0, trend: 0, components: [] },
    opportunities: [],
    alerts: [],
    aiRepliesSent: 0,
    generatedAt: new Date().toISOString(),
  }
}

function isDataEmpty(d: ExecutiveData): boolean {
  return (
    d.kpis.totalConversations30d === 0 &&
    d.kpis.activeContacts === 0 &&
    d.kpis.aiMessagesSent === 0
  )
}

// ---------------------------------------------------------------------------
// Page
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
        if (!cancelled) setData((res as ExecutiveData) ?? emptyData())
      } catch {
        if (!cancelled) setData(emptyData())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const d = data
  const isEmpty = !loading && (!d || isDataEmpty(d))

  return (
    <div className="flex flex-col min-h-0">
      <AnalyticsSubNav />

      <div className="flex-1 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

          {/* ── Page header ─────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Executive Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
            </div>

            {/* Health score badge in header — only when loaded and not empty */}
            {!loading && d && !isEmpty && (
              <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm self-start sm:self-auto">
                <GradePill score={d.health.score} />
                <div>
                  <p className="text-xs text-gray-500 leading-none mb-0.5">Business Health</p>
                  <p className="text-base font-bold text-gray-900 leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.health.score}
                    <span className="text-gray-400 font-normal text-sm">/100</span>
                    {d.health.trend !== 0 && (
                      <span className="ml-2 align-middle">
                        <TrendBadge value={d.health.trend} unit=" pts" />
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {loading && <Skeleton className="h-14 w-44" />}
          </div>

          {/* ── Empty state ─────────────────────────────────────────── */}
          {isEmpty && <EmptyState />}

          {/* ── KPI grid ────────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)}
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Total Conversations (30d)"
                value={d.kpis.totalConversations30d.toLocaleString()}
                trend={d.kpis.totalConversationsTrend}
                trendUnit="%"
                sub="vs prior 30 days"
              />
              <KpiCard
                label="Messages Sent by AI"
                value={d.kpis.aiMessagesSent.toLocaleString()}
                sub={`${d.kpis.aiAutomationRate}% automation rate`}
              />
              <KpiCard
                label="Active Contacts"
                value={d.kpis.activeContacts.toLocaleString()}
                sub={d.kpis.atRiskContacts > 0 ? `${d.kpis.atRiskContacts} at risk` : 'None at risk'}
              />
              <KpiCard
                label="Avg Response Time"
                value={`${d.kpis.avgResponseTimeMinutes}m`}
                trend={d.kpis.avgResponseTimeTrend}
                trendUnit="%"
                invertTrendColor
                sub="last 30 days"
              />
            </div>
          ) : null}

          {/* ── Health score + AI automation (2-col on lg) ──────────── */}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <Skeleton className="h-3.5 w-40 mb-6" />
                <div className="flex items-start gap-6">
                  <Skeleton className="h-32 w-32 rounded-full flex-shrink-0" />
                  <div className="flex-1 flex flex-col gap-3 pt-2">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-full" />)}
                  </div>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <Skeleton className="h-3.5 w-36 mb-6" />
                <Skeleton className="h-14 w-28 mb-3" />
                <Skeleton className="h-2 w-full mb-5" />
                <Skeleton className="h-3 w-48 mb-1" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Health score card */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2
                    className="text-xs font-semibold text-gray-500 uppercase"
                    style={{ letterSpacing: '0.07em' }}
                  >
                    Business Health Score
                  </h2>
                  <GradePill score={d.health.score} />
                </div>

                <div className="flex items-start gap-6 flex-wrap">
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <HealthRing score={d.health.score} />
                    {d.health.trend !== 0 && (
                      <div className="mt-1.5">
                        <TrendBadge value={d.health.trend} unit=" pts this week" />
                      </div>
                    )}
                  </div>

                  {d.health.components.length > 0 && (
                    <div className="flex-1 min-w-0 flex flex-col gap-3 justify-center">
                      {d.health.components.map(c => (
                        <ComponentBar key={c.label} label={c.label} score={c.score} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* AI automation panel */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h2
                  className="text-xs font-semibold text-gray-500 uppercase mb-5"
                  style={{ letterSpacing: '0.07em' }}
                >
                  AI Automation
                </h2>

                <div className="flex items-end gap-1 mb-1.5">
                  <span
                    className="text-5xl font-bold text-gray-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {d.kpis.aiAutomationRate}
                  </span>
                  <span className="text-2xl font-semibold text-gray-400 mb-1">%</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  of replies handled autonomously by Zuri in the last 30 days.
                </p>

                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${d.kpis.aiAutomationRate}%`, transition: 'width 0.6s ease' }}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                  <div>
                    <p
                      className="text-xl font-bold text-gray-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {(d.aiRepliesSent ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">AI replies sent</p>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-xl font-bold text-gray-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {d.kpis.aiMessagesSent.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">total AI messages</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Top Opportunities ────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <Skeleton className="h-3.5 w-36 mb-5" />
              <div className="flex flex-col divide-y divide-gray-100">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-4 py-4">
                    <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-28 mb-2" />
                      <Skeleton className="h-3 w-52" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : !isEmpty && d && d.opportunities.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-xs font-semibold text-gray-500 uppercase"
                  style={{ letterSpacing: '0.07em' }}
                >
                  Top Opportunities
                </h2>
                <Link
                  href="/analytics/opportunities"
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View all →
                </Link>
              </div>

              <div className="flex flex-col divide-y divide-gray-100">
                {d.opportunities.slice(0, 5).map(opp => {
                  const initials = opp.contactName
                    .split(' ')
                    .slice(0, 2)
                    .map(n => n[0] ?? '')
                    .join('')
                    .toUpperCase()
                  return (
                    <div key={opp.id} className="flex items-start gap-4 py-3.5">
                      <div
                        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold select-none"
                        aria-hidden="true"
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">
                            {opp.contactName}
                          </span>
                          <UrgencyChip urgency={opp.urgency} />
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 truncate">{opp.reason}</p>
                      </div>
                      {opp.estimatedValue && (
                        <span
                          className="flex-shrink-0 text-sm font-semibold text-gray-800"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {opp.estimatedValue}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* ── Alerts ──────────────────────────────────────────────── */}
          {!loading && !isEmpty && d && d.alerts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2
                className="text-xs font-semibold text-gray-500 uppercase mb-4"
                style={{ letterSpacing: '0.07em' }}
              >
                Alerts
              </h2>
              <div className="flex flex-col gap-2.5">
                {d.alerts.map(alert => (
                  <AlertItem key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {/* ── Footer timestamp ─────────────────────────────────────── */}
          {!loading && d?.generatedAt && !isEmpty && (
            <p className="text-xs text-gray-400 text-center pb-2">
              Last updated{' '}
              {new Date(d.generatedAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}

        </div>
      </div>
    </div>
  )
}
