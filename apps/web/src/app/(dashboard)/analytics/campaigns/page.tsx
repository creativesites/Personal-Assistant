'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

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

interface CampaignPost {
  id: string
  platform: string
  accountName: string | null
  caption: string
  productName: string | null
  sentAt: string | null
  leads: number
  sales: number
}

interface CampaignProduct {
  id: string
  name: string
  leads: number
  sales: number
}

interface CampaignsData {
  summary: { postsSent: number; totalLeads: number; totalSales: number }
  posts: CampaignPost[]
  products: CampaignProduct[]
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsAnalyticsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const marketingAccess = session.data?.marketingAccess ?? 'none'
  const hasAccess = marketingAccess === 'beta' || marketingAccess === 'enabled'

  const [data, setData] = useState<CampaignsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token || !hasAccess) { setLoading(false); return }
    apiClient<CampaignsData>('/api/analytics/campaigns', { token })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [token, hasAccess])

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AnalyticsSubNav />
        <div className="px-4 md:px-6 py-16 max-w-2xl mx-auto text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Campaign attribution is part of Zuri Marketing</h1>
          <p className="text-sm text-gray-500 mb-4">
            Once a post's leads and sales show up here, you'll see which products and posts
            actually convert — not just what got published.
          </p>
          <Link href="/studio" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Open Studio →
          </Link>
        </div>
      </div>
    )
  }

  const isEmpty = !loading && data && data.summary.postsSent === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Which posts and products turned into leads and sales. Attribution is set manually on
            each contact (via Contacts or Studio) since there's no live click-tracking yet.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : isEmpty ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-sm text-gray-500">
              No sent posts yet. Once you publish from Studio and attribute leads to it, results show up here.
            </p>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Posts sent</p>
                <p className="text-3xl font-bold text-gray-900">{data.summary.postsSent}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Attributed leads</p>
                <p className="text-3xl font-bold text-gray-900">{data.summary.totalLeads}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Attributed sales</p>
                <p className="text-3xl font-bold text-gray-900">{data.summary.totalSales}</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Posts</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">Platform</th>
                      <th className="px-4 py-3">Caption</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Leads</th>
                      <th className="px-4 py-3">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map(p => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="px-4 py-3 capitalize text-gray-700">{p.platform}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.caption}</td>
                        <td className="px-4 py-3 text-gray-600">{p.productName ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.leads}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.sales}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data.products.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Best-performing products</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {data.products.map(pr => (
                    <div key={pr.id} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-800">{pr.name}</span>
                      <span className="text-xs text-gray-500">{pr.leads} lead{pr.leads === 1 ? '' : 's'} · {pr.sales} sale{pr.sales === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
