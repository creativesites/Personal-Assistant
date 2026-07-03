import Link from 'next/link'
import {
  MessageSquare, Zap, Users, Bell, ShieldCheck, ArrowRight, Check,
  ShoppingBag, Wrench, Stethoscope, Building2, UtensilsCrossed,
  Plane, Scale, GraduationCap, Smartphone, CreditCard,
} from 'lucide-react'
import { MarketingNav } from './(marketing)/_components/MarketingNav'
import { MarketingFooter } from './(marketing)/_components/MarketingFooter'

const BENEFITS = [
  {
    icon: Zap,
    title: 'Reply in seconds',
    description: 'Zuri drafts replies that sound exactly like you — so your customers never wait.',
  },
  {
    icon: Bell,
    title: 'Never forget a follow‑up',
    description: 'Automatic reminders when a customer goes quiet or a payment is due.',
  },
  {
    icon: Users,
    title: 'Know every customer',
    description: 'Customer profiles, lead scores, and conversation history — built automatically.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data is private',
    description: 'Zuri never sends a message without your approval. Conversations are encrypted.',
  },
]

const STEPS = [
  {
    step: '1',
    title: 'Connect your WhatsApp',
    description: 'Scan a QR code. It takes less than a minute — no technical skills needed.',
  },
  {
    step: '2',
    title: 'Zuri learns your business',
    description: 'It reads your chats, understands your customers, and builds profiles automatically.',
  },
  {
    step: '3',
    title: 'Reply smarter, close faster',
    description: 'Get AI reply drafts, automatic follow‑ups, and reminders that help you sell more.',
  },
]

const INDUSTRIES = [
  { label: 'Online Stores', href: '/retail', icon: ShoppingBag },
  { label: 'Mechanics', href: '/mechanics', icon: Wrench },
  { label: 'Clinics', href: '/clinics', icon: Stethoscope },
  { label: 'Real Estate', href: '/real-estate', icon: Building2 },
  { label: 'Restaurants', href: '/restaurants', icon: UtensilsCrossed },
  { label: 'Travel', href: '/travel', icon: Plane },
  { label: 'Legal', href: '/legal', icon: Scale },
  { label: 'Schools', href: '/schools', icon: GraduationCap },
]

const PRICING = [
  {
    name: 'Personal',
    price: 'K200',
    period: '/month',
    description: 'For individuals and freelancers who want to stay on top of their conversations.',
    features: [
      'Unlimited contacts',
      'AI reply suggestions',
      'Contact profiles & history',
      'Daily follow‑up reminders',
      'Relationship health scores',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Business',
    price: 'K400',
    period: '/month',
    description: 'For growing businesses that need automation and a shared team inbox.',
    features: [
      'Everything in Personal',
      'Lead scoring & pipeline',
      'AI sales & support agents',
      'Team inbox (up to 5 users)',
      'Broadcast campaigns',
      'Revenue analytics',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'K1,800',
    period: '/month',
    description: 'For larger teams that need custom workflows, integrations, and dedicated support.',
    features: [
      'Everything in Business',
      'Unlimited team members',
      'Custom AI agents',
      'CRM & API integrations',
      'White‑label option',
      'Dedicated account manager',
    ],
    cta: 'Contact us',
    href: '/contact',
    highlight: false,
  },
]

function InboxMockup() {
  const chats = [
    { name: 'Grace Jerseys', preview: 'Do you have the red ones in stock?', time: '2m', unread: true },
    { name: 'Peter Mechanic', preview: 'When can you service my car?', time: '12m', unread: true },
    { name: 'Mary Clinic', preview: 'Thank you! The appointment is confirmed.', time: '1h', unread: false },
  ]

  return (
    <div className="relative mx-auto w-full max-w-sm select-none">
      <div className="absolute inset-0 -z-10 blur-2xl opacity-20 bg-indigo-300 rounded-3xl scale-105" />
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 ring-1 ring-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <img
            src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png"
            alt="Zuri"
            className="w-6 h-6 rounded-md"
          />
          <p className="text-sm font-semibold text-gray-700">Zuri Inbox</p>
          <div className="flex-1" />
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>

        {/* Chat list */}
        <div className="divide-y divide-gray-50">
          {chats.map((chat, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 ${chat.unread ? 'bg-indigo-50/50' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-indigo-600">{chat.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{chat.name}</p>
                <p className="text-xs text-gray-500 truncate">{chat.preview}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray-400">{chat.time}</span>
                {chat.unread && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
              </div>
            </div>
          ))}
        </div>

        {/* AI suggestion card */}
        <div className="m-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100">
          <p className="text-[10px] font-semibold text-indigo-600 mb-1">⚡ AI Suggestion</p>
          <p className="text-[11px] text-gray-700 leading-snug">Grace asked about stock — here&apos;s a draft reply:</p>
          <p className="text-[11px] text-gray-500 italic mt-1 leading-snug">&ldquo;Hi Grace! Yes, we have the red ones. Would you like me to reserve one for you?&rdquo;</p>
          <div className="mt-2 flex gap-2">
            <div className="bg-indigo-600 text-white text-[10px] px-3 py-1 rounded-full font-medium">Send</div>
            <div className="bg-white text-gray-500 text-[10px] px-3 py-1 rounded-full border border-gray-200">Edit</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingNav />

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white py-16 md:py-24 lg:py-32 px-4 md:px-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl -z-10" />
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-medium text-gray-600 mb-6 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                Trusted by businesses across Zambia
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
                Your customers are on WhatsApp.
                <br />
                <span className="text-indigo-600">Reply smarter, sell more.</span>
              </h1>

              <p className="text-lg md:text-xl text-gray-500 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
                Zuri helps you respond to customers faster with AI reply suggestions that sound like you.
                Never lose a lead because you were too busy to type.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-200 text-base"
                >
                  Start free — no credit card
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
                >
                  See how it works
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start text-sm text-gray-500">
                {['30-day free trial', 'No credit card', 'Cancel anytime'].map(item => (
                  <div key={item} className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 w-full max-w-sm mx-auto lg:mx-0">
              <InboxMockup />
            </div>
          </div>
        </section>

        {/* ── Benefits ─────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Stop losing customers to slow replies
              </h2>
              <p className="text-gray-500 max-w-xl mx-auto text-lg">
                Running a business on WhatsApp is hard when you&apos;re one person. Zuri gives you an AI assistant that handles the typing so you can focus on selling.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {BENEFITS.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <div key={benefit.title} className="flex gap-4 p-6 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 mb-1">{benefit.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{benefit.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple setup</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Ready in under 2 minutes
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {STEPS.map((step) => (
                <div key={step.step} className="bg-white rounded-2xl border border-gray-100 p-7 shadow-sm text-center">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm mx-auto mb-4">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Start free. Upgrade when you&apos;re ready.
              </h2>
              <p className="text-gray-500 mt-4">30-day free trial on all plans. No credit card required.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
              {PRICING.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-7 flex flex-col ${
                    plan.highlight
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 shadow-xl shadow-indigo-200/50'
                      : 'bg-white border border-gray-200 shadow-sm'
                  }`}
                >
                  <div className="mb-6">
                    <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1 mb-3">
                      <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                        {plan.price}
                      </span>
                      <span className={`text-sm mb-1.5 ${plan.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                        {plan.period}
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
            <div className="mt-10 text-center">
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
          </div>
        </section>

        {/* ── Industries ───────────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Industries</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Built for how you sell
              </h2>
              <p className="text-gray-500 mt-4 max-w-xl mx-auto">
                Whether you run a boutique, a clinic, or a law firm — Zuri adapts to how you talk to customers.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon
                return (
                  <Link
                    key={industry.href}
                    href={industry.href}
                    className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 transition-all duration-200 group shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 transition-all duration-200">
                      <Icon className="w-5 h-5 text-indigo-600 group-hover:text-white transition-colors duration-200" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 text-center leading-tight">{industry.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-5 leading-tight">
              Every slow reply
              <br />
              <span className="text-indigo-600">is a lost customer.</span>
            </h2>
            <p className="text-gray-500 text-lg mb-8 leading-relaxed">
              Join businesses across Zambia using Zuri to respond faster, close more deals, and keep every customer happy.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-xl shadow-indigo-200 text-base"
            >
              Start your free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-gray-400 text-sm mt-4">30-day trial · No credit card · Cancel anytime</p>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  )
}
