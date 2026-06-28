import Link from 'next/link'
import { MarketingNav } from './(marketing)/_components/MarketingNav'
import { MarketingFooter } from './(marketing)/_components/MarketingFooter'

const FEATURES = [
  {
    icon: '💬',
    title: 'Smart Inbox',
    description: 'Every conversation ranked by urgency, sentiment, and relationship importance. Focus on what matters most.',
  },
  {
    icon: '🧠',
    title: 'Contact Intelligence',
    description: 'Deep psychological profiles built from conversation patterns. Know how each person communicates and what they care about.',
  },
  {
    icon: '❤️',
    title: 'Relationship Health',
    description: 'Live health scores for every contact. Spot declining connections before they go cold.',
  },
  {
    icon: '✨',
    title: 'Proactive Nudges',
    description: 'Daily suggestions for who to reach out to and why — complete with a draft message, ready to copy.',
  },
  {
    icon: '🎯',
    title: 'Voice-Matched Drafts',
    description: 'AI replies that sound exactly like you — learned from your own conversation history and writing style.',
  },
  {
    icon: '📅',
    title: 'Calendar Intelligence',
    description: 'Birthdays, follow-ups, and promises automatically extracted from your chats and added to your calendar.',
  },
]

const STEPS = [
  {
    step: '01',
    icon: '📱',
    title: 'Connect WhatsApp',
    description: 'Scan one QR code. Zuri connects to your WhatsApp in under 60 seconds — no app download, no configuration.',
  },
  {
    step: '02',
    icon: '🧠',
    title: 'Zuri learns your network',
    description: 'Every conversation is analysed in real-time. Contact profiles, health scores, and relationship patterns emerge automatically.',
  },
  {
    step: '03',
    icon: '✨',
    title: 'Stay close, effortlessly',
    description: 'Get daily nudges, reply drafts, and alerts for relationships that need attention. You decide what to send.',
  },
]

const TESTIMONIALS = [
  {
    quote: "I reconnected with 3 clients I\'d completely forgotten about. One turned into a $12,000 project two weeks later.",
    name: 'David M.',
    role: 'Freelance Designer',
    location: 'Lusaka',
    initials: 'DM',
  },
  {
    quote: "Zuri flagged that one of my best customers hadn't messaged in 6 weeks. I reached out and saved the relationship.",
    name: 'Chanda N.',
    role: 'Online Boutique Owner',
    location: 'Lusaka',
    initials: 'CN',
  },
  {
    quote: "My response rate went from 40% to 87%. Clients genuinely feel like I know them on a personal level.",
    name: 'Tendai R.',
    role: 'Real Estate Agent',
    location: 'Harare',
    initials: 'TR',
  },
]

const INDUSTRIES = [
  { label: 'Online Retail', href: '/retail', icon: '🛒' },
  { label: 'Mechanics', href: '/mechanics', icon: '🔧' },
  { label: 'Clinics', href: '/clinics', icon: '👩🏽‍⚕️' },
  { label: 'Real Estate', href: '/real-estate', icon: '🏠' },
  { label: 'Restaurants', href: '/restaurants', icon: '🍽' },
  { label: 'Travel', href: '/travel', icon: '✈️' },
  { label: 'Legal', href: '/legal', icon: '⚖️' },
  { label: 'Schools', href: '/schools', icon: '🎓' },
]

const PRICING = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'Perfect for individuals managing their personal network.',
    features: ['Up to 50 contacts', 'Basic health scores', '5 nudges per day', 'Smart inbox'],
    cta: 'Start free',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For freelancers and solopreneurs serious about relationships.',
    features: ['Unlimited contacts', 'AI reply drafts', 'Full analytics', '25 nudges per day', 'Calendar intelligence', 'Voice profile'],
    cta: 'Start 14-day trial',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Business',
    price: '$49',
    period: '/month',
    description: 'For teams and SMBs that live in WhatsApp.',
    features: ['Everything in Pro', 'Automation rules', 'Team workspace', 'Priority support', 'Advanced AI engines', 'Custom integrations'],
    cta: 'Start 14-day trial',
    href: '/register',
    highlight: false,
  },
]

function PhoneMockup() {
  const contacts = [
    { name: 'Sarah K.', msg: 'Following up on the proposal…', score: 82, color: 'bg-green-400' },
    { name: 'James M.', msg: 'Haven\'t heard back from you', score: 34, color: 'bg-red-400' },
    { name: 'Aisha T.', msg: 'Thanks for the quick delivery!', score: 91, color: 'bg-green-400' },
    { name: 'David C.', msg: 'Can we reschedule Thursday?', score: 67, color: 'bg-yellow-400' },
  ]

  return (
    <div className="relative mx-auto w-60 md:w-72 select-none">
      {/* Glow */}
      <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-indigo-400 rounded-full scale-110" />

      {/* Phone frame */}
      <div className="relative bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl shadow-gray-900/50 ring-1 ring-white/10">
        <div className="bg-white rounded-[2rem] overflow-hidden">
          {/* Notch */}
          <div className="bg-gray-900 flex justify-center pb-1.5 pt-3">
            <div className="w-20 h-1.5 bg-gray-700 rounded-full" />
          </div>

          {/* Status bar */}
          <div className="bg-white px-4 pt-1.5 pb-0.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-900">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-3.5 h-2 bg-gray-800 rounded-[2px]" />
            </div>
          </div>

          {/* App header */}
          <div className="bg-indigo-600 px-3 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-bold">Zuri</p>
              <p className="text-indigo-300 text-[9px]">3 nudges ready</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-[10px]">🔔</span>
            </div>
          </div>

          {/* Contacts */}
          <div className="divide-y divide-gray-50">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-2 hover:bg-gray-50">
                <div className="relative flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-indigo-600">{c.name[0]}</span>
                  </div>
                  <div className={`absolute -bottom-px -right-px w-2 h-2 rounded-full ${c.color} border border-white`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-[9px] text-gray-400 truncate">{c.msg}</p>
                </div>
                <span className={`text-[9px] font-bold tabular-nums ${c.score < 50 ? 'text-red-500' : 'text-indigo-600'}`}>{c.score}</span>
              </div>
            ))}
          </div>

          {/* Nudge card */}
          <div className="mx-2 my-2 bg-indigo-50 rounded-xl p-2.5 border border-indigo-100">
            <p className="text-[9px] font-semibold text-indigo-900 mb-1">✨ Zuri suggests</p>
            <p className="text-[9px] text-indigo-700 leading-snug">James hasn&apos;t heard from you in 3 weeks. His score is dropping.</p>
            <div className="mt-1.5 flex gap-1.5">
              <div className="bg-indigo-600 text-white text-[8px] px-2 py-0.5 rounded-full font-medium">Send draft</div>
              <div className="bg-white text-gray-500 text-[8px] px-2 py-0.5 rounded-full border border-gray-200">Skip</div>
            </div>
          </div>

          {/* Bottom padding */}
          <div className="h-3" />
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-20 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -left-10 top-20 bg-white rounded-2xl shadow-xl border border-gray-100 px-3 py-2.5 hidden md:block">
        <p className="text-[10px] font-bold text-gray-900">❤️ Relationship saved</p>
        <p className="text-[9px] text-green-600 mt-0.5">+$12,000 recovered</p>
      </div>
      <div className="absolute -right-8 bottom-28 bg-white rounded-2xl shadow-xl border border-gray-100 px-3 py-2.5 hidden md:block">
        <p className="text-[10px] font-bold text-gray-900">📈 87% reply rate</p>
        <p className="text-[9px] text-green-600 mt-0.5">↑ was 40%</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingNav />

      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-16 md:py-24 lg:py-32 px-4 md:px-6">
          {/* Background grid */}
          <div
            className="absolute inset-0 -z-10 opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle, #e0e7ff 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-30 -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-30 -z-10" />

          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Left */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-full text-sm font-semibold text-indigo-700 mb-6">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                WhatsApp AI · Built for Africa
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
                Build relationships
                <br />
                <span className="text-indigo-600">that last.</span>
              </h1>

              <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
                Zuri reads every WhatsApp conversation, builds living profiles of your contacts, and tells you exactly who needs attention — before relationships fade.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center px-7 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-200 text-base"
                >
                  Start free — no credit card
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
                >
                  See how it works
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <p className="text-sm text-gray-400">Trusted by 2,400+ businesses across Africa</p>
            </div>

            {/* Right — phone mockup */}
            <div className="flex-shrink-0 w-full max-w-xs mx-auto lg:mx-0">
              <PhoneMockup />
            </div>
          </div>
        </section>

        {/* Social proof bar */}
        <section className="border-y border-gray-100 bg-gray-50 py-8 px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-6">Trusted by businesses across Africa</p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
              {['Online Retail', 'Real Estate', 'Healthcare', 'Legal', 'Hospitality', 'Education'].map(industry => (
                <span key={industry} className="text-sm font-semibold text-gray-400">{industry}</span>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple by design</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                Up and running in 60 seconds
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {STEPS.map((step) => (
                <div key={step.step} className="relative bg-white rounded-3xl border border-gray-100 p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{step.icon}</span>
                    <span className="text-xs font-bold text-indigo-400 tracking-widest">{step.step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">12 intelligence engines</p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-5">
                Everything you need to never miss a moment
              </h2>
              <p className="text-gray-600 max-w-xl mx-auto">
                Zuri runs quietly in the background — reading, learning, planning — so you can focus on the conversations that matter.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300"
                >
                  <span className="text-3xl mb-4 block">{feature.icon}</span>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Industries */}
        <section id="industries" className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Industry fit</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Built for how your industry sells
              </h2>
              <p className="text-gray-600 mt-4 max-w-xl mx-auto">
                Whether you run a boutique, a clinic, or a law firm — Zuri adapts to how you communicate with clients on WhatsApp.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {INDUSTRIES.map((industry) => (
                <Link
                  key={industry.href}
                  href={industry.href}
                  className="flex flex-col items-center gap-3 p-5 bg-gray-50 rounded-2xl hover:bg-indigo-50 hover:border-indigo-200 border border-transparent transition-all duration-200 group"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform duration-200">{industry.icon}</span>
                  <span className="text-sm font-semibold text-gray-700 text-center leading-tight">{industry.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-gray-50 py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Real results</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Businesses that never miss a beat
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm flex flex-col">
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

        {/* Pricing preview */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Transparent pricing</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Start free. Scale when ready.
              </h2>
              <p className="text-gray-600 mt-4">No credit card required to start.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PRICING.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-6 flex flex-col ${
                    plan.highlight
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-200'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="mb-5">
                    <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1 mb-2">
                      <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className={`text-sm mb-1.5 ${plan.highlight ? 'text-indigo-300' : 'text-gray-500'}`}>
                          {plan.period}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs leading-relaxed ${plan.highlight ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {plan.description}
                    </p>
                  </div>

                  <ul className="space-y-2.5 flex-1 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <svg className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? 'text-indigo-300' : 'text-indigo-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className={plan.highlight ? 'text-indigo-100' : 'text-gray-600'}>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
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
              Need something custom?{' '}
              <Link href="/pricing" className="text-indigo-600 hover:text-indigo-700 font-medium">
                View full pricing →
              </Link>
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-indigo-600 py-20 md:py-28 px-4 md:px-6">
          <div className="absolute inset-0 -z-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-5 leading-tight">
              Your most important relationships deserve better than memory.
            </h2>
            <p className="text-indigo-200 text-lg mb-8 leading-relaxed">
              Join thousands of professionals using Zuri to stay close to the people that matter most.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-xl text-base"
            >
              Start free today
            </Link>
            <p className="text-indigo-300 text-sm mt-4">Set up in 60 seconds · No credit card required</p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
