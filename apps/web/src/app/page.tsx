import Link from 'next/link'
import {
  MessageSquare, Bot, TrendingUp, Users, BarChart3, Radio,
  Zap, Calendar, Smartphone, Brain, ChevronRight, Check,
  ShoppingBag, Wrench, Stethoscope, Building2, UtensilsCrossed,
  Plane, Scale, GraduationCap, ArrowRight,
} from 'lucide-react'
import { MarketingNav } from './(marketing)/_components/MarketingNav'
import { MarketingFooter } from './(marketing)/_components/MarketingFooter'

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Smart Inbox',
    description: 'Every conversation ranked by urgency, sentiment, and deal stage. Always know which customer needs you right now.',
  },
  {
    icon: TrendingUp,
    title: 'Lead Scoring',
    description: 'AI detects buying signals in every message. Hot leads rise to the top automatically — no manual tagging.',
  },
  {
    icon: Bot,
    title: 'AI Agents',
    description: 'Deploy autonomous agents that handle enquiries, qualify leads, and follow up 24/7 — on your behalf.',
  },
  {
    icon: Radio,
    title: 'Broadcast Campaigns',
    description: 'Send personalised bulk messages to customer segments. Track delivery, replies, and conversion in real time.',
  },
  {
    icon: Zap,
    title: 'Voice-Matched Drafts',
    description: 'AI reply suggestions that sound exactly like you — learned from your own writing style and conversation history.',
  },
  {
    icon: BarChart3,
    title: 'Revenue Analytics',
    description: 'Full funnel from first message to closed deal. See which conversations, agents, and campaigns drive revenue.',
  },
]

const STEPS = [
  {
    step: '01',
    icon: Smartphone,
    title: 'Connect WhatsApp',
    description: 'Scan one QR code. Zuri connects in under 60 seconds — no app download, no developer, no configuration.',
  },
  {
    step: '02',
    icon: Brain,
    title: 'AI maps your pipeline',
    description: 'Every conversation is analysed in real time. Leads are scored, contacts profiled, and deals tracked automatically.',
  },
  {
    step: '03',
    icon: TrendingUp,
    title: 'Close more, faster',
    description: 'Get AI reply drafts, automated follow-ups, and daily deal alerts. Your team replies in seconds instead of hours.',
  },
]

const TESTIMONIALS = [
  {
    quote: "I reconnected with 3 clients I'd completely lost track of. One turned into a $12,000 project two weeks later.",
    name: 'David M.',
    role: 'Freelance Designer',
    location: 'Lusaka',
    initials: 'DM',
  },
  {
    quote: "Zuri flagged a customer who hadn't messaged in 6 weeks. I reached out and saved the account. That alone paid for a year.",
    name: 'Chanda N.',
    role: 'Online Boutique Owner',
    location: 'Lusaka',
    initials: 'CN',
  },
  {
    quote: "Our reply rate went from 40% to 87%. Clients feel like we know them personally. Deals close faster.",
    name: 'Tendai R.',
    role: 'Real Estate Agent',
    location: 'Harare',
    initials: 'TR',
  },
]

const INDUSTRIES = [
  { label: 'Online Retail',  href: '/retail',      icon: ShoppingBag },
  { label: 'Mechanics',      href: '/mechanics',   icon: Wrench },
  { label: 'Clinics',        href: '/clinics',     icon: Stethoscope },
  { label: 'Real Estate',    href: '/real-estate', icon: Building2 },
  { label: 'Restaurants',    href: '/restaurants', icon: UtensilsCrossed },
  { label: 'Travel',         href: '/travel',      icon: Plane },
  { label: 'Legal',          href: '/legal',       icon: Scale },
  { label: 'Schools',        href: '/schools',     icon: GraduationCap },
]

const PRICING = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For individuals and micro-businesses getting started.',
    features: ['Up to 50 contacts', 'Smart inbox', 'AI reply drafts', '5 nudges per day'],
    cta: 'Start free',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For solopreneurs and freelancers who live in WhatsApp.',
    features: ['Unlimited contacts', 'Lead scoring', 'Broadcast campaigns', 'Full analytics', 'Voice profile', 'Calendar intelligence'],
    cta: 'Start 30-day trial',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Business',
    price: '$99',
    period: '/month',
    description: 'For growing teams that need automation and shared inbox.',
    features: ['Everything in Pro', 'AI Agents', 'Team inbox', 'Priority support', 'Webhooks & API', 'CRM integrations'],
    cta: 'Start 30-day trial',
    href: '/register',
    highlight: false,
  },
]

function DashboardMockup() {
  const leads = [
    { name: 'Amara Diallo', company: 'Kibo Ventures', stage: 'Proposal', score: 91, hot: true },
    { name: 'Kofi Mensah',  company: 'GreenBuild Ltd', stage: 'Qualified', score: 74, hot: false },
    { name: 'Zanele Dube',  company: 'Sunrise Clinic', stage: 'Lead', score: 58, hot: false },
  ]

  return (
    <div className="relative mx-auto w-full max-w-md select-none">
      {/* Glow */}
      <div className="absolute inset-0 -z-10 blur-3xl opacity-20 bg-indigo-400 rounded-3xl scale-105" />

      {/* Browser chrome */}
      <div className="bg-gray-900 rounded-2xl shadow-2xl shadow-gray-900/40 ring-1 ring-white/10 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-3 bg-gray-800 rounded-md px-3 py-1">
            <p className="text-[10px] text-gray-500 font-mono">app.zuri.ai/inbox</p>
          </div>
        </div>

        {/* App content */}
        <div className="flex h-64">
          {/* Mini sidebar */}
          <div className="w-12 bg-gray-950 flex flex-col items-center py-3 gap-3 border-r border-gray-800">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <img 
              src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri.png" 
              alt="Zuri Logo" 
              className="w-full h-full object-contain"
            />
            </div>
            {[MessageSquare, TrendingUp, Users, BarChart3].map((Icon, i) => (
              <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-indigo-600/20' : 'hover:bg-gray-800'}`}>
                <Icon className={`w-4 h-4 ${i === 0 ? 'text-indigo-400' : 'text-gray-600'}`} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-white">Inbox</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-gray-400">3 AI replies ready</span>
              </div>
            </div>

            {/* Lead rows */}
            <div className="divide-y divide-gray-800">
              {leads.map((lead, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 ? 'bg-indigo-950/40' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-indigo-400">{lead.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-200 truncate">{lead.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{lead.company}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${
                      lead.stage === 'Proposal' ? 'bg-purple-900/60 text-purple-300' :
                      lead.stage === 'Qualified' ? 'bg-blue-900/60 text-blue-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>{lead.stage}</span>
                    <span className={`text-[10px] font-bold tabular-nums ${lead.score >= 80 ? 'text-green-400' : lead.score >= 60 ? 'text-yellow-400' : 'text-gray-500'}`}>
                      {lead.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* AI suggestion bar */}
            <div className="mx-3 mt-2 bg-indigo-950/60 rounded-xl p-2.5 border border-indigo-900/50">
              <div className="flex items-center gap-1.5 mb-1">
                <Bot className="w-3 h-3 text-indigo-400" />
                <p className="text-[9px] font-semibold text-indigo-300">AI Agent suggestion</p>
              </div>
              <p className="text-[9px] text-gray-400 leading-snug">Amara hasn&apos;t replied in 2 days. Draft follow-up ready.</p>
              <div className="mt-1.5 flex gap-1.5">
                <div className="bg-indigo-600 text-white text-[8px] px-2 py-0.5 rounded-md font-medium">Send draft</div>
                <div className="bg-gray-800 text-gray-400 text-[8px] px-2 py-0.5 rounded-md">Skip</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -left-6 top-16 bg-white rounded-2xl shadow-xl border border-gray-100 px-3 py-2.5 hidden lg:block">
        <p className="text-[10px] font-bold text-gray-900 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-green-500" />
          Deal closed
        </p>
        <p className="text-[9px] text-green-600 mt-0.5">+$8,400 attributed</p>
      </div>
      <div className="absolute -right-6 bottom-16 bg-white rounded-2xl shadow-xl border border-gray-100 px-3 py-2.5 hidden lg:block">
        <p className="text-[10px] font-bold text-gray-900">87% reply rate</p>
        <p className="text-[9px] text-green-600 mt-0.5">↑ from 40%</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingNav />

      <main className="flex-1 pt-16">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden py-16 md:py-24 lg:py-32 px-4 md:px-6">
          <div
            className="absolute inset-0 -z-10 opacity-40"
            style={{ backgroundImage: 'radial-gradient(circle, #e0e7ff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-30 -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-100 rounded-full blur-3xl opacity-30 -z-10" />

          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-full text-sm font-semibold text-indigo-700 mb-6">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                WhatsApp CRM · Built for Africa
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
                Close more deals
                <br />
                <span className="text-indigo-600">on WhatsApp.</span>
              </h1>

              <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
                Zuri turns your WhatsApp into a full business platform — AI lead scoring, autonomous agents, broadcast campaigns, and team inbox. Built for businesses that sell on WhatsApp.
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
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start text-sm text-gray-500">
                {['30-day free trial', 'No credit card required', 'Cancel anytime'].map(item => (
                  <div key={item} className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 w-full max-w-md mx-auto lg:mx-0">
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ── Social proof bar ─────────────────────────────────────────────── */}
        <section className="border-y border-gray-100 bg-gray-50 py-8 px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-6">Trusted by 2,400+ businesses across Africa</p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
              {['Online Retail', 'Real Estate', 'Healthcare', 'Legal', 'Hospitality', 'Education'].map(industry => (
                <span key={industry} className="text-sm font-semibold text-gray-400">{industry}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple by design</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                Up and running in 60 seconds
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {STEPS.map((step) => {
                const Icon = step.icon
                return (
                  <div key={step.step} className="relative bg-white rounded-3xl border border-gray-100 p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-indigo-600" />
                      </div>
                      <span className="text-xs font-bold text-indigo-300 tracking-widest">{step.step}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="bg-gray-950 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-400 font-semibold text-sm uppercase tracking-widest mb-3">Everything you need</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5">
                WhatsApp. Supercharged.
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto text-lg">
                12 AI engines running silently in the background — scoring leads, drafting replies, running campaigns, and closing deals.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                  <div
                    key={feature.title}
                    className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-indigo-700/50 hover:bg-gray-900/80 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-900/50 flex items-center justify-center mb-4 group-hover:bg-indigo-900 transition-colors">
                      <Icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h3 className="text-base font-bold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Industries ───────────────────────────────────────────────────── */}
        <section id="industries" className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Industry fit</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Built for how your industry sells
              </h2>
              <p className="text-gray-500 mt-4 max-w-xl mx-auto">
                Whether you run a boutique, a clinic, or a law firm — Zuri adapts to how you communicate with customers on WhatsApp.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon
                return (
                  <Link
                    key={industry.href}
                    href={industry.href}
                    className="flex flex-col items-center gap-3 p-5 bg-gray-50 rounded-2xl hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all duration-200 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:border-indigo-600 transition-all duration-200">
                      <Icon className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors duration-200" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 text-center leading-tight">{industry.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Real results</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Businesses closing more deals
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow duration-300">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: 5 }, (_, i) => (
                      <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="text-gray-700 text-sm leading-relaxed flex-1 mb-6">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.role} · {t.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Transparent pricing</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Start free. Scale when ready.
              </h2>
              <p className="text-gray-500 mt-4">30-day free trial on Pro and Business. No credit card required.</p>
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
                      {plan.period && (
                        <span className={`text-sm mb-1.5 ${plan.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                          {plan.period}
                        </span>
                      )}
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

            <p className="text-center text-sm text-gray-500 mt-6">
              Need enterprise features?{' '}
              <Link href="/pricing" className="text-indigo-600 hover:text-indigo-700 font-medium">
                View full pricing →
              </Link>
            </p>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gray-950 py-20 md:py-28 px-4 md:px-6">
          <div className="absolute inset-0 -z-0 opacity-5"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-900/30 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-900/30 rounded-full blur-3xl" />
          <div className="relative max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-5 leading-tight">
              Every unanswered WhatsApp
              <br />
              <span className="text-indigo-400">is a lost deal.</span>
            </h2>
            <p className="text-gray-400 text-lg mb-8 leading-relaxed">
              Join 2,400+ African businesses using Zuri to respond faster, close more, and keep every customer.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-xl shadow-indigo-900/50 text-base"
            >
              Start your free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-gray-600 text-sm mt-4">30-day trial · No credit card · Cancel anytime</p>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  )
}
