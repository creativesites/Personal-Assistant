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

interface OpportunityItem {
  id: string
  contactId: string
  contactName: string
  pipelineStage: 'cold' | 'warm' | 'hot' | string
  leadScore: number
  reason: string
  insight: string
  urgency: 'high' | 'medium' | 'low'
  estimatedValue: number
  lastContactDate: string
}

interface OpportunitiesData {
  totalEstimatedValue: number
  opportunities: OpportunityItem[]
  generatedAt?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtK(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return `${diff}d ago`
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function stageMeta(stage: string): { label: string; bg: string; text: string; border: string } {
  switch (stage) {
    case 'hot':
      return { label: 'Hot', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
    case 'warm':
      return { label: 'Warm', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
    case 'cold':
      return { label: 'Cold', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' }
    default:
      return { label: stage, bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
  }
}

function urgencyMeta(urgency: 'high' | 'medium' | 'low'): { label: string; bg: string; text: string; border: string; dot: string } {
  switch (urgency) {
    case 'high':
      return { label: 'High urgency', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' }
    case 'medium':
      return { label: 'Medium urgency', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' }
    case 'low':
      return { label: 'Low urgency', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-400' }
  }
}

function leadScoreColor(score: number): { bar: string; text: string } {
  if (score > 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700' }
  if (score > 60) return { bar: 'bg-amber-400', text: 'text-amber-700' }
  return { bar: 'bg-rose-500', text: 'text-rose-700' }
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div>
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div>
        <Skeleton className="h-2 w-full rounded-full mb-1" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lead score bar
// ---------------------------------------------------------------------------

function LeadScoreBar({ score }: { score: number }) {
  const { bar, text } = leadScoreColor(score)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500 font-medium">Lead score</span>
        <span className={`text-xs font-bold ${text}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${bar} rounded-full`}
          style={{ width: `${Math.min(score, 100)}%`, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opportunity card
// ---------------------------------------------------------------------------

function OpportunityCard({ opp }: { opp: OpportunityItem }) {
  const stage = stageMeta(opp.pipelineStage)
  const urg = urgencyMeta(opp.urgency)

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold select-none"
            aria-hidden="true"
          >
            {initials(opp.contactName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{opp.contactName}</p>
            <span
              className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${stage.bg} ${stage.text} ${stage.border}`}
            >
              {stage.label}
            </span>
          </div>
        </div>
        {opp.estimatedValue > 0 && (
          <div className="flex-shrink-0 text-right">
            <p
              className="text-sm font-bold text-gray-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtK(opp.estimatedValue)}
            </p>
            <p className="text-xs text-gray-400">est. value</p>
          </div>
        )}
      </div>

      {/* Lead score bar */}
      <LeadScoreBar score={opp.leadScore} />

      {/* Reason */}
      {opp.reason && (
        <p className="text-sm text-gray-700 leading-relaxed">{opp.reason}</p>
      )}

      {/* AI insight */}
      {opp.insight && (
        <p className="text-sm text-gray-500 italic leading-relaxed">&ldquo;{opp.insight}&rdquo;</p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Urgency badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${urg.bg} ${urg.text} ${urg.border}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${urg.dot}`} />
            {urg.label}
          </span>
          {/* Last contact */}
          <span className="text-xs text-gray-400">
            Last contact: {fmtDate(opp.lastContactDate)}
          </span>
        </div>
        <Link
          href={`/contacts/${opp.contactId}`}
          className="inline-flex items-center justify-center h-9 px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors flex-shrink-0 min-h-[36px]"
        >
          View Contact
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6 gap-3">
      <span className="text-5xl select-none" aria-hidden="true">🎯</span>
      <h2 className="text-base font-semibold text-gray-800">No opportunities detected yet</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Keep engaging with your leads — Zuri will surface revenue opportunities as it analyses your conversations.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback / empty data
// ---------------------------------------------------------------------------

function buildFallback(): OpportunitiesData {
  return { totalEstimatedValue: 0, opportunities: [] }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OpportunitiesPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<OpportunitiesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/opportunities', { token: token ?? undefined })
        if (!cancelled) setData((res as OpportunitiesData) ?? buildFallback())
      } catch {
        if (!cancelled) setData(buildFallback())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const opportunities = data?.opportunities ?? []
  const isEmpty = !loading && opportunities.length === 0
  const totalValue = data?.totalEstimatedValue ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Opportunity Engine</h1>
            <p className="text-sm text-gray-500 mt-0.5">Revenue opportunities waiting for action</p>
          </div>

          {/* Total estimated value badge */}
          {!loading && !isEmpty && (
            <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm self-start sm:self-auto">
              <p className="text-xs text-gray-500 mb-0.5">Total estimated value</p>
              <p
                className="text-2xl font-bold text-indigo-600"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtK(totalValue)}
                <span className="text-base font-normal text-gray-400 ml-1">in opportunities</span>
              </p>
            </div>
          )}

          {loading && <Skeleton className="h-16 w-52 rounded-xl" />}
        </div>

        {/* ── Opportunity count strip (when loaded) ───────────────── */}
        {!loading && !isEmpty && (
          <p className="text-sm text-gray-500">
            Showing <span className="font-semibold text-gray-900">{opportunities.length}</span> {opportunities.length === 1 ? 'opportunity' : 'opportunities'} ranked by urgency and value
          </p>
        )}

        {/* ── Skeleton grid ────────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {isEmpty && (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl">
            <EmptyState />
          </div>
        )}

        {/* ── Opportunity cards grid ───────────────────────────────── */}
        {!loading && !isEmpty && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {opportunities.map(opp => (
              <OpportunityCard key={opp.id} opp={opp} />
            ))}
          </div>
        )}

        {/* ── Footer timestamp ─────────────────────────────────────── */}
        {!loading && data?.generatedAt && !isEmpty && (
          <p className="text-xs text-gray-400 text-center pb-2">
            Last updated{' '}
            {new Date(data.generatedAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

      </div>
    </div>
  )
}
