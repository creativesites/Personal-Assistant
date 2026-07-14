'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Button } from '@/components/ui'
import { AnalyticsSubNav } from '../_components/analytics-sub-nav'

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
  conversionRate: number
}

interface CampaignPostingTime {
  dayOfWeek: string
  hourOfDay: number
  leads: number
  sales: number
}

interface CampaignsData {
  summary: { postsSent: number; totalLeads: number; totalSales: number }
  posts: CampaignPost[]
  products: CampaignProduct[]
  postingTimes: CampaignPostingTime[]
}

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}${hour < 12 ? 'am' : 'pm'}`
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
  const [recommendations, setRecommendations] = useState<string[] | null>(null)
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [recsError, setRecsError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !hasAccess) { setLoading(false); return }
    apiClient<CampaignsData>('/api/analytics/campaigns', { token })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [token, hasAccess])

  const generateRecommendations = useCallback(async () => {
    if (!token) return
    setLoadingRecs(true)
    setRecsError(null)
    try {
      const res = await apiClient<{ recommendations: string[] }>('/api/analytics/campaigns/recommendations', {
        method: 'POST',
        token,
      })
      setRecommendations(res.recommendations)
    } catch (err) {
      setRecsError(err instanceof ApiError ? err.message : 'Failed to generate recommendations')
    } finally {
      setLoadingRecs(false)
    }
  }, [token])

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
                      <span className="text-xs text-gray-500">
                        {pr.leads} lead{pr.leads === 1 ? '' : 's'} · {pr.sales} sale{pr.sales === 1 ? '' : 's'} · {pr.conversionRate}% conversion
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.postingTimes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Best posting times</h2>
                  <p className="text-xs text-gray-400 mt-0.5">When your sent posts generated the most attributed leads</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {data.postingTimes.map((t) => (
                    <div key={`${t.dayOfWeek}-${t.hourOfDay}`} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-800">{t.dayOfWeek}s around {formatHour(t.hourOfDay)}</span>
                      <span className="text-xs text-gray-500">{t.leads} lead{t.leads === 1 ? '' : 's'} · {t.sales} sale{t.sales === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Recommendations</h2>
                  <p className="text-xs text-gray-400 mt-0.5">AI suggestions based on the numbers above — not generic advice</p>
                </div>
                <Button size="sm" variant="secondary" onClick={generateRecommendations} loading={loadingRecs}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {recommendations ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
              {recsError && <p className="text-xs text-red-500 mb-2">{recsError}</p>}
              {recommendations && recommendations.length > 0 ? (
                <ul className="space-y-2">
                  {recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-indigo-400">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : !recsError ? (
                <p className="text-xs text-gray-400">
                  Generate a fresh set of suggestions from your current leads/sales/posting-time data.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
