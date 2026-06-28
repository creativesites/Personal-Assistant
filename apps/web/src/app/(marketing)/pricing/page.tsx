'use client'

import { useState } from 'react'
import Link from 'next/link'

const PLANS = [
  {
    name: 'Starter',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'For individuals getting started with relationship management.',
    features: [
      { label: 'Up to 50 contacts', included: true },
      { label: 'Basic health scores', included: true },
      { label: '5 nudges per day', included: true },
      { label: 'Smart inbox', included: true },
      { label: 'AI reply drafts', included: false },
      { label: 'Voice matching', included: false },
      { label: 'Calendar intelligence', included: false },
      { label: 'Analytics dashboard', included: false },
      { label: 'Automation rules', included: false },
      { label: 'Priority support', included: false },
    ],
    cta: 'Start free',
    href: '/register',
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro',
    monthlyPrice: 19,
    yearlyPrice: 15,
    description: 'For freelancers and solopreneurs serious about client relationships.',
    features: [
      { label: 'Unlimited contacts', included: true },
      { label: 'Full health scoring', included: true },
      { label: '25 nudges per day', included: true },
      { label: 'Smart inbox', included: true },
      { label: 'AI reply drafts', included: true },
      { label: 'Voice matching', included: true },
      { label: 'Calendar intelligence', included: true },
      { label: 'Analytics dashboard', included: true },
      { label: 'Automation rules', included: false },
      { label: 'Priority support', included: false },
    ],
    cta: 'Start 14-day trial',
    href: '/register',
    highlight: true,
    badge: 'Most popular',
  },
  {
    name: 'Business',
    monthlyPrice: 49,
    yearlyPrice: 39,
    description: 'For teams and SMBs that live on WhatsApp.',
    features: [
      { label: 'Unlimited contacts', included: true },
      { label: 'Full health scoring', included: true },
      { label: 'Unlimited nudges', included: true },
      { label: 'Smart inbox', included: true },
      { label: 'AI reply drafts', included: true },
      { label: 'Voice matching', included: true },
      { label: 'Calendar intelligence', included: true },
      { label: 'Analytics dashboard', included: true },
      { label: 'Automation rules', included: true },
      { label: 'Priority support', included: true },
    ],
    cta: 'Start 14-day trial',
    href: '/register',
    highlight: false,
    badge: null,
  },
]

const FAQS = [
  {
    q: 'Can I change plans later?',
    a: 'Yes. Upgrade or downgrade at any time from your billing settings. Changes take effect at the next billing cycle.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Pro and Business plans come with a 14-day free trial. No credit card required to start.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit/debit cards via Stripe. Mobile money support for MTN, Airtel, and Zamtel is coming soon.',
  },
  {
    q: 'What happens when I exceed the contact limit on Starter?',
    a: 'Zuri will prompt you to upgrade. Your existing contacts and data are never deleted — you just won\'t be able to add new ones until you upgrade.',
  },
  {
    q: 'Is my data safe if I cancel?',
    a: 'Your data remains accessible for 30 days after cancellation. You can export everything from Settings before your account closes.',
  },
]

export default function PricingPage() {
  const [yearly, setYearly] = useState(false)

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 md:py-20 px-4 md:px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">Pricing</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-600 mb-8">Start free. Upgrade when you\'re ready. No surprises.</p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                !yearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                yearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              Yearly
              <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-7 flex flex-col relative ${
                plan.highlight
                  ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 shadow-xl'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-400 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p className={`text-sm font-bold mb-2 ${plan.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-3">
                  <span className={`text-5xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.monthlyPrice === 0 ? 'Free' : `$${yearly ? plan.yearlyPrice : plan.monthlyPrice}`}
                  </span>
                  {plan.monthlyPrice > 0 && (
                    <span className={`text-sm mb-2 ${plan.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                      /month{yearly ? ', billed yearly' : ''}
                    </span>
                  )}
                </div>
                <p className={`text-sm ${plan.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>{plan.description}</p>
              </div>

              <ul className="space-y-3 flex-1 mb-7">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-center gap-2.5 text-sm">
                    {feature.included ? (
                      <svg className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? 'text-indigo-300' : 'text-indigo-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 flex-shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className={`${!feature.included ? 'opacity-40' : ''} ${plan.highlight ? 'text-indigo-100' : 'text-gray-700'}`}>
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block text-center py-3.5 rounded-xl font-bold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-10 text-center">Frequently asked questions</h2>
          <div className="space-y-5">
            {FAQS.map((faq) => (
              <div key={faq.q} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile money note */}
      <section className="py-12 px-4 md:px-6">
        <div className="max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <span className="text-2xl mb-3 block">📱</span>
          <h3 className="font-bold text-gray-900 mb-2">Mobile money coming soon</h3>
          <p className="text-sm text-gray-600">
            MTN MoMo, Airtel Money, and Zamtel Kwacha payment support is in progress. Sign up and we&apos;ll notify you when it&apos;s available in your region.
          </p>
        </div>
      </section>
    </div>
  )
}
