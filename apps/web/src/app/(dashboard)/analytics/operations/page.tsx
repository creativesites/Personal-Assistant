'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { AnalyticsSubNav } from '../_components/analytics-sub-nav'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMetrics {
  activeConversations: number
  pendingAiReplies: number
  openEscalations: number
  activeAgents: number
}

interface QueueStatus {
  depth: number
  oldestPendingAt: string | null
  status: 'healthy' | 'building_up' | 'critical'
}

interface ActivityItem {
  id: string
  type: 'inbound_message' | 'suggestion_ready' | string
  description: string
  timestamp: string
}

interface OperationsData {
  metrics: LiveMetrics
  queue: QueueStatus
  recentActivity: ActivityItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function activityDotColor(type: string): string {
  if (type === 'inbound_message') return 'bg-blue-500'
  if (type === 'suggestion_ready') return 'bg-indigo-500'
  return 'bg-gray-400'
}

function queueStatusConfig(status: QueueStatus['status']) {
  if (status === 'healthy')
    return {
      label: 'Healthy',
      pill: 'bg-green-100 text-green-700',
      bar: 'bg-green-500',
    }
  if (status === 'building_up')
    return {
      label: 'Building Up',
      pill: 'bg-amber-100 text-amber-700',
      bar: 'bg-amber-500',
    }
  return {
    label: 'Critical',
    pill: 'bg-red-100 text-red-700',
    bar: 'bg-red-500',
  }
}

// ─── Skeleton components ───────────────────────────────────────────────────────

function MetricCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-3">
      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
      <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
      <div className="h-2 w-12 bg-gray-200 rounded animate-pulse" />
    </div>
  )
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-200 animate-pulse shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
        <div className="h-2.5 bg-gray-200 rounded animate-pulse w-16" />
      </div>
    </div>
  )
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: number
  accentClass: string
  dotClass: string
  sub?: string
}

function MetricCard({ label, value, accentClass, dotClass, sub }: MetricCardProps) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <span
        className={`text-4xl font-bold tabular-nums leading-none ${accentClass}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value.toLocaleString()}
      </span>
      {sub && <span className="text-xs text-gray-400 mt-1">{sub}</span>}
    </div>
  )
}

// ─── SVG Progress Ring ────────────────────────────────────────────────────────

function ProgressRing({
  pct,
  color,
  size = 56,
}: {
  pct: number
  color: string
  size?: number
}) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Queue Gauge (stylized depth meter) ───────────────────────────────────────

function QueueDepthBar({ depth, max = 100 }: { depth: number; max?: number }) {
  const pct = Math.min(100, (depth / max) * 100)
  const color =
    pct < 40 ? '#22c55e' : pct < 75 ? '#f59e0b' : '#ef4444'
  return (
    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<OperationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  async function fetchData() {
    try {
      const res = await apiClient('/api/analytics/operations', { token: token ?? undefined })
      setData(res as OperationsData)
      setLastRefreshed(new Date())
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load operations data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token === undefined) return
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const qCfg = data ? queueStatusConfig(data.queue.status) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      {/* Page header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <h1 className="text-xl font-bold text-gray-900">Live Operations</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-green-500"
                  style={{ animation: 'pulse 1.8s ease-in-out infinite' }}
                />
                Live
              </span>
            </div>
            <p className="text-sm text-gray-500">Real-time view of your business</p>
          </div>
          {lastRefreshed && (
            <span className="text-xs text-gray-400 tabular-nums">
              Refreshed {relativeTime(lastRefreshed.toISOString())} · auto-refreshes every 30s
            </span>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <span className="text-red-400 text-base">⚠</span>
            {error}
          </div>
        )}

        {/* Live metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : data ? (
            <>
              <MetricCard
                label="Active Conversations"
                value={data.metrics.activeConversations}
                accentClass="text-blue-600"
                dotClass="bg-blue-500"
                sub="ongoing threads"
              />
              <MetricCard
                label="Pending AI Replies"
                value={data.metrics.pendingAiReplies}
                accentClass="text-amber-600"
                dotClass="bg-amber-400"
                sub="awaiting review"
              />
              <MetricCard
                label="Open Escalations"
                value={data.metrics.openEscalations}
                accentClass="text-red-600"
                dotClass="bg-red-500"
                sub="needs attention"
              />
              <MetricCard
                label="Active Agents"
                value={data.metrics.activeAgents}
                accentClass="text-green-600"
                dotClass="bg-green-500"
                sub="online now"
              />
            </>
          ) : null}
        </div>

        {/* Queue + Activity split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Queue Status card */}
          <div className="lg:col-span-2 bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Queue Status</h2>
              {loading ? (
                <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
              ) : qCfg ? (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${qCfg.pill}`}>
                  {qCfg.label}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="flex flex-col gap-4">
                <div className="h-12 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-full bg-gray-200 rounded-full animate-pulse" />
                <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
              </div>
            ) : data ? (
              <>
                {/* Big depth number + ring */}
                <div className="flex items-center gap-4">
                  <ProgressRing
                    pct={Math.min(100, (data.queue.depth / 100) * 100)}
                    color={
                      data.queue.status === 'healthy'
                        ? '#22c55e'
                        : data.queue.status === 'building_up'
                        ? '#f59e0b'
                        : '#ef4444'
                    }
                    size={64}
                  />
                  <div>
                    <div
                      className="text-4xl font-bold text-gray-900 tabular-nums leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {data.queue.depth}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">items in queue</div>
                  </div>
                </div>

                {/* Depth bar */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Queue depth</span>
                    <span className="tabular-nums">{Math.min(100, data.queue.depth)} / 100</span>
                  </div>
                  <QueueDepthBar depth={data.queue.depth} max={100} />
                </div>

                {/* Oldest pending */}
                <div className="border-t border-gray-100 pt-4 flex flex-col gap-1">
                  <span className="text-xs text-gray-500 font-medium">Oldest pending item</span>
                  {data.queue.oldestPendingAt ? (
                    <span className="text-sm text-gray-700 tabular-nums">
                      {relativeTime(data.queue.oldestPendingAt)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">Queue is empty</span>
                  )}
                </div>

                {/* Status description */}
                <div
                  className={`rounded-lg px-3 py-2.5 text-xs ${
                    data.queue.status === 'healthy'
                      ? 'bg-green-50 text-green-700'
                      : data.queue.status === 'building_up'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {data.queue.status === 'healthy' &&
                    'Queue is processing normally. No action required.'}
                  {data.queue.status === 'building_up' &&
                    'Queue is growing. Consider reviewing pending replies to clear the backlog.'}
                  {data.queue.status === 'critical' &&
                    'Queue is at a critical level. Immediate attention is needed to clear the backlog.'}
                </div>
              </>
            ) : null}
          </div>

          {/* Recent Activity feed */}
          <div className="lg:col-span-3 bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
              {data && data.recentActivity.length > 0 && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {data.recentActivity.length} events
                </span>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ActivityItemSkeleton key={i} />
                ))}
              </div>
            ) : data && data.recentActivity.length > 0 ? (
              <div
                className="overflow-y-auto divide-y divide-gray-50"
                style={{ maxHeight: '440px' }}
              >
                {data.recentActivity.slice(0, 20).map(item => (
                  <div key={item.id} className="flex items-start gap-3 py-3 group">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${activityDotColor(item.type)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-snug">{item.description}</p>
                      <span
                        className="text-xs text-gray-400 tabular-nums"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {relativeTime(item.timestamp)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-gray-300 group-hover:text-gray-400 transition-colors">
                      {item.type === 'inbound_message'
                        ? 'Inbound'
                        : item.type === 'suggestion_ready'
                        ? 'AI Reply'
                        : item.type}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                <span className="text-3xl select-none">📭</span>
                <p className="text-sm text-gray-500">No recent activity</p>
                <p className="text-xs text-gray-400">Events will appear here as they happen</p>
              </div>
            )}

            {/* Legend */}
            <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-400">Inbound message</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <span className="text-xs text-gray-400">AI suggestion ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                <span className="text-xs text-gray-400">Other</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pulse keyframe for the live dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
