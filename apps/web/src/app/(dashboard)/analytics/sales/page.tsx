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
  { href: '/analytics/campaigns', label: 'Campaigns' },
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

interface SalesKpis {
  totalLeads: number
  hotLeads: number
  avgLeadScore: number
  conversionRate: number
  totalLeadsDelta: number
  hotLeadsDelta: number
  avgLeadScoreDelta: number
  conversionRateDelta: number
}

interface PipelineStage {
  stage: 'cold' | 'warm' | 'hot'
  count: number
  percentage: number
}

interface LeadRow {
  id: string
  name: string
  company: string
  score: number
  stage: 'cold' | 'warm' | 'hot'
  lastContact: string
}

interface SalesData {
  kpis: SalesKpis
  pipeline: PipelineStage[]
  topLeads: LeadRow[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDelta(n: number, suffix = ''): { label: string; positive: boolean } {
  const positive = n >= 0
  return {
    label: `${positive ? '+' : ''}${n.toFixed(1)}${suffix} vs last period`,
    positive,
  }
}

function stageMeta(stage: 'cold' | 'warm' | 'hot') {
  switch (stage) {
    case 'hot':
      return { label: 'Hot', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500', dot: 'bg-red-500' }
    case 'warm':
      return { label: 'Warm', bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-400', dot: 'bg-amber-400' }
    case 'cold':
      return { label: 'Cold', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-400', dot: 'bg-blue-400' }
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return 'bg-red-500'
  if (score >= 50) return 'bg-amber-400'
  return 'bg-blue-400'
}

function scoreTextColor(score: number): string {
  if (score >= 75) return 'text-red-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-blue-600'
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function KpiSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mb-3" />
      <div className="h-7 w-20 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
    </div>
  )
}

function FunnelSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mb-6" />
      {[80, 55, 30].map((w, i) => (
        <div key={i} className="mb-5">
          <div className="flex justify-between mb-2">
            <div className="h-3 w-12 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
            <div
              className="h-full bg-gray-200 rounded-lg animate-pulse"
              style={{ width: `${w}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function StageSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      {[1, 2, 3].map(i => (
        <div key={i} className="mb-4">
          <div className="flex justify-between mb-2">
            <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-gray-200 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Name', 'Company', 'Score', 'Stage', 'Last Contact'].map(col => (
                <th key={col} className="px-4 py-3 text-left">
                  <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-4"><div className="h-3 w-28 bg-gray-200 rounded animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-3 w-24 bg-gray-200 rounded animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-3 w-24 bg-gray-200 rounded animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-5 w-12 bg-gray-200 rounded-full animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-3 w-20 bg-gray-200 rounded animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string
  value: string
  delta: number
  deltaLabel?: string
  suffix?: string
}

function KpiCard({ label, value, delta, suffix = '' }: KpiCardProps) {
  const { label: deltaStr, positive } = fmtDelta(delta, suffix)
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p
        className="text-3xl font-bold text-gray-900 mb-2"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      <p className={`text-xs ${positive ? 'text-green-600' : 'text-red-500'}`}>{deltaStr}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline Funnel
// ---------------------------------------------------------------------------

function PipelineFunnel({ pipeline }: { pipeline: PipelineStage[] }) {
  const ordered: Array<'cold' | 'warm' | 'hot'> = ['cold', 'warm', 'hot']
  const rows = ordered
    .map(s => pipeline.find(p => p.stage === s))
    .filter(Boolean) as PipelineStage[]

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Pipeline Funnel</h2>
      <p className="text-xs text-gray-500 mb-6">Lead progression by temperature</p>

      {rows.map((row, idx) => {
        const meta = stageMeta(row.stage)
        const maxCount = rows[0]?.count ?? 1
        const barWidth = maxCount > 0 ? Math.round((row.count / maxCount) * 100) : 0

        return (
          <div key={row.stage} className="mb-5 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {idx > 0 && (
                  <svg className="w-3 h-3 text-gray-300" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v8M2 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${meta.text}`}>
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span
                  className="text-sm font-bold text-gray-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmtNum(row.count)}
                </span>
                <span className="text-xs text-gray-400 w-10 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPct(row.percentage)}
                </span>
              </div>
            </div>
            <div className="h-8 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
              <div
                className={`h-full ${meta.bar} rounded-lg transition-all duration-700 flex items-center justify-end pr-3`}
                style={{ width: `${Math.max(barWidth, 4)}%` }}
              >
                {barWidth > 20 && (
                  <span className="text-xs font-semibold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtNum(row.count)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage Breakdown (bar chart rows)
// ---------------------------------------------------------------------------

function StageBreakdown({ pipeline }: { pipeline: PipelineStage[] }) {
  const total = pipeline.reduce((acc, p) => acc + p.count, 0)
  const ordered: Array<'cold' | 'warm' | 'hot'> = ['hot', 'warm', 'cold']
  const rows = ordered
    .map(s => pipeline.find(p => p.stage === s))
    .filter(Boolean) as PipelineStage[]

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Pipeline by Stage</h2>
      <p className="text-xs text-gray-500 mb-6">{fmtNum(total)} leads total</p>

      <div className="space-y-5">
        {rows.map(row => {
          const meta = stageMeta(row.stage)
          const pct = total > 0 ? (row.count / total) * 100 : 0
          return (
            <div key={row.stage}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-sm ${meta.dot}`} />
                  <span className="text-sm font-medium text-gray-700">{meta.label} leads</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span
                    className="text-sm font-bold text-gray-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtNum(row.count)}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtPct(pct)}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 ${meta.bar} rounded-full transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Mini visual split */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-2">Visual split</p>
        <div className="flex h-4 rounded-full overflow-hidden gap-px bg-gray-100">
          {rows.map(row => {
            const meta = stageMeta(row.stage)
            const pct = total > 0 ? (row.count / total) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={row.stage}
                className={`${meta.bar} transition-all duration-700`}
                style={{ width: `${pct}%` }}
                title={`${meta.label}: ${fmtPct(pct)}`}
              />
            )
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {rows.map(row => {
            const meta = stageMeta(row.stage)
            return (
              <span key={row.stage} className={`text-xs ${meta.text} font-medium`}>
                {meta.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Leads Table
// ---------------------------------------------------------------------------

function TopLeadsTable({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Top Leads</h2>
          <p className="text-xs text-gray-500 mt-0.5">Ranked by lead score · showing top {leads.length}</p>
        </div>
        <Link
          href="/leads"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors min-h-[44px] flex items-center"
        >
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Company
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Stage
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Last Contact
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map(lead => {
              const meta = stageMeta(lead.stage)
              return (
                <tr
                  key={lead.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/contacts/${lead.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                    >
                      {lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-700">{lead.company || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${scoreColor(lead.score)}`}
                          style={{ width: `${lead.score}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold ${scoreTextColor(lead.score)}`}>
                        {lead.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-500">{lead.lastContact}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="text-5xl mb-4" role="img" aria-label="No data">📊</div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">No leads tracked yet</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        No data yet — insights appear here once conversations are analysed.
      </p>
      <Link
        href="/inbox"
        className="mt-6 inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors min-h-[44px]"
      >
        Go to Inbox
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback / mock data for when the API is not yet live
// ---------------------------------------------------------------------------

function buildFallback(): SalesData {
  return {
    kpis: {
      totalLeads: 0,
      hotLeads: 0,
      avgLeadScore: 0,
      conversionRate: 0,
      totalLeadsDelta: 0,
      hotLeadsDelta: 0,
      avgLeadScoreDelta: 0,
      conversionRateDelta: 0,
    },
    pipeline: [
      { stage: 'cold', count: 0, percentage: 0 },
      { stage: 'warm', count: 0, percentage: 0 },
      { stage: 'hot', count: 0, percentage: 0 },
    ],
    topLeads: [],
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SalesIntelligencePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiClient('/api/analytics/sales', { token: token ?? undefined })
        setData(res as SalesData)
      } catch (err: unknown) {
        // If the endpoint doesn't exist yet, fall back to an empty state
        const apiError = err as { status?: number }
        if (apiError?.status === 404 || apiError?.status === 500) {
          setData(buildFallback())
        } else {
          setError('Failed to load sales data. Please try again.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  const isEmpty = !loading && !error && data === null

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sales Intelligence</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Lead pipeline, scoring, and conversion tracking
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap flex-shrink-0 self-start mt-0.5">
            Last 30 days
          </span>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty state (no leads at all) */}
        {isEmpty ? (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl">
            <EmptyState />
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {loading ? (
                <>
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                </>
              ) : data ? (
                <>
                  <KpiCard
                    label="Total Leads"
                    value={fmtNum(data.kpis.totalLeads)}
                    delta={data.kpis.totalLeadsDelta}
                  />
                  <KpiCard
                    label="Hot Leads"
                    value={fmtNum(data.kpis.hotLeads)}
                    delta={data.kpis.hotLeadsDelta}
                  />
                  <KpiCard
                    label="Avg Lead Score"
                    value={data.kpis.avgLeadScore.toFixed(1)}
                    delta={data.kpis.avgLeadScoreDelta}
                  />
                  <KpiCard
                    label="Conversion Rate"
                    value={fmtPct(data.kpis.conversionRate)}
                    delta={data.kpis.conversionRateDelta}
                    suffix="%"
                  />
                </>
              ) : null}
            </div>

            {/* Funnel + Stage breakdown row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {loading ? (
                <>
                  <FunnelSkeleton />
                  <StageSkeleton />
                </>
              ) : data ? (
                <>
                  <PipelineFunnel pipeline={data.pipeline} />
                  <StageBreakdown pipeline={data.pipeline} />
                </>
              ) : null}
            </div>

            {/* Top leads table */}
            {loading ? (
              <TableSkeleton />
            ) : data && data.topLeads.length > 0 ? (
              <TopLeadsTable leads={data.topLeads.slice(0, 10)} />
            ) : !loading && data ? (
              <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 text-center text-sm text-gray-500">
                No leads to display yet — they will appear here once WhatsApp conversations are analysed.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
