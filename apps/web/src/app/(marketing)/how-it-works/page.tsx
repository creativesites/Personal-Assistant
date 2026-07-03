import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'

const PHASES = [
  {
    title: '1. Connect your WhatsApp',
    description:
      'Open Zuri, scan a QR code with your phone, and your WhatsApp is linked in under a minute. Nothing to install, no technical skills required.',
    benefits: [
      'Works with your existing WhatsApp number',
      'No app download needed',
      'Your customers only hear from you — Zuri never sends messages on its own',
    ],
    color: 'bg-green-50 border-green-200',
    iconBg: 'bg-green-100 text-green-600',
  },
  {
    title: '2. Zuri learns about your customers',
    description:
      'It reads your conversations, remembers important details, and builds a profile for each contact — automatically.',
    benefits: [
      'Knows who your VIP clients are',
      'Remembers past orders, birthdays, and promises',
      'Understands how each customer likes to talk (formal, casual, quick)',
    ],
    color: 'bg-blue-50 border-blue-200',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  {
    title: '3. You get helpful suggestions',
    description:
      'Every morning, Zuri shows you who to follow up with, what to say, and why. One tap to send a message that sounds like you.',
    benefits: [
      'Daily “coffee feed” with 3–5 suggested replies',
      'Reminders for overdue follow‑ups',
      'Drafts that match your personal writing style',
    ],
    color: 'bg-purple-50 border-purple-200',
    iconBg: 'bg-purple-100 text-purple-600',
  },
]

const FAQS = [
  {
    q: 'Is my WhatsApp data private?',
    a: 'Absolutely. Your conversations are encrypted and stored securely. We never sell your data or share it with anyone. You can delete everything at any time.',
  },
  {
    q: 'Will Zuri send messages without me knowing?',
    a: 'No. Zuri only suggests replies — you always approve before anything is sent. You can even turn off suggestions for specific contacts.',
  },
  {
    q: 'What if my phone is off or I lose internet?',
    a: 'Zuri pauses until you’re back online. Your profiles and data are safe, and you can reconnect in seconds.',
  },
  {
    q: 'How long until I see results?',
    a: 'Within a few hours you’ll have contact summaries and follow‑up reminders. After a week, Zuri really understands your voice and your customers’ habits.',
  },
  {
    q: 'Does it work with WhatsApp Business?',
    a: 'Yes — WhatsApp Business accounts are fully supported, including product catalogues and business labels.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-white py-16 md:py-24 px-4 md:px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">
            How Zuri works
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            A simpler way to manage your customers on WhatsApp
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto">
            Connect your WhatsApp, and Zuri will handle the typing — suggesting replies that sound like you,
            reminding you when to follow up, and making sure no customer slips through the cracks.
          </p>
        </div>
      </section>

      {/* 3 Steps */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto space-y-10">
          {PHASES.map((phase, idx) => (
            <div
              key={idx}
              className={`rounded-3xl border-2 p-8 md:p-10 ${phase.color} flex flex-col md:flex-row gap-8 items-start`}
            >
              {/* Icon / number */}
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-sm bg-white border border-gray-100">
                <span className={phase.iconBg}>{idx + 1}</span>
              </div>
              {/* Content */}
              <div className="flex-1">
                <h2 className="text-2xl font-extrabold text-gray-900 mb-3">{phase.title}</h2>
                <p className="text-gray-600 leading-relaxed mb-6">{phase.description}</p>
                <ul className="space-y-3">
                  {phase.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20 px-4 md:px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-10 text-center">
            Questions you might have
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

      {/* CTA */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            Ready to make your WhatsApp work for you?
          </h2>
          <p className="text-gray-500 mb-8">Free 30‑day trial. No credit card needed.</p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 text-base"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
