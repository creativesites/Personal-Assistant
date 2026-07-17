'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Smartphone, CreditCard, ArrowRight } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { GuidedPaymentModal, type GuidedPaymentPlan } from '@/app/(dashboard)/billing/_components/guided-payment-modal'

// Rebuilt against the real Zuri Membership Platform catalog (migration
// 0083, docs/MEMBERSHIP_PLATFORM_PLAN.md) — 5 plan families sellable across
// up to 4 billing cadences, a 7-day full-access trial, and the real guided
// mobile-money checkout (GuidedPaymentModal, same component /billing uses)
// instead of the old single-shot "subscribe and redirect" flow, which never
// matched this backend's actual checkout contract.

const PENDING_PLAN_STORAGE_KEY = 'zuri_pending_plan_id'

interface Plan {
  id: string
  key: string
  name: string
  priceNgwee: number
  priceFormatted: string
  priceNgweeByok: number | null
  priceByokFormatted: string | null
  planFamily: string | null
  billingPeriod: string | null
  isCustomPricing: boolean
  durationDays: number
  messagesPerDay: number
  aiRepliesPerDay: number
  proactiveNudgesPerDay: number
  documentsPerDay: number
}

const CADENCES: { key: string; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

const FAMILY_COPY: Record<string, { description: string; features: string[]; badge?: string; highlight?: boolean }> = {
  personal: {
    description: 'For individuals running their WhatsApp relationships and career growth from one place.',
    features: [
      'WhatsApp inbox & AI reply suggestions', 'Contact profiles & relationship health',
      'AI Advisor Companion', 'CV Studio, job search & interview prep', 'Career Radar',
    ],
  },
  professional: {
    description: 'For freelancers and solopreneurs who need a real business back office, not just a CRM.',
    badge: 'Most popular',
    highlight: true,
    features: [
      'Everything in Personal', 'Business OS: inventory, suppliers & purchase orders',
      'Quotations, invoices & contracts', 'Projects & deal pipeline', 'Zuri Business Manager Assistant',
    ],
  },
  business: {
    description: 'For growing teams that need automation, analytics, and multiple seats.',
    features: [
      'Everything in Professional', 'Team seats & shared inbox', 'Automation & scoped auto-send',
      'Revenue & operations analytics', 'Autonomous AI sales/support agents',
    ],
  },
}

const FAQS = [
  {
    q: 'How does the free trial work?',
    a: 'Every new account gets 7 days of full Business-tier access — every feature unlocked, no credit card required. After 7 days you choose a plan, or continue on the Free tier with limited daily AI usage.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'Airtel Money and MTN MoMo. You send the exact amount with your reference code, then confirm the details in-app — an admin matches and approves it, usually within 5–30 minutes.',
  },
  {
    q: 'What happens if my subscription lapses?',
    a: 'Zuri never hard-locks your account. You get a grace period with full access, then move to a read-only mode where you can still view and export everything — nothing is ever deleted.',
  },
  {
    q: 'What is the BYOK discount?',
    a: 'Bring your own AI provider API key (under Settings → Enterprise) and get 30% off — since your key covers the AI usage instead of ours.',
  },
  {
    q: 'Can I change plans or billing cadence later?',
    a: 'Yes, any time from Billing. Daily, weekly, monthly, and yearly cadences are all available on Personal, Professional, and Business — yearly gets you roughly 2 months free.',
  },
  {
    q: 'Do you offer student or nonprofit discounts?',
    a: 'Yes — verified students get 50% off Personal (monthly). Contact us for nonprofit and school pricing.',
  },
]

export default function PricingPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const session = useZuriSession()
  const token = session.data?.accessToken

  const { data: catalog, loading: catalogLoading } = useApi<{ plans: Plan[] }>('/api/subscription-plans', token)
  const { data: byokKeys } = useApi<{ keys: unknown[] }>('/api/byok', token)

  const [cadence, setCadence] = useState('monthly')
  const [guidedPlan, setGuidedPlan] = useState<GuidedPaymentPlan | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  const plans = useMemo(() => catalog?.plans ?? [], [catalog])
  const freePlan = plans.find((p) => p.planFamily === 'free')
  const enterprisePlan = plans.find((p) => p.planFamily === 'enterprise')

  const availableCadences = useMemo(() => {
    const periods = new Set(plans.filter((p) => p.planFamily && ['personal', 'professional', 'business'].includes(p.planFamily)).map((p) => p.billingPeriod))
    return CADENCES.filter((c) => periods.has(c.key))
  }, [plans])

  function planFor(family: string): Plan | undefined {
    return plans.find((p) => p.planFamily === family && p.billingPeriod === cadence)
      ?? plans.find((p) => p.planFamily === family)
  }

  function toGuidedPlan(plan: Plan): GuidedPaymentPlan {
    return {
      id: plan.id,
      name: plan.name,
      priceFormatted: plan.priceFormatted,
      priceNgweeByok: plan.priceNgweeByok,
      priceByokFormatted: plan.priceByokFormatted,
      billingPeriod: plan.billingPeriod,
    }
  }

  const handleChoose = async (plan: Plan) => {
    setSubscribeError(null)
    if (!isSignedIn) {
      window.localStorage.setItem(PENDING_PLAN_STORAGE_KEY, plan.id)
      router.push('/register')
      return
    }
    setGuidedPlan(toGuidedPlan(plan))
  }

  const handleFreeStart = () => {
    if (!isSignedIn) { router.push('/register'); return }
    router.push('/dashboard')
  }

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] py-16 md:py-24 px-4 md:px-6 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.22),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.18),transparent_30%)]" />
        <div className="relative max-w-2xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">Pricing</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-950 mb-4">
            Simple, honest pricing
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            7 days free, full access. Pick a plan that fits how you get paid — daily, weekly, monthly, or yearly.
          </p>

          {availableCadences.length > 1 && (
            <div className="inline-flex items-center gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-gray-200">
              {availableCadences.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCadence(c.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    cadence === c.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 md:pb-28 px-4 md:px-6">
        {subscribeError && (
          <div className="max-w-5xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 text-center">
            {subscribeError}
          </div>
        )}
        {!catalogLoading && plans.length === 0 && (
          <p className="max-w-5xl mx-auto mb-6 text-center text-sm text-red-500">Could not load plans — please refresh.</p>
        )}

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
          {/* Free */}
          {freePlan && (
            <div className="rounded-[1.75rem] p-6 flex flex-col bg-white border border-gray-200 shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest mb-2 text-gray-400">Free</p>
                <div className="flex items-end gap-1 mb-3">
                  <span className="text-3xl font-black tracking-tight text-gray-950">K0</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-500">
                  CRM, Inbox, Advisor, and Documents stay available forever — metered by limited daily AI usage.
                </p>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {['Contacts & Inbox', 'Limited AI replies/day', 'Limited documents/day', 'Limited proactive nudges/day'].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0 text-indigo-500" />
                    <span className="text-gray-600">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleFreeStart}
                className="block text-center py-3.5 rounded-2xl font-semibold text-sm transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Get started
              </button>
            </div>
          )}

          {(['personal', 'professional', 'business'] as const).map((family) => {
            const plan = planFor(family)
            const copy = FAMILY_COPY[family]
            if (!plan) return null
            return (
              <div
                key={family}
                className={`rounded-[1.75rem] p-6 flex flex-col relative ${
                  copy.highlight
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 shadow-xl shadow-indigo-500/25'
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
                    <span className={`text-3xl font-black tracking-tight ${copy.highlight ? 'text-white' : 'text-gray-950'}`}>
                      {plan.priceFormatted}
                    </span>
                    <span className={`text-sm mb-1 ${copy.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                      /{plan.billingPeriod ?? 'mo'}
                    </span>
                  </div>
                  {plan.priceNgweeByok !== null && (
                    <p className={`text-xs ${copy.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {plan.priceByokFormatted} with your own AI key (BYOK)
                    </p>
                  )}
                  <p className={`text-sm leading-relaxed mt-2 ${copy.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
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
                </ul>

                <button
                  onClick={() => handleChoose(plan)}
                  className={`block text-center py-3.5 rounded-2xl font-semibold text-sm transition-colors ${
                    copy.highlight
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  Choose {plan.name}
                </button>
              </div>
            )
          })}

          {/* Enterprise */}
          {enterprisePlan && (
            <div className="rounded-[1.75rem] p-6 flex flex-col bg-slate-950 text-white shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest mb-2 text-slate-400">Enterprise</p>
                <div className="flex items-end gap-1 mb-3">
                  <span className="text-2xl font-black tracking-tight text-white">Custom</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-300">
                  For larger teams that need custom workflows, integrations, and dedicated support.
                </p>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {['Everything in Business', 'Unlimited seats', 'Custom AI agents', 'CRM & API integrations', 'Dedicated account manager'].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0 text-slate-300" />
                    <span className="text-slate-200">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className="block text-center py-3.5 rounded-2xl font-semibold text-sm transition-colors bg-white text-slate-950 hover:bg-gray-100"
              >
                Contact us
              </Link>
            </div>
          )}
        </div>

        {/* Payment methods */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-4">We accept</p>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm">
              <Smartphone className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-semibold text-gray-700">Airtel Money</span>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm">
              <CreditCard className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">MTN MoMo</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black tracking-tight text-gray-950 mb-10 text-center">
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
          <h2 className="text-3xl font-black tracking-tight text-gray-950 mb-4">
            Ready to get started?
          </h2>
          <p className="text-gray-500 mb-8">
            7-day free trial, full access. No credit card required.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/25 text-base"
          >
            Start your free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <GuidedPaymentModal
        plan={guidedPlan}
        token={token}
        hasByokKey={(byokKeys?.keys.length ?? 0) > 0}
        onClose={() => setGuidedPlan(null)}
        onDone={() => { setGuidedPlan(null); router.push('/billing') }}
      />
    </div>
  )
}
