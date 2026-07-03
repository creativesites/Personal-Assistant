'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Smartphone, CreditCard } from 'lucide-react'

const PLANS = [
  {
    name: 'Personal',
    monthlyPrice: 200,
    yearlyPrice: 160,
    description: 'For individuals and freelancers who want to stay on top of their conversations.',
    features: [
      'Unlimited contacts',
      'AI reply suggestions',
      'Contact profiles & history',
      'Daily follow‑up reminders',
      'Relationship health scores',
      'Smart inbox',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlight: false,
    badge: null,
  },
  {
    name: 'Business',
    monthlyPrice: 400,
    yearlyPrice: 320,
    description: 'For growing businesses that need automation and a shared team inbox.',
    features: [
      'Everything in Personal',
      'Lead scoring & pipeline',
      'AI sales & support agents',
      'Team inbox (up to 5 users)',
      'Broadcast campaigns',
      'Revenue analytics',
      'Automation rules',
      'Priority support',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlight: true,
    badge: 'Most popular',
  },
  {
    name: 'Enterprise',
    monthlyPrice: 1800,
    yearlyPrice: 1440,
    description: 'For larger teams that need custom workflows, integrations, and dedicated support.',
    features: [
      'Everything in Business',
      'Unlimited team members',
      'Custom AI agents',
      'CRM & API integrations',
      'White‑label option',
      'Dedicated account manager',
      'Custom data retention',
      'SLA & uptime guarantee',
    ],
    cta: 'Contact us',
    href: '/contact',
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
    q: 'Is there a free trial?',
    a: 'All plans come with a 30‑day free trial. No credit card required to get started.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept Airtel Money, MTN MoMo, and major credit/debit cards. More options coming soon.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'We\'ll remind you before your trial expires. If you choose not to continue, your account simply moves to the Free tier — your data is never deleted.',
  },
  {
    q: 'Is my data safe if I cancel?',
    a: 'Your data remains accessible for 30 days after cancellation. You can export everything from Settings before your account closes.',
  },
  {
    q: 'Do you offer discounts for nonprofits or schools?',
    a: 'Yes. Contact us and we\'ll work out a plan that fits your budget.',
  },
]

export default function PricingPage() {
  const [yearly, setYearly] = useState(false)

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
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
                yearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              Yearly
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 md:pb-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-7 flex flex-col relative ${
                plan.highlight
                  ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 shadow-xl shadow-indigo-200/50'
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
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-3">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    K{yearly ? plan.yearlyPrice : plan.monthlyPrice}
                  </span>
                  <span className={`text-sm mb-1.5 ${plan.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                    /month{yearly ? ', billed yearly' : ''}
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${plan.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 flex-1 mb-7">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm">
                    <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? 'text-indigo-300' : 'text-indigo-500'}`} />
                    <span className={plan.highlight ? 'text-indigo-100' : 'text-gray-600'}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block text-center py-3.5 rounded-xl font-semibold text-sm transition-colors ${
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
