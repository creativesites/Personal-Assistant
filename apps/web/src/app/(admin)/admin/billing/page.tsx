'use client'

import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'

interface PlanBreakdown {
  plan: string
  count: number
  mrr: number
}

interface RecentSub {
  userId: string
  email: string
  name: string | null
  plan: string
  createdAt: string
}

interface BillingResponse {
  plans: PlanBreakdown[]
  totalMrr: number
  totalUsers: number
  recentSubscriptions: RecentSub[]
}

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 29,
  business: 99,
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-800 text-gray-300',
  pro: 'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  business: 'bg-purple-900/50 text-purple-300 border-purple-800',
}

function formatMrr(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

export default function AdminBillingPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading } = useApi<BillingResponse>('/api/admin/billing', token)

  const plans = data?.plans ?? []
  const totalMrr = data?.totalMrr ?? 0
  const totalUsers = data?.totalUsers ?? 0
  const recentSubs = data?.recentSubscriptions ?? []

  const paidUsers = plans.filter((p) => p.plan !== 'free').reduce((acc, p) => acc + p.count, 0)
  const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : '0.0'

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">Billing Admin</h1>
        <p className="text-gray-500 text-sm">Revenue overview and subscription breakdown</p>
      </div>

      {/* MRR headline */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'MRR', value: formatMrr(totalMrr), sub: 'Monthly recurring revenue', color: 'text-green-400' },
            { label: 'ARR', value: formatMrr(totalMrr * 12), sub: 'Annualised', color: 'text-green-300' },
            { label: 'Paid users', value: paidUsers.toLocaleString(), sub: `${conversionRate}% conversion`, color: 'text-indigo-400' },
            { label: 'Total users', value: totalUsers.toLocaleString(), sub: 'All plans', color: 'text-white' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">{label}</p>
              <p className={`text-3xl font-extrabold ${color} tabular-nums`}>{value}</p>
              <p className="text-gray-500 text-xs mt-1">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Plan breakdown */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan breakdown</p>
          </div>
          {loading ? (
            <div className="px-5 py-4 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {['business', 'pro', 'free'].map((plan) => {
                const row = plans.find((p) => p.plan === plan)
                const count = row?.count ?? 0
                const mrr = row?.mrr ?? 0
                const barPct = totalUsers > 0 ? (count / totalUsers) * 100 : 0
                return (
                  <div key={plan} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border ${PLAN_COLORS[plan] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {plan}
                        </span>
                        <span className="text-gray-400 text-xs">{count.toLocaleString()} users</span>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm font-bold tabular-nums">{mrr > 0 ? formatMrr(mrr) : '—'}</p>
                        <p className="text-gray-600 text-xs">{PLAN_PRICES[plan] ? `$${PLAN_PRICES[plan]}/mo each` : 'Free'}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${plan === 'business' ? 'bg-purple-500' : plan === 'pro' ? 'bg-indigo-500' : 'bg-gray-600'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <p className="text-gray-600 text-xs mt-1">{barPct.toFixed(1)}% of all users</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent subscriptions */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent paid subscriptions</p>
          </div>
          {loading ? (
            <div className="divide-y divide-gray-800">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="h-4 bg-gray-800 rounded animate-pulse mb-1 w-48" />
                  <div className="h-3 bg-gray-800 rounded animate-pulse w-32" />
                </div>
              ))}
            </div>
          ) : recentSubs.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">No paid subscriptions yet</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {recentSubs.map((sub) => (
                <div key={sub.userId} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{sub.name || sub.email}</p>
                    {sub.name && <p className="text-gray-500 text-xs">{sub.email}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border ${PLAN_COLORS[sub.plan] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {sub.plan}
                    </span>
                    <span className="text-gray-600 text-xs whitespace-nowrap">
                      {new Date(sub.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pricing reference */}
      <div className="mt-5 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pricing reference</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Plan', 'Monthly price', 'Annual price', 'MRR per user', 'ARR per user'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { plan: 'free', monthly: 0, annual: 0 },
                { plan: 'pro', monthly: 29, annual: 290 },
                { plan: 'business', monthly: 99, annual: 990 },
              ].map(({ plan, monthly, annual }) => (
                <tr key={plan} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border ${PLAN_COLORS[plan] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {plan}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white font-mono text-xs">{monthly > 0 ? `$${monthly}` : 'Free'}</td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{annual > 0 ? `$${annual}` : '—'}</td>
                  <td className="px-5 py-3 text-green-400 font-mono text-xs font-semibold">{monthly > 0 ? `$${monthly}` : '—'}</td>
                  <td className="px-5 py-3 text-green-300 font-mono text-xs font-semibold">{annual > 0 ? `$${annual}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
