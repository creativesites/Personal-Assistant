'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Smartphone, CreditCard } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'

// Live-fetched from the DB-backed catalog (docs/PRICING_PAYMENTS_PLAN.md §2/§9)
// instead of a hardcoded PLANS array — /billing and /admin/payments read the
// exact same subscription_plans table.

const PENDING_PLAN_STORAGE_KEY = 'zuri_pending_plan_id'

interface Plan {
  id: string
  key: string
  name: string
  priceNgwee: number
  priceFormatted: string
  durationDays: number
  messagesPerDay: number
  aiRepliesPerDay: number
  proactiveNudgesPerDay: number
}

const PLAN_COPY: Record<string, { description: string; features: string[]; badge?: string; highlight?: boolean }> = {
  daily_pass: {
    description: 'Try Zuri for a day — full access, no commitment.',
    features: ['WhatsApp inbox & AI reply suggestions', 'Contact profiles & history', 'Relationship health scores'],
  },
  weekly_pass: {
    description: 'A week of Zuri for freelancers between projects.',
    features: ['Everything in the Daily Pass', 'Higher daily AI limits', 'Smart inbox'],
  },
  monthly_personal: {
    description: 'For individuals and freelancers who want to stay on top of their conversations.',
    features: [
      'Unlimited contacts', 'AI reply suggestions', 'Contact profiles & history',
      'Daily follow-up reminders', 'Relationship health scores', 'Smart inbox',
    ],
  },
  monthly_business: {
    description: 'For growing businesses that need automation and a shared team inbox.',
    badge: 'Most popular',
    highlight: true,
    features: [
      'Everything in Personal', 'Lead scoring & pipeline', 'AI sales & support agents',
      'Broadcast campaigns', 'Revenue analytics', 'Automation rules',
    ],
  },
  monthly_enterprise: {
    description: 'For larger teams that need custom workflows and dedicated support.',
    features: [
      'Everything in Business', 'Unlimited AI usage', 'Custom AI agents',
      'CRM & API integrations', 'Dedicated account manager', 'Priority support',
    ],
  },
}

const FAQS = [
  {
    q: 'Can I change plans later?',
    a: 'Yes. Subscribe to a new plan any time from Billing — your current plan keeps working until the new one is confirmed.',
  },
  {
    q: 'Is there a free trial?',
    a: 'New accounts get 30 days of Monthly Personal limits automatically. No credit card required to get started.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept Airtel Money and MTN MoMo. Send the exact amount with your reference code and an admin confirms it — usually within an hour.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'We\'ll remind you before your trial expires. If you don\'t subscribe to a paid plan, your account moves to the Free tier — your data is never deleted.',
  },
  {
    q: 'Is my data safe if I cancel?',
    a: 'Your data remains accessible after cancellation. You can export everything from Settings.',
  },
  {
    q: 'Do you offer discounts for nonprofits or schools?',
    a: 'Yes. Contact us and we\'ll work out a plan that fits your budget.',
  },
]

function durationLabel(days: number): string {
  if (days === 1) return '/day'
  if (days === 7) return '/week'
  return '/month'
}

export default function PricingPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  useEffect(() => {
    apiClient<{ plans: Plan[] }>('/api/subscription-plans')
      .then((data) => setPlans(data.plans.filter((p) => p.key !== 'free')))
      .catch(() => setLoadError(true))
  }, [])

  const handleSubscribe = async (plan: Plan) => {
    if (!isSignedIn) {
      window.localStorage.setItem(PENDING_PLAN_STORAGE_KEY, plan.id)
      router.push('/register')
      return
    }
    if (!token) return
    setSubscribing(plan.id)
    setSubscribeError(null)
    try {
      await apiClient('/api/subscriptions/checkout', {
        method: 'POST', token, body: JSON.stringify({ planId: plan.id }),
      })
      router.push('/billing')
    } catch (e) {
      setSubscribeError(e instanceof ApiError ? e.message : 'Could not start checkout')
      setSubscribing(null)
    }
  }

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-white py-16 md:py-24 px-4 md:px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">Pricing</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
            Simple, honest pricing
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            Start free for 30 days. Upgrade when your business is ready. No surprises.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 md:pb-28 px-4 md:px-6">
        {subscribeError && (
          <div className="max-w-5xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 text-center">
            {subscribeError}
          </div>
        )}
        {loadError && (
          <p className="max-w-5xl mx-auto mb-6 text-center text-sm text-red-500">Could not load plans — please refresh.</p>
        )}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
          {(plans ?? []).map((plan) => {
            const copy = PLAN_COPY[plan.key] ?? { description: '', features: [] }
            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 flex flex-col relative ${
                  copy.highlight
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 shadow-xl shadow-indigo-200/50'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                {copy.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-400 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      {copy.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${copy.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-3">
                    <span className={`text-3xl font-extrabold ${copy.highlight ? 'text-white' : 'text-gray-900'}`}>
                      {plan.priceFormatted}
                    </span>
                    <span className={`text-sm mb-1 ${copy.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                      {durationLabel(plan.durationDays)}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${copy.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
                    {copy.description}
                  </p>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {copy.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 ${copy.highlight ? 'text-indigo-300' : 'text-indigo-500'}`} />
                      <span className={copy.highlight ? 'text-indigo-100' : 'text-gray-600'}>{feature}</span>
                    </li>
                  ))}
                  <li className={`text-xs pt-2 border-t ${copy.highlight ? 'border-indigo-400 text-indigo-200' : 'border-gray-100 text-gray-400'}`}>
                    {plan.messagesPerDay >= 999999 ? 'Unlimited' : plan.messagesPerDay} messages/day ·{' '}
                    {plan.aiRepliesPerDay >= 999999 ? 'unlimited' : plan.aiRepliesPerDay} AI replies/day
                  </li>
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={subscribing === plan.id}
                  className={`block text-center py-3.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${
                    copy.highlight
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {subscribing === plan.id ? 'Starting…' : 'Subscribe'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Payment methods */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-4">We accept</p>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
              <Smartphone className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-semibold text-gray-700">Airtel Money</span>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
              <CreditCard className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">MTN MoMo</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-10 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group bg-white rounded-2xl border border-gray-100 shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between p-6 font-semibold text-gray-800 list-none">
                  {faq.q}
                  <span className="ml-4 flex-shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180">
                    ▼
                  </span>
                </summary>
                <div className="px-6 pb-6">
                  <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-20 px-4 md:px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            Ready to make your WhatsApp work for you?
          </h2>
          <p className="text-gray-500 mb-8">
            30‑day free trial on all plans. No credit card required.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 text-base"
          >
            Start your free trial
          </Link>
        </div>
      </section>
    </div>
  )
}
