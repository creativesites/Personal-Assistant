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

type SegmentKey = 'vip' | 'active' | 'at_risk' | 'dormant' | 'new'

interface SegmentCounts {
  vip: number
  active: number
  at_risk: number
  dormant: number
  new: number
  total: number
}

interface HealthDistribution {
  excellent: number
  good: number
  fair: number
  poor: number
}

interface CustomerRow {
  id: string
  name: string
  healthScore: number
  tier: SegmentKey
  lastContactDate: string | null
  interactionCount: number
}

interface GrowthMetrics {
  growthRate: number
  avgHealthScore: number
  avgInteractions: number
}

interface CustomersData {
  segments: SegmentCounts
  healthDistribution: HealthDistribution
  topCustomers: CustomerRow[]
  growth: GrowthMetrics
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function pct(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

// ---------------------------------------------------------------------------
// Segment config
// ---------------------------------------------------------------------------

interface SegmentMeta {
  label: string
  emoji: string
  accent: string
  accentText: string
  accentBg: string
  accentBorder: string
  barColor: string
  badgeBg: string
  badgeText: string
}

const SEGMENT_META: Record<SegmentKey, SegmentMeta> = {
  vip: {
    label: 'VIP',
    emoji: '★',
    accent: 'text-indigo-600',
    accentText: 'text-indigo-700',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-indigo-200',
    barColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-700',
  },
  active: {
    label: 'Active',
    emoji: '●',
    accent: 'text-green-600',
    accentText: 'text-green-700',
    accentBg: 'bg-green-50',
    accentBorder: 'border-green-200',
    barColor: 'bg-green-500',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
  },
  at_risk: {
    label: 'At Risk',
    emoji: '!',
    accent: 'text-red-600',
    accentText: 'text-red-700',
    accentBg: 'bg-red-50',
    accentBorder: 'border-red-200',
    barColor: 'bg-red-500',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
  dormant: {
    label: 'Dormant',
    emoji: '○',
    accent: 'text-gray-500',
    accentText: 'text-gray-600',
    accentBg: 'bg-gray-50',
    accentBorder: 'border-gray-200',
    barColor: 'bg-gray-400',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-600',
  },
  new: {
    label: 'New',
    emoji: '+',
    accent: 'text-blue-600',
    accentText: 'text-blue-700',
    accentBg: 'bg-blue-50',
    accentBorder: 'border-blue-200',
    barColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
  },
}

// ---------------------------------------------------------------------------
// Health distribution config
// ---------------------------------------------------------------------------

interface HealthBandMeta {
  label: string
  labelColor: string
  barColor: string
}

const HEALTH_BANDS: { key: keyof HealthDistribution; meta: HealthBandMeta }[] = [
  { key: 'excellent', meta: { label: 'Excellent', labelColor: 'text-green-600', barColor: 'bg-green-500' } },
  { key: 'good',      meta: { label: 'Good',      labelColor: 'text-teal-600',  barColor: 'bg-teal-400'  } },
  { key: 'fair',      meta: { label: 'Fair',       labelColor: 'text-amber-600', barColor: 'bg-amber-400' } },
  { key: 'poor',      meta: { label: 'Poor',       labelColor: 'text-red-600',   barColor: 'bg-red-500'   } },
]

// ---------------------------------------------------------------------------
// Health score color helpers
// ---------------------------------------------------------------------------

function healthBarColor(score: number): string {
  if (score >= 75) return 'bg-green-500'
  if (score >= 50) return 'bg-teal-400'
  if (score >= 25) return 'bg-amber-400'
  return 'bg-red-500'
}

function healthTextColor(score: number): string {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-teal-600'
  if (score >= 25) return 'text-amber-600'
  return 'text-red-600'
}

// ---------------------------------------------------------------------------
// Avatar circle
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-blue-500',
  'bg-teal-500',
  'bg-green-600',
  'bg-amber-500',
  'bg-orange-500',
  'bg-pink-500',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = getInitials(name)
  const color = avatarColor(name)
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div
      className={`${sizeClasses} rounded-full ${color} flex items-center justify-center text-white font-semibold flex-shrink-0`}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function SegmentCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
        <div className="w-7 h-7 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="h-8 w-14 bg-gray-200 rounded animate-pulse mb-1.5" />
      <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
    </div>
  )
}

function HealthDistSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-6" />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="mb-4 flex items-center gap-3">
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse flex-shrink-0" />
          <div className="flex-1 h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-gray-200 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <div className="h-3 w-8 bg-gray-200 rounded animate-pulse flex-shrink-0" />
          <div className="h-3 w-8 bg-gray-200 rounded animate-pulse flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}

function CustomerListSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-4 w-36 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Customer', 'Health', 'Tier', 'Last Contact', 'Interactions'].map(col => (
                <th key={col} className="px-4 py-3 text-left">
                  <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                    <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-gray-200 rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                    <div className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
                  </div>
                </td>
                <td className="px-4 py-4"><div className="h-5 w-14 bg-gray-200 rounded-full animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-3 w-20 bg-gray-200 rounded animate-pulse" /></td>
                <td className="px-4 py-4"><div className="h-3 w-10 bg-gray-200 rounded animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GrowthSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="text-center">
            <div className="h-9 w-20 bg-gray-200 rounded animate-pulse mx-auto mb-2" />
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Segment cards
// ---------------------------------------------------------------------------

const SEGMENT_ORDER: SegmentKey[] = ['vip', 'active', 'at_risk', 'dormant', 'new']

function SegmentCards({ segments }: { segments: SegmentCounts }) {
  const total = segments.total || 1

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {SEGMENT_ORDER.map(key => {
        const meta = SEGMENT_META[key]
        const count = segments[key]
        const percentage = pct(count, total)
        return (
          <div
            key={key}
            className={`bg-white border shadow-sm rounded-xl p-5 ${meta.accentBorder}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {meta.label}
              </span>
              <span
                className={`w-7 h-7 rounded-full ${meta.accentBg} ${meta.accentText} flex items-center justify-center text-sm font-bold leading-none`}
                aria-hidden="true"
              >
                {meta.emoji}
              </span>
            </div>
            <p
              className={`text-3xl font-bold ${meta.accent} mb-1`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {count.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {percentage}% of total
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health distribution
// ---------------------------------------------------------------------------

function HealthDistribution({ dist }: { dist: HealthDistribution }) {
  const total = dist.excellent + dist.good + dist.fair + dist.poor
  const maxCount = Math.max(dist.excellent, dist.good, dist.fair, dist.poor, 1)

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Health Distribution</h2>
      <p className="text-xs text-gray-500 mb-6">
        {total.toLocaleString()} customers across 4 health bands
      </p>

      <div className="space-y-4">
        {HEALTH_BANDS.map(({ key, meta }) => {
          const count = dist[key]
          const percentage = pct(count, total)
          const barWidth = Math.round((count / maxCount) * 100)
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-semibold ${meta.labelColor}`}>{meta.label}</span>
                <div className="flex items-center gap-3 text-right">
                  <span
                    className="text-sm font-bold text-gray-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {count.toLocaleString()}
                  </span>
                  <span
                    className="text-xs text-gray-400 w-9 text-right"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {percentage}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${meta.barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${Math.max(barWidth, count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Mini stacked bar */}
      {total > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Overall split</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 gap-px">
            {HEALTH_BANDS.map(({ key, meta }) => {
              const count = dist[key]
              const percentage = pct(count, total)
              if (percentage === 0) return null
              return (
                <div
                  key={key}
                  className={`${meta.barColor} transition-all duration-700`}
                  style={{ width: `${percentage}%` }}
                  title={`${meta.label}: ${percentage}%`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {HEALTH_BANDS.map(({ key, meta }) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-sm ${meta.barColor}`} />
                <span className={`text-xs ${meta.labelColor} font-medium`}>{meta.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top customers table
// ---------------------------------------------------------------------------

function TopCustomersTable({ customers }: { customers: CustomerRow[] }) {
  if (customers.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Top Customers</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ranked by health score · showing top {customers.length}
          </p>
        </div>
        <Link
          href="/relationships"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors min-h-[44px] flex items-center"
        >
          View all →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Health
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Tier
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Last Contact
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Interactions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {customers.map(customer => {
              const tier = SEGMENT_META[customer.tier]
              return (
                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                  {/* Customer name + avatar */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={customer.name} />
                      <Link
                        href={`/contacts/${customer.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        {customer.name}
                      </Link>
                    </div>
                  </td>

                  {/* Health score bar */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${healthBarColor(customer.healthScore)}`}
                          style={{ width: `${customer.healthScore}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-semibold ${healthTextColor(customer.healthScore)}`}
                      >
                        {customer.healthScore}
                      </span>
                    </div>
                  </td>

                  {/* Tier badge */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${tier.badgeBg} ${tier.badgeText}`}
                    >
                      {tier.label}
                    </span>
                  </td>

                  {/* Last contact */}
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-500">{fmtDate(customer.lastContactDate)}</span>
                  </td>

                  {/* Interaction count */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-medium text-gray-700">
                      {customer.interactionCount.toLocaleString()}
                    </span>
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
// Growth section
// ---------------------------------------------------------------------------

function GrowthSection({ growth }: { growth: GrowthMetrics }) {
  const isPositive = growth.growthRate >= 0

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Growth Overview</h2>
      <p className="text-xs text-gray-500 mb-6">Key metrics vs. prior period</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Growth rate */}
        <div className="text-center">
          <div
            className={`text-4xl font-bold mb-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {isPositive ? '+' : ''}{growth.growthRate.toFixed(1)}%
          </div>
          <p className="text-xs text-gray-500 mt-1">Customer growth rate</p>
          <div
            className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {isPositive ? (
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            vs last period
          </div>
        </div>

        {/* Avg health score */}
        <div className="text-center">
          <div
            className={`text-4xl font-bold mb-1 ${healthTextColor(growth.avgHealthScore)}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(growth.avgHealthScore)}
          </div>
          <p className="text-xs text-gray-500 mt-1">Avg health score</p>
          <div className="mt-3 mx-auto w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${healthBarColor(growth.avgHealthScore)}`}
              style={{ width: `${growth.avgHealthScore}%` }}
            />
          </div>
        </div>

        {/* Avg interactions */}
        <div className="text-center">
          <div
            className="text-4xl font-bold text-gray-900 mb-1"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {growth.avgInteractions.toFixed(1)}
          </div>
          <p className="text-xs text-gray-500 mt-1">Avg interactions / customer</p>
          <p className="text-xs text-gray-400 mt-2">per period</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="text-5xl mb-4" role="img" aria-label="No customers">👥</div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">No customer data yet</h3>
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
// Fallback when API is not live
// ---------------------------------------------------------------------------

function buildFallback(): CustomersData {
  return {
    segments: { vip: 0, active: 0, at_risk: 0, dormant: 0, new: 0, total: 0 },
    healthDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
    topCustomers: [],
    growth: { growthRate: 0, avgHealthScore: 0, avgInteractions: 0 },
  }
}

function isEmpty(data: CustomersData): boolean {
  return (
    data.segments.total === 0 &&
    data.topCustomers.length === 0
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomerIntelligencePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<CustomersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiClient('/api/analytics/customers', { token: token ?? undefined })
        setData(res as CustomersData)
      } catch (err: unknown) {
        const apiError = err as { status?: number }
        if (apiError?.status === 404 || apiError?.status === 500) {
          setData(buildFallback())
        } else {
          setError('Failed to load customer data. Please try again.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  const empty = !loading && !error && data === null

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customer Intelligence</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Segmentation, health, and relationship depth across your contact base
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap flex-shrink-0 self-start mt-0.5">
            All time
          </span>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty state */}
        {empty ? (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl">
            <EmptyState />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Segment cards */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SegmentCardSkeleton key={i} />
                ))}
              </div>
            ) : data ? (
              <SegmentCards segments={data.segments} />
            ) : null}

            {/* Health distribution */}
            {loading ? (
              <HealthDistSkeleton />
            ) : data ? (
              <HealthDistribution dist={data.healthDistribution} />
            ) : null}

            {/* Top customers table */}
            {loading ? (
              <CustomerListSkeleton />
            ) : data && data.topCustomers.length > 0 ? (
              <TopCustomersTable customers={data.topCustomers.slice(0, 10)} />
            ) : !loading && data && !empty ? (
              <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 text-center text-sm text-gray-500">
                No customer profiles to display yet — they will appear once conversations are analysed.
              </div>
            ) : null}

            {/* Growth section */}
            {loading ? (
              <GrowthSkeleton />
            ) : data ? (
              <GrowthSection growth={data.growth} />
            ) : null}

          </div>
        )}
      </div>
    </div>
  )
}
