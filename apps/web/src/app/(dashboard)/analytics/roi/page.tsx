'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { AnalyticsSubNav } from '../_components/analytics-sub-nav'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoiData {
  fteEquivalent: number
  estimatedSalarySaved: number
  aiRepliesSent: number
  aiRepliesDelta: number
  hoursSaved: number
  hoursSavedDelta: number
  leadsFound: number
  leadsFoundDelta: number
  followUpsAutomated: number
  followUpsDelta: number
  tasksCompleted: number
  tasksDelta: number
  generatedAt?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function fmtK(n: number): string {
  if (n >= 1000) return `K${(n / 1000).toFixed(0)}k`
  return `K${fmtNum(n)}`
}

function deltaCopy(n: number, suffix = ''): { text: string; positive: boolean } {
  const positive = n >= 0
  return {
    text: `${positive ? '+' : ''}${fmtNum(Math.abs(Math.round(n)))}${suffix} vs last period`,
    positive,
  }
}

// ---------------------------------------------------------------------------
// FTE hero card
// ---------------------------------------------------------------------------

function FteHero({ data }: { data: RoiData }) {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm"
      style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 50%, #6366f1 100%)' }}
    >
      <div className="px-6 py-8 md:px-10 md:py-10">
        <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-4" style={{ letterSpacing: '0.12em' }}>
          FTE Equivalent this month
        </p>

        <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-10">
          {/* Big number */}
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-6xl md:text-7xl font-bold text-white leading-none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {data.fteEquivalent.toFixed(1)}
              </span>
              <span className="text-2xl font-semibold text-indigo-200">FTEs</span>
            </div>
            <p className="text-indigo-200 text-sm mt-2 max-w-sm leading-relaxed">
              Zuri performed work equivalent to{' '}
              <strong className="text-white">{data.fteEquivalent.toFixed(1)} full-time employees</strong>{' '}
              this month — based on hours saved across all automated tasks.
            </p>
          </div>

          {/* Salary saved */}
          <div
            className="flex-shrink-0 bg-white/10 border border-white/20 rounded-xl px-6 py-5 backdrop-blur-sm"
          >
            <p className="text-indigo-200 text-xs font-semibold uppercase mb-1" style={{ letterSpacing: '0.08em' }}>
              Est. salary equivalent
            </p>
            <p
              className="text-3xl font-bold text-white"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtK(data.estimatedSalarySaved)}
              <span className="text-indigo-200 text-base font-medium">/mo</span>
            </p>
            <p className="text-xs text-indigo-300 mt-1">at K150,000 / year per FTE</p>
          </div>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #a5b4fc, #818cf8, #6366f1)' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricConfig {
  label: string
  value: string
  delta: number
  deltaSuffix?: string
  invertDelta?: boolean
  dotColor: string
  dotBg: string
  description: string
}

function MetricCard({ metric }: { metric: MetricConfig }) {
  const { text, positive } = deltaCopy(metric.delta, metric.deltaSuffix ?? '')
  const isGood = metric.invertDelta ? !positive : positive

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-3">
      {/* Dot indicator */}
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${metric.dotColor}`} />
        <span className="text-xs font-semibold text-gray-500 uppercase" style={{ letterSpacing: '0.07em' }}>
          {metric.label}
        </span>
      </div>

      {/* Value */}
      <p
        className="text-3xl font-bold text-gray-900 leading-none"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {metric.value}
      </p>

      {/* Delta */}
      <p className={`text-xs font-medium ${isGood ? 'text-emerald-600' : 'text-rose-500'}`}>
        {text}
      </p>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3 mt-auto">
        {metric.description}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Calculation methodology
// ---------------------------------------------------------------------------

function CalculationNote() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">How we calculate ROI</h2>
      <p className="text-xs text-gray-500 mb-5">
        These estimates are based on reasonable industry benchmarks. Actual savings vary by business.
      </p>

      <div className="flex flex-col gap-0 divide-y divide-gray-100">
        {[
          {
            label: 'Time per AI reply',
            value: '3 min',
            detail: 'Average time a human would spend drafting, reviewing, and sending a response.',
          },
          {
            label: 'Working hours / month',
            value: '160 hrs',
            detail: 'Standard full-time equivalent: 40 hours/week × 4 weeks.',
          },
          {
            label: 'Estimated annual salary',
            value: 'K150,000',
            detail: 'Benchmark salary for a business development / customer success role.',
          },
          {
            label: 'FTE formula',
            value: 'Hours saved ÷ 160',
            detail: 'FTE equivalent = total hours saved this month divided by working hours per FTE.',
          },
          {
            label: 'Monthly salary saved',
            value: 'FTE × K12,500',
            detail: 'Monthly rate derived from K150,000 annual salary divided by 12.',
          },
        ].map(row => (
          <div key={row.label} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3.5">
            <div className="sm:w-48 flex-shrink-0 flex items-baseline gap-3">
              <span className="text-xs text-gray-500 font-medium">{row.label}</span>
              <span
                className="text-sm font-bold text-gray-900 sm:ml-auto"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {row.value}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed sm:flex-1">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function HeroSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #3730a3, #6366f1)' }}>
      <div className="px-6 py-8 md:px-10 md:py-10 flex flex-col gap-5">
        <Skeleton className="h-3 w-40 bg-indigo-400/40" />
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div>
            <Skeleton className="h-16 w-32 mb-3 bg-indigo-400/40" />
            <Skeleton className="h-4 w-64 bg-indigo-400/40" />
          </div>
          <Skeleton className="w-48 h-24 rounded-xl bg-indigo-400/40" />
        </div>
      </div>
      <div className="h-1 w-full bg-indigo-400/40" />
    </div>
  )
}

function MetricSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-2.5 h-2.5 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-36" />
      <div className="border-t border-gray-100 pt-3 mt-auto">
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3 px-4">
      <span className="text-5xl select-none" aria-hidden="true">📈</span>
      <h2 className="text-lg font-semibold text-gray-800">No ROI data yet</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        No data yet — insights appear here once conversations are analysed.
      </p>
      <Link
        href="/inbox"
        className="mt-2 inline-flex items-center justify-center h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        Go to Inbox
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function buildFallback(): RoiData {
  return {
    fteEquivalent: 0,
    estimatedSalarySaved: 0,
    aiRepliesSent: 0,
    aiRepliesDelta: 0,
    hoursSaved: 0,
    hoursSavedDelta: 0,
    leadsFound: 0,
    leadsFoundDelta: 0,
    followUpsAutomated: 0,
    followUpsDelta: 0,
    tasksCompleted: 0,
    tasksDelta: 0,
  }
}

function isEmptyData(d: RoiData): boolean {
  return d.aiRepliesSent === 0 && d.hoursSaved === 0 && d.leadsFound === 0
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoiDashboardPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<RoiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/roi', { token: token ?? undefined })
        if (!cancelled) setData((res as RoiData) ?? buildFallback())
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
  const isEmptyState = !loading && !d

  const metrics: MetricConfig[] = d
    ? [
        {
          label: 'AI Replies Sent',
          value: fmtNum(d.aiRepliesSent),
          delta: d.aiRepliesDelta,
          dotColor: 'bg-blue-500',
          dotBg: 'bg-blue-50',
          description:
            'Total messages drafted or sent by Zuri on your behalf — each one saves you time and keeps conversations moving.',
        },
        {
          label: 'Hours Saved',
          value: `${fmtNum(d.hoursSaved)}h`,
          delta: d.hoursSavedDelta,
          dotColor: 'bg-emerald-500',
          dotBg: 'bg-emerald-50',
          description:
            'Calculated at 3 minutes per AI reply. Time you can redirect toward higher-value work.',
        },
        {
          label: 'Leads Found',
          value: fmtNum(d.leadsFound),
          delta: d.leadsFoundDelta,
          dotColor: 'bg-indigo-500',
          dotBg: 'bg-indigo-50',
          description:
            'Contacts identified as potential leads by the AI based on conversation signals and intent markers.',
        },
        {
          label: 'Follow-ups Automated',
          value: fmtNum(d.followUpsAutomated),
          delta: d.followUpsDelta,
          dotColor: 'bg-amber-500',
          dotBg: 'bg-amber-50',
          description:
            'Scheduled follow-up messages sent without manual intervention — keeping relationships warm automatically.',
        },
        {
          label: 'Tasks Completed',
          value: fmtNum(d.tasksCompleted),
          delta: d.tasksDelta,
          dotColor: 'bg-teal-500',
          dotBg: 'bg-teal-50',
          description:
            'Actions resolved by Zuri across all automation rules — reminders, scheduling prompts, and status updates.',
        },
      ]
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">ROI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Zuri&apos;s measurable impact on your business
          </p>
        </div>

        {/* ── Empty state ─────────────────────────────────────────── */}
        {isEmptyState && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <EmptyState />
          </div>
        )}

        {/* ── FTE hero card ────────────────────────────────────────── */}
        {loading ? (
          <HeroSkeleton />
        ) : !isEmptyState && d ? (
          <FteHero data={d} />
        ) : null}

        {/* ── Metrics grid ─────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4].map(i => <MetricSkeleton key={i} />)}
          </div>
        ) : !isEmptyState && d ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map(metric => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        ) : null}

        {/* ── How we calculate ROI ─────────────────────────────────── */}
        {!isEmptyState && <CalculationNote />}

        {/* ── Footer timestamp ─────────────────────────────────────── */}
        {!loading && d?.generatedAt && !isEmptyState && (
          <p className="text-xs text-gray-400 text-center pb-2">
            Last updated{' '}
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
