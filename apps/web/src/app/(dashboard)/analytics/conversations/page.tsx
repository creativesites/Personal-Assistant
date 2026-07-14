'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { AnalyticsSubNav } from '../_components/analytics-sub-nav'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SentimentBreakdown {
  positive: number
  neutral: number
  negative: number
  mixed: number
}

interface UrgencyBreakdown {
  urgent: number
  high: number
  medium: number
  low: number
}

interface DayVolume {
  date: string   // ISO date string e.g. "2026-06-15"
  count: number
}

interface TopTopic {
  topic: string
  count: number
}

interface ConversationData {
  totalConversations: number
  todayConversations: number
  thisWeekConversations: number
  avgPerDay: number
  sentiment: SentimentBreakdown
  urgency: UrgencyBreakdown
  aiAssistanceRate: number        // 0–100 percent
  requiresResponseCount: number
  avgImportanceScore: number      // 0–10
  topTopics: TopTopic[]
  dailyVolume: DayVolume[]        // 14 days
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function sectionLabel(text: string) {
  return (
    <h2
      className="text-xs font-semibold text-gray-500 uppercase mb-4"
      style={{ letterSpacing: '0.07em' }}
    >
      {text}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// Volume KPI card
// ---------------------------------------------------------------------------

function VolumeCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <p
        className="text-xs font-semibold text-gray-500 uppercase mb-2"
        style={{ letterSpacing: '0.07em' }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-bold text-gray-900 mb-1"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sentiment section
// ---------------------------------------------------------------------------

const SENTIMENT_CONFIG = {
  positive: {
    label: 'Positive',
    bg: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    trackBg: 'bg-emerald-100',
  },
  neutral: {
    label: 'Neutral',
    bg: 'bg-gray-400',
    badgeBg: 'bg-gray-50',
    badgeText: 'text-gray-600',
    badgeBorder: 'border-gray-200',
    trackBg: 'bg-gray-100',
  },
  negative: {
    label: 'Negative',
    bg: 'bg-rose-500',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    trackBg: 'bg-rose-100',
  },
  mixed: {
    label: 'Mixed',
    bg: 'bg-amber-400',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    trackBg: 'bg-amber-100',
  },
} as const

type SentimentKey = keyof typeof SENTIMENT_CONFIG

function SentimentRow({
  sentiment,
  count,
  pct,
}: {
  sentiment: SentimentKey
  count: number
  pct: number
}) {
  const cfg = SENTIMENT_CONFIG[sentiment]
  return (
    <div className="flex items-center gap-3">
      {/* Badge */}
      <span
        className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder} w-20 justify-center`}
      >
        {cfg.label}
      </span>

      {/* Fill bar */}
      <div className={`flex-1 h-2 rounded-full overflow-hidden ${cfg.trackBg}`}>
        <div
          className={`h-full rounded-full ${cfg.bg}`}
          style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 w-20 justify-end flex-shrink-0">
        <span
          className="text-sm font-semibold text-gray-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {count.toLocaleString()}
        </span>
        <span
          className="text-xs text-gray-400 w-9 text-right"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Urgency section
// ---------------------------------------------------------------------------

const URGENCY_CONFIG = {
  urgent: {
    label: 'Urgent',
    bar: 'bg-rose-500',
    track: 'bg-rose-100',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
  },
  high: {
    label: 'High',
    bar: 'bg-orange-400',
    track: 'bg-orange-100',
    dot: 'bg-orange-400',
    text: 'text-orange-700',
  },
  medium: {
    label: 'Medium',
    bar: 'bg-amber-400',
    track: 'bg-amber-100',
    dot: 'bg-amber-400',
    text: 'text-amber-700',
  },
  low: {
    label: 'Low',
    bar: 'bg-blue-400',
    track: 'bg-blue-100',
    dot: 'bg-blue-400',
    text: 'text-blue-700',
  },
} as const

type UrgencyKey = keyof typeof URGENCY_CONFIG

function UrgencyRow({
  urgency,
  count,
  pct,
}: {
  urgency: UrgencyKey
  count: number
  pct: number
}) {
  const cfg = URGENCY_CONFIG[urgency]
  return (
    <div className="flex items-center gap-3">
      {/* Label with dot */}
      <div className="flex items-center gap-1.5 w-16 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>

      {/* Fill bar */}
      <div className={`flex-1 h-3 rounded-full overflow-hidden ${cfg.track}`}>
        <div
          className={`h-full rounded-full ${cfg.bar}`}
          style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
        />
      </div>

      {/* Count + pct */}
      <div className="flex items-center gap-2 w-20 justify-end flex-shrink-0">
        <span
          className="text-sm font-semibold text-gray-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {count.toLocaleString()}
        </span>
        <span
          className="text-xs text-gray-400 w-9 text-right"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Importance ring (SVG arc)
// ---------------------------------------------------------------------------

function ImportanceRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const pct = Math.min(score / 10, 1)
  const filled = pct * circ
  const color = score >= 7 ? '#10b981' : score >= 4 ? '#f59e0b' : '#ef4444'

  return (
    <svg width="90" height="90" viewBox="0 0 90 90" aria-label={`Importance score ${score} out of 10`}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text
        x="45" y="42"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fill="#111827"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        {score.toFixed(1)}
      </text>
      <text
        x="45" y="58"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9"
        fill="#9ca3af"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        /10
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Daily volume chart (SVG bar chart)
// ---------------------------------------------------------------------------

function DailyVolumeChart({ days }: { days: DayVolume[] }) {
  if (days.length === 0) return null

  const maxCount = Math.max(...days.map(d => d.count), 1)
  const chartH = 64
  const barW = 10
  const gap = 4
  const totalW = days.length * (barW + gap) - gap

  // Build bar rects
  const bars = days.map((d, i) => {
    const h = Math.max(2, Math.round((d.count / maxCount) * chartH))
    const x = i * (barW + gap)
    const y = chartH - h
    return { x, y, h, count: d.count, date: d.date }
  })

  // Sparkline polyline points
  const points = bars
    .map(b => `${b.x + barW / 2},${b.y}`)
    .join(' ')

  // Format date labels: first and last
  function fmtDate(iso: string) {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const firstLabel = days[0] ? fmtDate(days[0].date) : ''
  const lastLabel = days[days.length - 1] ? fmtDate(days[days.length - 1].date) : ''

  return (
    <div>
      <svg
        viewBox={`0 0 ${totalW} ${chartH}`}
        width="100%"
        height={chartH}
        aria-label="Daily conversation volume chart"
        overflow="visible"
      >
        {/* Grid line at 50% */}
        <line
          x1="0" y1={chartH / 2}
          x2={totalW} y2={chartH / 2}
          stroke="#f3f4f6"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Bars */}
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={barW}
            height={b.h}
            rx="2"
            fill="#6366f1"
            opacity="0.75"
            aria-label={`${b.date}: ${b.count} conversations`}
          />
        ))}

        {/* Sparkline overlay */}
        <polyline
          points={points}
          fill="none"
          stroke="#4f46e5"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Endpoint dot */}
        {bars.length > 0 && (
          <circle
            cx={bars[bars.length - 1].x + barW / 2}
            cy={bars[bars.length - 1].y}
            r="3"
            fill="#4f46e5"
          />
        )}
      </svg>

      {/* X-axis date labels */}
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{firstLabel}</span>
        <span className="text-xs text-gray-400">{lastLabel}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Topic row
// ---------------------------------------------------------------------------

function TopicRow({ topic, count, maxCount }: { topic: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{topic}</span>
      <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div
          className="h-full bg-indigo-400 rounded-full"
          style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}
        />
      </div>
      <span
        className="text-sm font-semibold text-gray-900 w-8 text-right flex-shrink-0"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {count}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3 px-4">
      <span className="text-5xl select-none" aria-hidden="true">💬</span>
      <h2 className="text-lg font-semibold text-gray-800">No conversation data yet</h2>
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
// Build safe empty data so rendering never crashes
// ---------------------------------------------------------------------------

function emptyData(): ConversationData {
  return {
    totalConversations: 0,
    todayConversations: 0,
    thisWeekConversations: 0,
    avgPerDay: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0, mixed: 0 },
    urgency: { urgent: 0, high: 0, medium: 0, low: 0 },
    aiAssistanceRate: 0,
    requiresResponseCount: 0,
    avgImportanceScore: 0,
    topTopics: [],
    dailyVolume: [],
    generatedAt: new Date().toISOString(),
  }
}

function isDataEmpty(d: ConversationData): boolean {
  return d.totalConversations === 0 && d.todayConversations === 0
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

function sentimentTotal(s: SentimentBreakdown): number {
  return s.positive + s.neutral + s.negative + s.mixed
}

function urgencyTotal(u: UrgencyBreakdown): number {
  return u.urgent + u.high + u.medium + u.low
}

function safePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConversationIntelligencePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<ConversationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/conversations', { token: token ?? undefined })
        if (!cancelled) setData((res as ConversationData) ?? emptyData())
      } catch {
        if (!cancelled) setData(emptyData())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  const d = data
  const isEmpty = !loading && !d

  // Pre-compute totals for percentage bars
  const sentTotal = d ? sentimentTotal(d.sentiment) : 0
  const urgTotal = d ? urgencyTotal(d.urgency) : 0
  const topicMax = d && d.topTopics.length > 0
    ? Math.max(...d.topTopics.map(t => t.count), 1)
    : 1

  return (
    <div className="flex flex-col min-h-0">
      <AnalyticsSubNav />

      <div className="flex-1 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

          {/* ── Page header ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Conversation Intelligence</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Sentiment, urgency, topics, and AI assistance across all conversations.
              </p>
            </div>
            {!loading && d && !isEmpty && (
              <p
                className="text-xs text-gray-400 flex-shrink-0 sm:pt-1"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                Updated{' '}
                {new Date(d.generatedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>

          {/* ── Empty state ─────────────────────────────────────────────── */}
          {isEmpty && <EmptyState />}

          {/* ── Volume KPI cards ─────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6">
                  <Skeleton className="h-3 w-20 mb-3" />
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <VolumeCard
                label="Total Conversations"
                value={d.totalConversations.toLocaleString()}
                sub="all time"
              />
              <VolumeCard
                label="Today"
                value={d.todayConversations.toLocaleString()}
                sub="since midnight"
              />
              <VolumeCard
                label="This Week"
                value={d.thisWeekConversations.toLocaleString()}
                sub="Mon – today"
              />
              <VolumeCard
                label="Avg per Day"
                value={d.avgPerDay.toFixed(1)}
                sub="14-day rolling avg"
              />
            </div>
          ) : null}

          {/* ── Sentiment + Urgency (2-col on lg) ────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[0, 1].map(col => (
                <div key={col} className="bg-white border border-gray-200 rounded-xl p-6">
                  <Skeleton className="h-3.5 w-36 mb-5" />
                  <div className="flex flex-col gap-4">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
                        <Skeleton className="flex-1 h-2 rounded-full" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Sentiment breakdown */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                {sectionLabel('Sentiment Breakdown')}
                <div className="flex flex-col gap-3.5">
                  {(
                    [
                      ['positive', d.sentiment.positive],
                      ['neutral', d.sentiment.neutral],
                      ['negative', d.sentiment.negative],
                      ['mixed', d.sentiment.mixed],
                    ] as [SentimentKey, number][]
                  ).map(([key, count]) => (
                    <SentimentRow
                      key={key}
                      sentiment={key}
                      count={count}
                      pct={safePct(count, sentTotal)}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  {sentTotal.toLocaleString()} conversations analysed
                </p>
              </div>

              {/* Urgency distribution */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                {sectionLabel('Urgency Distribution')}
                <div className="flex flex-col gap-3.5">
                  {(
                    [
                      ['urgent', d.urgency.urgent],
                      ['high', d.urgency.high],
                      ['medium', d.urgency.medium],
                      ['low', d.urgency.low],
                    ] as [UrgencyKey, number][]
                  ).map(([key, count]) => (
                    <UrgencyRow
                      key={key}
                      urgency={key}
                      count={count}
                      pct={safePct(count, urgTotal)}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  {urgTotal.toLocaleString()} conversations classified
                </p>
              </div>
            </div>
          ) : null}

          {/* ── AI Assistance ─────────────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <Skeleton className="h-3.5 w-32 mb-5" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="h-14 w-24 rounded-lg" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                ))}
              </div>
            </div>
          ) : !isEmpty && d ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              {sectionLabel('AI Assistance')}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                {/* AI assistance rate */}
                <div className="flex flex-col items-center text-center pb-6 md:pb-0 md:pr-6">
                  <div className="flex items-end gap-0.5 mb-1">
                    <span
                      className="text-5xl font-bold text-gray-900 leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {d.aiAssistanceRate.toFixed(0)}
                    </span>
                    <span className="text-2xl font-semibold text-gray-400 mb-1">%</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">AI assistance rate</p>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{
                        width: `${Math.min(d.aiAssistanceRate, 100)}%`,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Conversations where Zuri generated a suggestion
                  </p>
                </div>

                {/* Requires response */}
                <div className="flex flex-col items-center text-center pt-6 pb-6 md:pt-0 md:pb-0 md:px-6">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span
                      className="text-5xl font-bold text-gray-900 leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {d.requiresResponseCount.toLocaleString()}
                    </span>
                    {d.requiresResponseCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 self-start mt-1">
                        Pending
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">require a response</p>
                  <p className="text-xs text-gray-400 max-w-[180px]">
                    Open conversations flagged as needing your reply
                  </p>
                  {d.requiresResponseCount > 0 && (
                    <Link
                      href="/inbox/queue"
                      className="mt-3 inline-flex items-center justify-center h-9 px-4 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                    >
                      Open Queue →
                    </Link>
                  )}
                </div>

                {/* Avg importance score */}
                <div className="flex flex-col items-center text-center pt-6 md:pt-0 md:pl-6">
                  <ImportanceRing score={d.avgImportanceScore} />
                  <p className="text-sm text-gray-600 mt-2">avg importance score</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-[180px]">
                    AI-rated significance of each conversation, 0–10
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Top Topics + Daily Volume (2-col on lg) ──────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <Skeleton className="h-3.5 w-24 mb-5" />
                <div className="flex flex-col gap-3">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="flex-1 h-3 rounded" />
                      <Skeleton className="w-32 h-2 rounded-full" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <Skeleton className="h-3.5 w-32 mb-5" />
                <Skeleton className="h-16 w-full rounded mb-2" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            </div>
          ) : !isEmpty && d ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Top Topics */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                {sectionLabel('Top Topics')}
                {d.topTopics.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No topics detected yet
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {d.topTopics.slice(0, 10).map(t => (
                      <TopicRow
                        key={t.topic}
                        topic={t.topic}
                        count={t.count}
                        maxCount={topicMax}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Daily activity chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                {sectionLabel('Daily Activity — Last 14 Days')}
                {d.dailyVolume.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No daily data available
                  </p>
                ) : (
                  <>
                    {/* Peak callout */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p
                          className="text-2xl font-bold text-gray-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {Math.max(...d.dailyVolume.map(v => v.count)).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">peak day</p>
                      </div>
                      <div className="text-right">
                        <p
                          className="text-2xl font-bold text-gray-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {d.dailyVolume.reduce((s, v) => s + v.count, 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">14-day total</p>
                      </div>
                    </div>
                    <DailyVolumeChart days={d.dailyVolume} />
                  </>
                )}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  )
}
