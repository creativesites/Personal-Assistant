import Link from 'next/link'
import { AuthCta } from './AuthCta'
import { ArrowRight, Check } from 'lucide-react'

interface Benefit {
  icon: string
  title: string
  description: string
}

interface Capability {
  label: string
}

interface Scenario {
  setup: string
  zuriDoes: string
  outcome: string
}

interface UseCaseStep {
  title: string
  description: string
}

export interface IndustryConfig {
  icon: string
  label: string
  headline: string
  subheadline: string
  accentColor: string
  accentBg: string
  benefits: Benefit[]
  useCases: UseCaseStep[]
  scenario: Scenario
  capabilities: Capability[]
}

export function IndustryPage({ config }: { config: IndustryConfig }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] py-16 md:py-24 px-4 md:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.22),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.18),transparent_30%)]" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className={`inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-indigo-100 mb-6 ${config.accentBg}`}>
            <span className="text-xl">{config.icon}</span>
            <span className={config.accentColor}>Built for {config.label}</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gray-950 leading-tight mb-6">
            {config.headline}
          </h1>

          <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-8">
            {config.subheadline}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <AuthCta
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
              loggedOut={{ href: '/register', children: <>Start free — no credit card<ArrowRight className="w-4 h-4" /></> }}
              loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
            />
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center px-6 py-3.5 bg-white text-gray-700 font-semibold rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Capabilities strip */}
      <section className="border-y border-gray-100 py-8 px-4 md:px-6 bg-white">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-3">
          {config.capabilities.map((cap, i) => (
            <span key={i} className="inline-flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-100">
              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {cap.label}
            </span>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Built for how {config.label.toLowerCase()} actually runs
            </h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Every feature designed around the real conversations and operations of a {config.label.toLowerCase()} business.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {config.benefits.map((benefit, i) => (
              <div key={i} className="rounded-[1.75rem] border border-gray-100 bg-white p-5 shadow-sm shadow-gray-200/70 hover:shadow-md transition-all duration-200">
                <span className="text-3xl mb-3 block">{benefit.icon}</span>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works for this industry */}
      <section className="bg-gray-50 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-gray-600">Three steps from WhatsApp chaos to a system that runs itself</p>
          </div>

          <div className="space-y-6 md:space-y-4">
            {config.useCases.map((step, i) => (
              <div key={i} className="flex gap-5 items-start bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scenario — an honest "what this looks like in practice" walkthrough,
          not an attributed customer quote we can't verify. */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-4">
            What this looks like in practice
          </p>
          <div className="rounded-[2rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-8 md:p-10">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">The situation</p>
                <p className="text-gray-800 leading-relaxed">{config.scenario.setup}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">What Zuri does</p>
                <p className="text-gray-800 leading-relaxed">{config.scenario.zuriDoes}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">The result</p>
                <p className="text-gray-800 leading-relaxed">{config.scenario.outcome}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-950 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to run your {config.label.toLowerCase()} business on Zuri?
          </h2>
          <p className="text-slate-300 mb-8">
            Free 7-day trial with full access. No credit card required.
          </p>
          <AuthCta
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-slate-950 font-bold rounded-2xl hover:bg-gray-100 transition-colors shadow-lg text-base"
            loggedOut={{ href: '/register', children: <>Start free today<ArrowRight className="w-4 h-4" /></> }}
            loggedIn={{ href: '/dashboard', children: <>Go to Dashboard<ArrowRight className="w-4 h-4" /></> }}
          />
          <p className="text-slate-400 text-sm mt-4">No credit card required · Set up in under 2 minutes</p>
        </div>
      </section>
    </div>
  )
}
