import Link from 'next/link'

interface Benefit {
  icon: string
  title: string
  description: string
}

interface Testimonial {
  quote: string
  name: string
  role: string
  location: string
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
  testimonial: Testimonial
  stats: { value: string; label: string }[]
}

export function IndustryPage({ config }: { config: IndustryConfig }) {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 ${config.accentBg}`}>
            <span className="text-xl">{config.icon}</span>
            <span className={config.accentColor}>{config.label}</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            {config.headline}
          </h1>

          <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-8">
            {config.subheadline}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-6 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Start free — no credit card
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center px-6 py-3.5 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 py-10 px-4 md:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4">
          {config.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl md:text-4xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Built for {config.label.toLowerCase()}
            </h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Every feature designed around how {config.label.toLowerCase()} professionals communicate with clients on WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {config.benefits.map((benefit, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-5 hover:bg-white hover:shadow-md hover:border-gray-200 border border-transparent transition-all duration-200">
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
            <p className="text-gray-600">Three simple steps to better client relationships</p>
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

      {/* Testimonial */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 md:p-10 text-center">
            <div className="flex justify-center mb-5">
              {Array.from({ length: 5 }, (_, i) => (
                <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <blockquote className="text-lg md:text-xl text-gray-800 font-medium leading-relaxed mb-6">
              &ldquo;{config.testimonial.quote}&rdquo;
            </blockquote>
            <div>
              <p className="font-semibold text-gray-900">{config.testimonial.name}</p>
              <p className="text-sm text-gray-500">{config.testimonial.role} · {config.testimonial.location}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to grow your {config.label.toLowerCase()} business?
          </h2>
          <p className="text-indigo-200 mb-8">
            Join thousands of African businesses using Zuri to build stronger client relationships on WhatsApp.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg text-base"
          >
            Start free today
          </Link>
          <p className="text-indigo-300 text-sm mt-4">No credit card required · Set up in 60 seconds</p>
        </div>
      </section>
    </div>
  )
}
