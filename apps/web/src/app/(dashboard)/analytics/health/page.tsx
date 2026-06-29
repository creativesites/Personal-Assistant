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
          const active = item.href === '/analytics' ? pathname === '/analytics' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
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

interface HealthComponent {
  name: string
  weight: number
  score: number
  detail?: string
}

interface HealthData {
  score: number
  grade: string
  trend: 'improving' | 'stable' | 'declining'
  trendPoints: number
  components: HealthComponent[]
  generatedAt?: string
}

// ---------------------------------------------------------------------------
// Grade helpers
// ---------------------------------------------------------------------------

function gradeInfo(score: number): {
  letter: string
  ringColor: string
  badgeClasses: string
  borderColor: string
  bgColor: string
  textColor: string
  meaning: string
} {
  if (score >= 90)
    return {
      letter: 'A',
      ringColor: '#10b981',
      badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      borderColor: 'border-l-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-800',
      meaning: 'Your business is performing excellently. Keep it up!',
    }
  if (score >= 80)
    return {
      letter: 'B',
      ringColor: '#6366f1',
      badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      borderColor: 'border-l-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-800',
      meaning: 'Good performance with room for improvement.',
    }
  if (score >= 70)
    return {
      letter: 'C',
      ringColor: '#f59e0b',
      badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
      borderColor: 'border-l-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-800',
      meaning: 'Several areas need attention.',
    }
  if (score >= 60)
    return {
      letter: 'D',
      ringColor: '#f97316',
      badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200',
      borderColor: 'border-l-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-800',
      meaning: 'Urgent action needed to improve customer engagement.',
    }
  return {
    letter: 'F',
    ringColor: '#ef4444',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
    borderColor: 'border-l-rose-500',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-800',
    meaning: 'Urgent action needed to improve customer engagement.',
  }
}

function statusForScore(score: number): { label: string; classes: string } {
  if (score >= 85) return { label: 'Excellent', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
  if (score >= 70) return { label: 'Good', classes: 'bg-blue-50 text-blue-700 border border-blue-200' }
  if (score >= 50) return { label: 'Fair', classes: 'bg-amber-50 text-amber-700 border border-amber-200' }
  return { label: 'Poor', classes: 'bg-rose-50 text-rose-700 border border-rose-200' }
}

function componentBarColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 70) return 'bg-indigo-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-rose-500'
}

// ---------------------------------------------------------------------------
// Score ring (SVG)
// ---------------------------------------------------------------------------

function ScoreRing({ score, ringColor }: { score: number; ringColor: string }) {
  const r = 72
  // Start at 240deg (lower-left), sweep 300deg clockwise (60deg gap at bottom)
  const sweepDeg = 300

  // Arc helper
  const cx = 88
  const cy = 88
  // SVG: 0deg = right, positive = clockwise
  // Start arc at lower-left (240deg) and sweep 300deg clockwise
  const startDeg = 240
  const toRad = (deg: number) => (deg * Math.PI) / 180

  function arcPoint(angleDeg: number, radius: number) {
    return {
      x: cx + radius * Math.cos(toRad(angleDeg)),
      y: cy + radius * Math.sin(toRad(angleDeg)),
    }
  }

  // filled arc: from start, sweepDeg * fill ratio
  const filledDeg = (score / 100) * sweepDeg

  function describeArc(startAngle: number, endAngle: number, radius: number, largeArc: boolean) {
    const s = arcPoint(startAngle, radius)
    const e = arcPoint(endAngle, radius)
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc ? 1 : 0} 1 ${e.x} ${e.y}`
  }

  const trackPath = describeArc(startDeg, startDeg + sweepDeg, r, true)
  const filledPath = filledDeg > 0
    ? describeArc(startDeg, startDeg + filledDeg, r, filledDeg > 180)
    : null

  return (
    <svg width="176" height="176" viewBox="0 0 176 176" aria-label={`Health score ${score} out of 100`} role="img">
      {/* Track */}
      <path
        d={trackPath}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {filledPath && (
        <path
          d={filledPath}
          fill="none"
          stroke={ringColor}
          strokeWidth="12"
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease, d 0.8s ease' }}
        />
      )}
      {/* Score number */}
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="38"
        fontWeight="700"
        fill="#111827"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="12"
        fill="#9ca3af"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        out of 100
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Trend badge
// ---------------------------------------------------------------------------

function TrendBadge({ trend, points }: { trend: 'improving' | 'stable' | 'declining'; points: number }) {
  if (trend === 'improving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        +{points} pts
      </span>
    )
  }
  if (trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-1">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {points} pts
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
      <span aria-hidden="true">—</span>
      Stable
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component row card
// ---------------------------------------------------------------------------

function ComponentRow({ component }: { component: HealthComponent }) {
  const status = statusForScore(component.score)
  const barColor = componentBarColor(component.score)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 shadow-sm">
      {/* Top row: name + weight + score + badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{component.name}</span>
            <span className="text-xs text-gray-400 font-medium">· {component.weight}% weight</span>
          </div>
          {component.detail && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{component.detail}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-lg font-bold text-gray-900"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {component.score}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.classes}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${component.score}%`, transition: 'width 0.7s ease' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function HeroSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-8">
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <Skeleton className="w-44 h-44 rounded-full" />
        <Skeleton className="w-16 h-7 rounded-full" />
        <Skeleton className="w-20 h-5 rounded-full" />
      </div>
      <div className="flex-1 w-full">
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}

function ComponentsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <Skeleton className="h-4 w-36 mb-1.5" />
              <Skeleton className="h-3 w-52" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-8" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3 px-4">
      <span className="text-5xl select-none" aria-hidden="true">🏥</span>
      <h2 className="text-lg font-semibold text-gray-800">No health data yet</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Connect WhatsApp and start conversations — your business health score
        is calculated automatically from conversation activity.
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
// Fallback data
// ---------------------------------------------------------------------------

function buildFallback(): HealthData {
  return {
    score: 0,
    grade: 'N/A',
    trend: 'stable',
    trendPoints: 0,
    components: [],
  }
}

function isEmpty(d: HealthData): boolean {
  return d.score === 0 && d.components.length === 0
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BusinessHealthScorePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/health', { token: token ?? undefined })
        if (!cancelled) setData((res as HealthData) ?? buildFallback())
      } catch {
        if (!cancelled) setData(buildFallback())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const d = data
  const isEmptyState = !loading && (!d || isEmpty(d))

  // Derive grade info from score
  const grade = d ? gradeInfo(d.score) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Business Health Score</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              A composite measure of your relationship engagement quality
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 self-start sm:self-auto whitespace-nowrap">
            Updated daily
          </span>
        </div>

        {/* ── Empty state ─────────────────────────────────────────── */}
        {isEmptyState && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <EmptyState />
          </div>
        )}

        {/* ── Hero section ────────────────────────────────────────── */}
        {loading ? (
          <HeroSkeleton />
        ) : !isEmptyState && d && grade ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row">
              {/* Left: ring + grade */}
              <div className="flex flex-col items-center justify-center gap-4 p-8 md:w-64 md:border-r md:border-gray-100 border-b md:border-b-0 bg-gray-50/60">
                <ScoreRing score={d.score} ringColor={grade.ringColor} />

                {/* Grade letter */}
                <div className="flex flex-col items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-xl font-bold border-2 ${grade.badgeClasses}`}
                    aria-label={`Grade ${grade.letter}`}
                  >
                    {grade.letter}
                  </span>
                  <TrendBadge trend={d.trend} points={Math.abs(d.trendPoints)} />
                </div>
              </div>

              {/* Right: meaning + summary */}
              <div className="flex-1 p-6 md:p-8">
                <h2 className="text-base font-semibold text-gray-900 mb-1">What this means</h2>
                <div className={`border-l-4 rounded-r-lg pl-4 pr-3 py-3 mb-6 ${grade.borderColor} ${grade.bgColor}`}>
                  <p className={`text-sm font-medium ${grade.textColor}`}>{grade.meaning}</p>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p
                      className="text-2xl font-bold text-gray-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {d.score}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Overall score</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{grade.letter}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Grade</p>
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${
                        d.trend === 'improving' ? 'text-emerald-600' :
                        d.trend === 'declining' ? 'text-rose-600' :
                        'text-gray-900'
                      }`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {d.trend === 'improving' ? '+' : d.trend === 'declining' ? '-' : ''}
                      {Math.abs(d.trendPoints)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">pts this week</p>
                  </div>
                </div>

                {/* Trend descriptor */}
                <p className="text-xs text-gray-400 mt-5 leading-relaxed">
                  {d.trend === 'improving' && 'Your score has been climbing. Keep up the consistent engagement.'}
                  {d.trend === 'stable' && 'Your score has held steady over the past 7 days.'}
                  {d.trend === 'declining' && 'Your score has dropped recently. Focus on the components marked Poor or Fair below.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Components breakdown ─────────────────────────────────── */}
        {loading ? (
          <>
            <div>
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-3 w-72 bg-gray-200 rounded animate-pulse mb-4" />
            </div>
            <ComponentsSkeleton />
          </>
        ) : !isEmptyState && d && d.components.length > 0 ? (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Score breakdown</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Each component is weighted by its contribution to the overall score
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {d.components.map((comp) => (
                <ComponentRow key={comp.name} component={comp} />
              ))}
            </div>
          </>
        ) : null}

        {/* ── How this score is calculated ─────────────────────────── */}
        {!loading && !isEmptyState && d && d.components.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">How this score is calculated</h2>
            <p className="text-xs text-gray-500 mb-4">
              Each component is scored 0–100 and multiplied by its weight. Scores are updated once daily using the
              last 30 days of conversation data.
            </p>
            <div className="overflow-x-auto">
              <table
                className="w-full text-xs"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 uppercase tracking-wide" style={{ letterSpacing: '0.06em' }}>
                      Component
                    </th>
                    <th className="text-right py-2 pr-4 font-semibold text-gray-500 uppercase tracking-wide w-16" style={{ letterSpacing: '0.06em' }}>
                      Weight
                    </th>
                    <th className="text-right py-2 font-semibold text-gray-500 uppercase tracking-wide w-16" style={{ letterSpacing: '0.06em' }}>
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.components.map(comp => {
                    const status = statusForScore(comp.score)
                    return (
                      <tr key={comp.name} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 pr-4 text-gray-700 font-medium">{comp.name}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-500">{comp.weight}%</td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.classes}`}>
                            {comp.score} · {status.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="pt-3 pr-4 font-semibold text-gray-900 text-sm">Overall</td>
                    <td className="pt-3 pr-4 text-right text-gray-500 text-sm">
                      {d.components.reduce((sum, c) => sum + c.weight, 0)}%
                    </td>
                    <td className="pt-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${grade?.badgeClasses ?? ''}`}>
                        {d.score} · {grade?.letter}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Footer timestamp ─────────────────────────────────────── */}
        {!loading && d?.generatedAt && !isEmptyState && (
          <p className="text-xs text-gray-400 text-center pb-2">
            Last calculated{' '}
            {new Date(d.generatedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  )
}
