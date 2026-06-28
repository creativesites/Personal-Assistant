import Link from 'next/link'

const PHASES = [
  {
    phase: 'Phase 1',
    title: 'Connect your WhatsApp',
    icon: '📱',
    color: 'bg-green-50 border-green-200',
    iconBg: 'bg-green-100',
    steps: [
      {
        title: 'Scan one QR code',
        description: 'Open Zuri on any device, click "Connect WhatsApp", and scan the QR code with your phone. Your WhatsApp session links instantly — no app installation, no number changes.',
      },
      {
        title: 'Your number stays yours',
        description: 'Zuri runs alongside your existing WhatsApp — it reads and advises, but never sends a message without your explicit approval. Your contacts only ever hear from you.',
      },
      {
        title: 'Works on any plan',
        description: 'WhatsApp Business, personal accounts, and multi-device setups all work. One QR, one session, always in sync.',
      },
    ],
  },
  {
    phase: 'Phase 2',
    title: 'Zuri learns your network',
    icon: '🧠',
    color: 'bg-indigo-50 border-indigo-200',
    iconBg: 'bg-indigo-100',
    steps: [
      {
        title: 'Conversation analysis',
        description: 'Every message is processed through Zuri\'s intelligence engines — sentiment, urgency, topic extraction, promise detection, and emotional tone are captured in real-time.',
      },
      {
        title: 'Contact profiles emerge',
        description: 'Over days and weeks, Zuri builds deep psychological profiles: communication preferences, mood baselines, personality summaries, and what each person cares about most.',
      },
      {
        title: 'Relationship health scoring',
        description: 'Each contact gets a live health score (0–100) based on interaction frequency, sentiment trends, response times, and engagement depth. Scores update after every message.',
      },
    ],
  },
  {
    phase: 'Phase 3',
    title: 'Stay close, effortlessly',
    icon: '✨',
    color: 'bg-purple-50 border-purple-200',
    iconBg: 'bg-purple-100',
    steps: [
      {
        title: 'Daily nudges',
        description: 'Every morning Zuri surfaces 3–5 relationships that need attention — with context on why, and a draft message ready to send. You approve, edit, or skip. You\'re always in control.',
      },
      {
        title: 'Voice-matched drafts',
        description: 'Zuri learns your writing style from thousands of your own messages. Suggested replies sound like you wrote them — because they\'re based on how you already write.',
      },
      {
        title: 'Calendar intelligence',
        description: 'Birthdays, appointments, deadlines, and promises extracted from chats are added to your Zuri calendar automatically. Nothing falls through the cracks.',
      },
    ],
  },
]

const FAQS = [
  {
    q: 'Can Zuri read my private messages?',
    a: 'Zuri processes messages to power its intelligence features. Messages are encrypted in transit and at rest. We never sell your data or use it to train models for other users. You can delete all your data at any time from Settings → Privacy.',
  },
  {
    q: 'Does Zuri send messages automatically?',
    a: 'No. Zuri is an advisory tool — it suggests, you decide. In higher-tier plans, you can enable selective automation for specific contact categories, but it\'s always opt-in and you can see every message before it goes.',
  },
  {
    q: 'What happens if my WhatsApp session disconnects?',
    a: 'Zuri will alert you immediately. Your data and profiles are safely stored — Zuri just pauses new analysis until you reconnect. Reconnecting takes seconds.',
  },
  {
    q: 'How long does it take to see results?',
    a: 'Health scores and basic profiles appear within the first hour. Deeper profiles, voice matching, and accurate nudge timing improve over 7–14 days as Zuri processes more of your conversation history.',
  },
  {
    q: 'Does it work for business WhatsApp accounts?',
    a: 'Yes. WhatsApp Business accounts are fully supported, including product catalogues and business labels.',
  },
]

export default function HowItWorksPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 md:py-24 px-4 md:px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">How Zuri works</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            From WhatsApp to relationship intelligence in 60 seconds
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Zuri operates in three phases — connecting to your WhatsApp, learning your network over time, and then proactively helping you stay close to the people who matter most.
          </p>
        </div>
      </section>

      {/* 3 Phases */}
      {PHASES.map((phase, phaseIdx) => (
        <section
          key={phase.phase}
          className={`py-16 md:py-20 px-4 md:px-6 ${phaseIdx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
        >
          <div className="max-w-5xl mx-auto">
            <div className={`flex flex-col ${phaseIdx % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-10 lg:gap-16 items-center`}>
              {/* Visual side */}
              <div className={`flex-shrink-0 w-full max-w-xs mx-auto lg:mx-0 rounded-3xl border-2 p-8 ${phase.color}`}>
                <div className={`w-16 h-16 ${phase.iconBg} rounded-2xl flex items-center justify-center text-3xl mb-6`}>
                  {phase.icon}
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{phase.phase}</p>
                <h2 className="text-2xl font-extrabold text-gray-900 leading-tight">{phase.title}</h2>
              </div>

              {/* Steps side */}
              <div className="flex-1 space-y-6">
                {phase.steps.map((step, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1.5">{step.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* FAQ */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-10 text-center">Common questions</h2>
          <div className="space-y-5">
            {FAQS.map((faq) => (
              <div key={faq.q} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to see it in action?</h2>
          <p className="text-indigo-200 mb-8">Set up takes 60 seconds. No credit card required.</p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg text-base"
          >
            Get started free
          </Link>
        </div>
      </section>
    </div>
  )
}
