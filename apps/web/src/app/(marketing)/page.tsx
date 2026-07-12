import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, MessageCircle, Sparkles, Check, ShieldCheck, Users, Send,
  Package, Repeat,
} from 'lucide-react'
import { AuthCta } from './_components/AuthCta'

export const metadata: Metadata = {
  title: 'Zuri — From First Message to Repeat Customer',
  description: 'Zuri WhatsApp turns conversations into customers with AI reply suggestions and a smart CRM. Zuri Marketing turns one product into ready-to-post content for Facebook, Instagram, and TikTok — and tracks every lead all the way to a sale.',
}

const FUNNEL = [
  { icon: Package, title: 'You have a product', description: 'A phone, a dress, a service — one photo is enough to start.' },
  { icon: Send, title: 'Zuri Marketing gets you found', description: 'AI writes the captions and scripts, then schedules posts to Facebook, Instagram, and TikTok.' },
  { icon: MessageCircle, title: 'Zuri WhatsApp closes the deal', description: 'Every reply drafted for you, every customer profile built automatically, right in your inbox.' },
  { icon: Repeat, title: 'The customer comes back', description: 'Follow-ups and broadcasts bring them back — targeted by what they actually bought.' },
]

const PRODUCTS = [
  {
    name: 'Zuri WhatsApp',
    tag: 'Available now',
    icon: MessageCircle,
    headline: 'Reply smarter, sell more — right inside WhatsApp.',
    description: "This is Zuri's CRM and AI assistant for the conversations that actually close deals. It reads your WhatsApp chats, drafts replies that sound like you, remembers every customer, and nudges you before a lead goes cold.",
    points: [
      'AI reply drafts in seconds, in your own voice',
      'Contact profiles & lead scoring built automatically',
      'Automatic follow-up reminders — never lose a lead to a slow reply',
      'Team inbox, broadcasts, and revenue analytics',
    ],
    href: '/whatsapp',
    cta: 'Explore Zuri WhatsApp',
    dashboardHref: '/dashboard',
    dashboardCta: 'Go to Dashboard',
    accent: 'from-indigo-600 to-indigo-700',
  },
  {
    name: 'Zuri Marketing',
    tag: 'Available now',
    icon: Sparkles,
    headline: 'One product upload. A full sales funnel out.',
    description: "This is Zuri's AI content and publishing engine — the part that gets customers to message you in the first place. Upload a product once and get everything a business normally spends hours making by hand.",
    points: [
      'AI-written captions, descriptions, and video scripts',
      'AI-generated image variants from one product photo',
      'Scheduled publishing to Facebook, Instagram, and TikTok',
      'Funnel analytics: which posts actually produced sales',
    ],
    href: '/marketing',
    cta: 'Explore Zuri Marketing',
    dashboardHref: '/studio',
    dashboardCta: 'Open Studio',
    accent: 'from-gray-800 to-gray-900',
  },
]

const WHY = [
  {
    icon: Users,
    title: 'One customer, one record',
    description: "A lead from a Facebook post and a message from a loyal WhatsApp customer land in the exact same profile — not two disconnected tools.",
  },
  {
    icon: Send,
    title: 'Built for how Zambia sells',
    description: 'Discovery on Facebook, Instagram, and TikTok. Deals closed on WhatsApp. Zuri is built around that exact path, not a generic global workflow.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data, your control',
    description: 'Zuri never sends a message or publishes a post without your approval. Everything is encrypted and stays in your account.',
  },
]

export default function UnifiedHomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white py-16 md:py-24 lg:py-28 px-4 md:px-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl -z-10" />
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-medium text-gray-600 mb-6 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Trusted by businesses across Zambia
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
            From first message
            <br />
            <span className="text-indigo-600">to repeat customer.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto mb-4">
            Most small businesses in Zambia sell the same way: customers discover them on Facebook, Instagram, or
            TikTok, then message them on WhatsApp to actually buy. Zuri is two AI products built for exactly that —
            one for each half of the journey, sharing one system underneath.
          </p>
          <p className="text-base text-gray-400 max-w-xl mx-auto mb-10">
            Not sure where to start? Explore either product below — no sign-up needed to look around.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <AuthCta
              className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-200 text-base"
              loggedOut={{ href: '/whatsapp', children: <>Explore Zuri WhatsApp<ArrowRight className="w-4 h-4" /></> }}
              loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
            />
            <AuthCta
              className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
              loggedOut={{ href: '/marketing', children: <>Explore Zuri Marketing<ArrowRight className="w-4 h-4" /></> }}
              loggedIn={{ href: '/studio', children: <>Open Studio<ArrowRight className="w-4 h-4" /></> }}
            />
          </div>
        </div>
      </section>

      {/* ── The funnel — what these products actually do, together ────────── */}
      <section className="py-16 md:py-20 px-4 md:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">How it fits together</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Two products. One path from a product to a sale.
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              You don&apos;t have to use both — plenty of businesses start with just one. But they&apos;re built to
              work as a single system if you want the whole journey covered.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FUNNEL.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <p className="font-semibold text-gray-900 text-sm mb-1.5">{step.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.description}</p>
                  {i < FUNNEL.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute top-1/2 -right-6 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Two products ─────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">The two products</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Pick where you want to start</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PRODUCTS.map((product) => {
              const Icon = product.icon
              return (
                <div key={product.name} className="rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col">
                  <div className={`bg-gradient-to-br ${product.accent} p-7 text-white`}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-widest bg-white/15 px-3 py-1.5 rounded-full">
                        {product.tag}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-1">{product.name}</h3>
                    <p className="text-sm text-white/80 leading-relaxed">{product.headline}</p>
                  </div>

                  <div className="bg-white p-7 flex-1 flex flex-col">
                    <p className="text-sm text-gray-500 leading-relaxed mb-5">{product.description}</p>
                    <ul className="space-y-2.5 mb-7 flex-1">
                      {product.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <Check className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <AuthCta
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors text-sm"
                      loggedOut={{ href: product.href, children: <>{product.cta}<ArrowRight className="w-4 h-4" /></> }}
                      loggedIn={{ href: product.dashboardHref, children: <>{product.dashboardCta}<ArrowRight className="w-4 h-4" /></> }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Why one system ───────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Why one system</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Marketing and sales, sharing one brain
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              A scheduler that only posts, and a CRM that only replies, can&apos;t tell you which post actually
              produced a sale. Zuri can, because both live in the same system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WHY.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="p-6 rounded-2xl bg-white border border-gray-100 hover:border-indigo-200 transition-all duration-200 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-5 leading-tight">
            Ready to get started?
          </h2>
          <p className="text-gray-500 text-lg mb-8 leading-relaxed">
            Both products are ready today — free for 30 days, no credit card required.
          </p>
          <AuthCta
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-xl shadow-indigo-200 text-base"
            loggedOut={{ href: '/register', children: <>Get started free<ArrowRight className="w-4 h-4" /></> }}
            loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
          />
          <p className="text-gray-400 text-sm mt-4">30-day trial · No credit card · Cancel anytime</p>
          <p className="text-gray-400 text-sm mt-6">
            Still deciding?{' '}
            <Link href="/whatsapp" className="text-indigo-600 font-medium hover:text-indigo-700">Explore Zuri WhatsApp</Link>
            {' '}or{' '}
            <Link href="/marketing" className="text-indigo-600 font-medium hover:text-indigo-700">Explore Zuri Marketing</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
