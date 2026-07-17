import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, MessageCircle, Check, ShieldCheck,
  Briefcase, GraduationCap, Boxes, FileText, TrendingUp, Bot,
  ShoppingBag, Wrench, Stethoscope, Building2, UtensilsCrossed, Plane, Scale, GraduationCap as SchoolIcon,
} from 'lucide-react'
import { AuthCta } from './_components/AuthCta'

export const metadata: Metadata = {
  title: 'Zuri — The AI System That Runs Your Business and Grows Your Career',
  description: 'Zuri turns WhatsApp into a full business back office — CRM, inventory, invoicing, and an AI advisor that never drops a follow-up — while quietly building your career on the side with an AI-powered CV Studio, job search, and interview coach.',
}

const PILLARS = [
  {
    icon: Briefcase,
    tag: 'For your business',
    title: 'Run the whole operation from WhatsApp',
    description: 'Every customer conversation becomes structured business data — automatically. Reply drafts, contact intelligence, a real inventory and invoicing system, and an AI advisor that catches what a busy owner misses.',
    points: [
      'AI reply drafts that sound like you, in seconds',
      'Contact profiles, lead scores, and pipeline — built automatically',
      'Inventory, suppliers, purchase orders, quotations & invoices',
      'Projects, deals, and a daily AI brief on what needs attention',
    ],
    href: '/whatsapp',
    cta: 'See the Business system',
    dashboardHref: '/dashboard',
    dashboardCta: 'Go to Dashboard',
    accent: 'from-indigo-600 to-cyan-500',
  },
  {
    icon: GraduationCap,
    tag: 'For your career',
    title: 'Build the CV, find the job, land the offer',
    description: 'The same account also runs your career growth — a real CV Studio built on your actual professional history, an AI job search engine, and an interview coach that learns what companies actually ask.',
    points: [
      'CV Studio: field-by-field editing, ATS scoring, 4 templates',
      'AI job discovery matched to your real skills — no invented experience',
      'Application tracking, interview prep, and company intelligence',
      'A Career Radar score showing exactly what to improve next',
    ],
    href: '/how-it-works',
    cta: 'See the Career system',
    dashboardHref: '/career',
    dashboardCta: 'Open Career OS',
    accent: 'from-slate-800 to-slate-950',
  },
]

const CAPABILITIES = [
  {
    icon: MessageCircle,
    title: 'AI-drafted replies, in your voice',
    description: 'Zuri learns how you actually write and drafts replies that sound like you — you approve every send.',
  },
  {
    icon: Boxes,
    title: 'A real Business OS',
    description: 'Inventory ledgers, suppliers, purchase orders, projects, and a live financial overview — not a spreadsheet.',
  },
  {
    icon: FileText,
    title: 'Quotes, invoices & contracts',
    description: 'Turn a WhatsApp conversation into a branded document in one tap — quotations, invoices, contracts, and more.',
  },
  {
    icon: Bot,
    title: 'An AI advisor that never sleeps',
    description: 'Zuri notices stalled follow-ups, at-risk customers, and low stock before you do — and drafts what to do about it.',
  },
  {
    icon: TrendingUp,
    title: 'Career growth, built in',
    description: 'CV Studio, AI job search, interview prep, and a Career Radar score — the same intelligence, pointed at your career.',
  },
  {
    icon: ShieldCheck,
    title: 'You approve everything',
    description: 'Zuri never sends a message, publishes a post, or applies to a job without you saying so first.',
  },
]

const INDUSTRIES = [
  { label: 'Online Retail', href: '/retail', icon: ShoppingBag },
  { label: 'Mechanics', href: '/mechanics', icon: Wrench },
  { label: 'Clinics & Health', href: '/clinics', icon: Stethoscope },
  { label: 'Real Estate', href: '/real-estate', icon: Building2 },
  { label: 'Restaurants', href: '/restaurants', icon: UtensilsCrossed },
  { label: 'Travel & Tourism', href: '/travel', icon: Plane },
  { label: 'Legal Firms', href: '/legal', icon: Scale },
  { label: 'Schools', href: '/schools', icon: SchoolIcon },
]

const PLANS = [
  { name: 'Personal', price: 'K149', note: 'Career OS, Advisor & CRM' },
  { name: 'Professional', price: 'K249', note: '+ Business OS & Studio ERP' },
  { name: 'Business', price: 'K499', note: '+ Team, analytics & automation' },
]

export default function UnifiedHomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] py-16 md:py-24 lg:py-28 px-4 md:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            An AI Business &amp; Career Platform
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gray-950 leading-tight mb-6">
            Run your business.
            <br />
            <span className="text-indigo-600">Grow your career.</span> One AI system for both.
          </h1>

          <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-10">
            Zuri turns your WhatsApp into a full business back office — CRM, inventory, invoicing, and an AI
            advisor that never drops a follow-up. The same account quietly builds your career too, with an
            AI-powered CV Studio, job search, and interview coach.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <AuthCta
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 active:bg-indigo-700 transition-colors text-base"
              loggedOut={{ href: '/register', children: <>Start free — no credit card<ArrowRight className="w-4 h-4" /></> }}
              loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
            />
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-2xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
            >
              See how it works
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-5">7-day free trial, full access · No credit card required</p>
        </div>
      </section>

      {/* ── Two pillars ──────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">One account, two engines</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Built to grow both sides of your life</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div key={pillar.title} className="rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col">
                  <div className={`bg-gradient-to-br ${pillar.accent} p-7 text-white`}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shadow-lg shadow-black/10">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-widest bg-white/15 px-3 py-1.5 rounded-full">
                        {pillar.tag}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-1">{pillar.title}</h3>
                  </div>

                  <div className="bg-white p-7 flex-1 flex flex-col">
                    <p className="text-sm text-gray-600 leading-relaxed mb-5">{pillar.description}</p>
                    <ul className="space-y-2.5 mb-7 flex-1">
                      {pillar.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <Check className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <AuthCta
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-950 text-white font-semibold rounded-2xl hover:bg-gray-800 transition-colors text-sm"
                      loggedOut={{ href: pillar.href, children: <>{pillar.cta}<ArrowRight className="w-4 h-4" /></> }}
                      loggedIn={{ href: pillar.dashboardHref, children: <>{pillar.dashboardCta}<ArrowRight className="w-4 h-4" /></> }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">What's actually inside</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Not a chatbot. A working back office.
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              Everything below runs on one account, one login, one AI — no juggling five separate apps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon
              return (
                <div key={cap.title} className="rounded-[1.75rem] bg-white border border-gray-100 shadow-sm shadow-gray-200/70 p-6 hover:shadow-md transition-all duration-200">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{cap.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{cap.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Industries ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Built for how you sell</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Whatever you run, Zuri adapts to it
            </h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">
              A boutique, a clinic, a law firm, a school — the conversations look different, the system underneath is the same.
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
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 transition-all duration-200">
                    <Icon className="w-5 h-5 text-indigo-600 group-hover:text-white transition-colors duration-200" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 text-center leading-tight">{industry.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Start free. Pay with Airtel or MTN when you're ready.
            </h2>
            <p className="text-gray-500 mt-4">7-day free trial with full access · Daily, weekly, monthly or yearly billing</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {PLANS.map((plan) => (
              <div key={plan.name} className="rounded-[1.75rem] bg-white border border-gray-100 shadow-sm shadow-gray-200/70 p-6 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{plan.name}</p>
                <p className="text-3xl font-black tracking-tight text-gray-950 mb-1">{plan.price}<span className="text-sm font-medium text-gray-400">/mo</span></p>
                <p className="text-sm text-gray-500">{plan.note}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition-colors text-base"
            >
              See full pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-gray-950 mb-5 leading-tight">
            Ready to run your business
            <br />
            and grow your career?
          </h2>
          <p className="text-gray-500 text-lg mb-8 leading-relaxed">
            Free for 7 days, full access, no credit card required.
          </p>
          <AuthCta
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold shadow-xl shadow-indigo-500/25 hover:bg-indigo-500 transition-colors text-base"
            loggedOut={{ href: '/register', children: <>Get started free<ArrowRight className="w-4 h-4" /></> }}
            loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
          />
          <p className="text-gray-400 text-sm mt-4">7-day trial · No credit card · Cancel anytime</p>
          <p className="text-gray-400 text-sm mt-6">
            Still deciding?{' '}
            <Link href="/whatsapp" className="text-indigo-600 font-medium hover:text-indigo-700">See the Business system</Link>
            {' '}or{' '}
            <Link href="/how-it-works" className="text-indigo-600 font-medium hover:text-indigo-700">See how it works</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
