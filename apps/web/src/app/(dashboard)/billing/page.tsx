'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { ModeBadge, PageHeader, SkeletonCard } from '@/components/ui'

interface BillingData {
  plan: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  usage: {
    contacts: { used: number; limit: number | null }
    messages: { used: number; limit: number | null }
    aiSuggestions: { used: number; limit: number | null }
  }
  invoices?: Array<{
    id: string
    amount: number
    currency: string
    status: string
    date: string
    pdfUrl?: string
  }>
}

interface PlanFeature {
  label: string
  free: boolean | string
  pro: boolean | string
  business: boolean | string
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: 'WhatsApp inbox',            free: true,     pro: true,        business: true },
  { label: 'Contacts tracked',          free: '50',     pro: '500',       business: 'Unlimited' },
  { label: 'AI reply drafts',           free: '10/day', pro: 'Unlimited', business: 'Unlimited' },
  { label: 'Proactive suggestions',     free: '5/day',  pro: 'Unlimited', business: 'Unlimited' },
  { label: 'Relationship health',       free: false,    pro: true,        business: true },
  { label: 'Lead scoring',             free: false,    pro: false,       business: true },
  { label: 'Automation rules',         free: false,    pro: '3 rules',   business: 'Unlimited' },
  { label: 'Analytics',                free: 'Basic',  pro: 'Full',      business: 'Full + Export' },
  { label: 'AI Advisor chat',          free: false,    pro: true,        business: true },
  { label: 'Hybrid mode',              free: false,    pro: true,        business: true },
  { label: 'Priority support',         free: false,    pro: false,       business: true },
]

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === false) return <span className="text-gray-300">—</span>
  if (value === true) return (
    <svg className="w-4 h-4 text-green-500 mx-auto" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
  return <span className="text-xs text-gray-600">{value}</span>
}

function UsageBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isNearLimit = limit && pct >= 80
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {limit ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${isNearLimit ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full rounded-full bg-indigo-200 w-full" />
        )}
      </div>
      {!limit && <p className="text-[10px] text-gray-400 mt-0.5">Unlimited</p>}
    </div>
  )
}

export default function BillingPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')

  const { data, loading } = useApi<BillingData>('/api/billing', token)

  const currentPlan = data?.plan ?? 'free'
  const isFreePlan = currentPlan === 'free'

  const PLANS = [
    {
      key: 'free',
      name: 'Free',
      price: { monthly: 0, yearly: 0 },
      color: 'border-gray-200',
      headerBg: 'bg-gray-50',
      description: 'Perfect for trying Zuri',
    },
    {
      key: 'pro',
      name: 'Pro',
      price: { monthly: 29, yearly: 23 },
      color: 'border-indigo-300',
      headerBg: 'bg-indigo-600',
      description: 'For individuals & freelancers',
      popular: true,
    },
    {
      key: 'business',
      name: 'Business',
      price: { monthly: 79, yearly: 63 },
      color: 'border-violet-300',
      headerBg: 'bg-gradient-to-br from-indigo-600 to-violet-600',
      description: 'For teams & high-volume',
    },
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Billing" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Billing" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Current plan */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-200 font-medium uppercase tracking-wide">Current plan</p>
                  <p className="text-xl font-bold text-white mt-0.5 capitalize">{currentPlan}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  data?.status === 'active' ? 'bg-green-400/20 text-green-100' : 'bg-white/20 text-white'
                }`}>
                  {data?.status ?? 'Free'}
                </span>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                  {(session.data?.user.name || session.data?.user.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{session.data?.user.name || session.data?.user.email}</p>
                  <ModeBadge mode={session.data?.mode ?? 'business'} />
                </div>
              </div>
              {data?.currentPeriodEnd && (
                <p className="text-xs text-gray-500">
                  {data.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} {new Date(data.currentPeriodEnd).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Usage */}
          {data?.usage && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Usage this period</p>
              <div className="space-y-4">
                <UsageBar used={data.usage.contacts.used} limit={data.usage.contacts.limit} label="Contacts" />
                <UsageBar used={data.usage.messages.used} limit={data.usage.messages.limit} label="Messages analysed" />
                <UsageBar used={data.usage.aiSuggestions.used} limit={data.usage.aiSuggestions.limit} label="AI suggestions" />
              </div>
            </div>
          )}

          {/* Upgrade CTA (free plan) */}
          {isFreePlan && (
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-indigo-900 mb-1">Unlock Zuri Pro</p>
              <p className="text-xs text-indigo-700 mb-4">Get unlimited AI suggestions, full analytics, relationship health tracking, and more.</p>
              <button
                onClick={() => window.open('mailto:hello@zuri.ai?subject=Pro%20Plan%20Enquiry', '_blank')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Upgrade to Pro
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          )}

          {/* Plan comparison */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan comparison</p>
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                {(['monthly', 'yearly'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setBillingPeriod(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      billingPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {p === 'yearly' ? 'Yearly (−20%)' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium w-44">Feature</th>
                    {PLANS.map(plan => (
                      <th key={plan.key} className="px-3 py-3 text-center min-w-[80px]">
                        <p className={`text-xs font-bold ${currentPlan === plan.key ? 'text-indigo-600' : 'text-gray-700'}`}>
                          {plan.name}
                          {currentPlan === plan.key && (
                            <span className="ml-1 text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Current</span>
                          )}
                        </p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                          {plan.price[billingPeriod] === 0 ? 'Free' : `$${plan.price[billingPeriod]}/mo`}
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FEATURES.map((feature, i) => (
                    <tr key={feature.label} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
                      <td className="px-5 py-2.5 text-xs text-gray-600">{feature.label}</td>
                      <td className="px-3 py-2.5 text-center text-xs"><FeatureCell value={feature.free} /></td>
                      <td className="px-3 py-2.5 text-center text-xs"><FeatureCell value={feature.pro} /></td>
                      <td className="px-3 py-2.5 text-center text-xs"><FeatureCell value={feature.business} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoices */}
          {data?.invoices && data.invoices.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoices</p>
              </div>
              <div className="divide-y divide-gray-50">
                {data.invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm text-gray-900">{new Date(inv.date).toLocaleDateString([], { year: 'numeric', month: 'long' })}</p>
                      <p className="text-xs text-gray-400 capitalize">{inv.status}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        {(inv.amount / 100).toLocaleString('en-US', { style: 'currency', currency: inv.currency.toUpperCase() })}
                      </span>
                      {inv.pdfUrl && (
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
                          PDF ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center pb-2">
            Billing managed securely via Stripe · <a href="mailto:hello@zuri.ai" className="hover:underline">Contact support</a>
          </p>
        </div>
      </div>
    </div>
  )
}
