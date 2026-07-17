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
      'Your contacts only hear from you — Zuri never sends a message on its own',
    ],
    color: 'bg-indigo-50 border-indigo-100',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  {
    title: '2. Zuri learns your business',
    description:
      'It reads your conversations, builds a profile for every contact, and starts tracking the operational details a business actually runs on — stock, quotes, invoices, and follow-ups.',
    benefits: [
      'Contact profiles, lead scores, and pipeline stage — automatic',
      'Products, suppliers, and inventory tracked from what you actually discuss',
      'Quotations and invoices generated from a conversation in one tap',
    ],
    color: 'bg-cyan-50 border-cyan-100',
    iconBg: 'bg-cyan-100 text-cyan-600',
  },
  {
    title: '3. Your AI advisor keeps watch',
    description:
      'Every morning, Zuri shows you who to follow up with, what\'s low on stock, which invoice is overdue, and what to say — with a draft ready in one tap.',
    benefits: [
      'A daily brief across your whole business, not just your inbox',
      'Reminders for stalled follow-ups and unpaid invoices',
      'Drafts that match your own writing style',
    ],
    color: 'bg-emerald-50 border-emerald-100',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  {
    title: '4. The same account grows your career',
    description:
      'Build a real CV from your actual work history in the CV Studio, let Zuri find jobs and opportunities that match your real skills, and prep for interviews with company-specific intelligence.',
    benefits: [
      'A field-by-field CV editor with ATS scoring — never invented experience',
      'Daily AI-matched job and opportunity discovery',
      'Interview prep with real company intelligence',
    ],
    color: 'bg-purple-50 border-purple-100',
    iconBg: 'bg-purple-100 text-purple-600',
  },
]

const FAQS = [
  {
    q: 'Is my WhatsApp data private?',
    a: 'Yes. Your conversations are encrypted and stored securely. We never sell your data or share it with anyone. You can delete everything at any time.',
  },
  {
    q: 'Will Zuri send messages or apply to jobs without me knowing?',
    a: 'No. Zuri only ever drafts and suggests — you approve every message, document, and job application before anything goes out.',
  },
  {
    q: 'Does Zuri invent things on my CV or in replies?',
    a: 'Never on your CV — CV Studio only polishes, reorganises, and scores your real professional history, it never invents experience. Reply drafts are grounded in the actual conversation, not made up.',
  },
  {
    q: 'What if my phone is off or I lose internet?',
    a: 'Zuri pauses until you\'re back online. Your data is safe, and you can reconnect in seconds.',
  },
  {
    q: 'How long until I see results?',
    a: 'Within a few hours you\'ll have contact summaries and follow-up reminders. Within a week, Zuri understands your voice, your customers, and your career goals well enough to be genuinely useful.',
  },
  {
    q: 'Do I need both the business and career tools?',
    a: 'No — use whichever side fits you. Plenty of people only use the WhatsApp/business side, or only the Career OS. They share one account, one login, and one AI underneath.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] py-16 md:py-24 px-4 md:px-6 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.22),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.18),transparent_30%)]" />
        <div className="relative max-w-3xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">
            How Zuri works
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-950 leading-tight mb-6">
            From WhatsApp chaos to a system that runs itself
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Connect your WhatsApp and Zuri handles the operational grind — replies, follow-ups, stock, invoices —
            while the same account quietly builds your CV, finds opportunities, and preps you for interviews.
          </p>
        </div>
      </section>

      {/* 4 Steps */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto space-y-10">
          {PHASES.map((phase, idx) => (
            <div
              key={idx}
              className={`rounded-[1.75rem] border-2 p-8 md:p-10 ${phase.color} flex flex-col md:flex-row gap-8 items-start`}
            >
              {/* Icon / number */}
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-sm bg-white border border-gray-100">
                <span className={phase.iconBg}>{idx + 1}</span>
              </div>
              {/* Content */}
              <div className="flex-1">
                <h2 className="text-2xl font-black tracking-tight text-gray-950 mb-3">{phase.title}</h2>
                <p className="text-gray-600 leading-relaxed mb-6">{phase.description}</p>
                <ul className="space-y-3">
                  {phase.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
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
          <h2 className="text-3xl font-black tracking-tight text-gray-950 mb-10 text-center">
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
          <h2 className="text-3xl font-black tracking-tight text-gray-950 mb-4">
            Ready to run your business and grow your career?
          </h2>
          <p className="text-gray-500 mb-8">7-day free trial, full access. No credit card needed.</p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/25 text-base"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
