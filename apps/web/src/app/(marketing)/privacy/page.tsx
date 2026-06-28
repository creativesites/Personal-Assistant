import Link from 'next/link'

const SECTIONS = [
  {
    icon: '📖',
    title: 'What Zuri reads',
    content: [
      'Zuri accesses your WhatsApp messages through a secure, official connection initiated by you. It reads message content, timestamps, sender information, and media metadata (but not media files themselves).',
      'This data is used exclusively to power your Zuri features: contact profiles, health scores, nudge generation, and reply drafts. It is never shared with other Zuri users or third parties for advertising.',
      'Zuri does not read WhatsApp groups you haven\'t explicitly enabled analysis for.',
    ],
  },
  {
    icon: '🔒',
    title: 'How your data is protected',
    content: [
      'All message data is encrypted in transit using TLS 1.3. At rest, your data is encrypted using AES-256.',
      'Your WhatsApp session credentials are stored in an isolated Docker volume on a server you control. Zuri\'s servers process messages but do not retain raw message content beyond the current analysis window.',
      'Contact profiles, health scores, and AI-generated insights are stored in your private, isolated database partition. No data is shared between users.',
    ],
  },
  {
    icon: '⏸️',
    title: 'Pausing monitoring',
    content: [
      'You can pause Zuri\'s monitoring at any time from Settings → Privacy. When paused, Zuri stops reading new messages immediately. Existing profiles and scores are preserved.',
      'Pausing is useful before sensitive conversations or when you need a complete break. There\'s no penalty — you can resume instantly.',
      'You can also selectively pause monitoring for specific contacts from their contact detail page.',
    ],
  },
  {
    icon: '🗑️',
    title: 'Deleting your data',
    content: [
      'From Settings → Privacy → Delete my data, you can permanently delete all of your Zuri data: contact profiles, health scores, message analysis, calendar events, and AI suggestions.',
      'Deletion is immediate and irreversible. Within 24 hours, all your data is purged from our servers and backups.',
      'You can also export a complete archive of your Zuri data before deletion.',
    ],
  },
  {
    icon: '🤖',
    title: 'AI and your data',
    content: [
      'Zuri uses large language models (LLMs) to analyse messages and generate suggestions. Message snippets may be sent to AI providers (Anthropic, Google, OpenAI) for processing. These providers are bound by data processing agreements and do not use your data to train their public models.',
      'Zuri does not train its own models on your personal messages. Your data improves your Zuri experience only — not anyone else\'s.',
      'The voice profile Zuri builds for reply drafts is generated from your own message history and never leaves your private data partition.',
    ],
  },
  {
    icon: '🌍',
    title: 'Data residency',
    content: [
      'Zuri\'s servers are hosted in Asia Pacific (Alibaba Cloud). Your data may be processed by AI providers in the United States and Europe. We are working toward regional data residency options for African customers.',
      'By using Zuri, you consent to cross-border data transfer under standard contractual clauses consistent with applicable data protection law.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 md:py-20 px-4 md:px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-4">Privacy</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            Your data. Your control.
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            Zuri reads your WhatsApp to help you — not to sell your data. Here&apos;s exactly what we access, how we protect it, and how you can delete it at any time.
          </p>
        </div>
      </section>

      {/* Quick summary cards */}
      <section className="py-10 px-4 md:px-6 border-b border-gray-100">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🚫', label: 'No selling', detail: 'Your data is never sold or shared for advertising' },
            { icon: '✅', label: 'You control', detail: 'Pause or delete everything, any time' },
            { icon: '🔐', label: 'Encrypted', detail: 'TLS in transit, AES-256 at rest' },
            { icon: '👤', label: 'Isolated', detail: 'No data shared between users, ever' },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-2xl p-4 text-center">
              <span className="text-2xl mb-2 block">{item.icon}</span>
              <p className="font-semibold text-gray-900 text-sm mb-1">{item.label}</p>
              <p className="text-xs text-gray-500 leading-snug">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Content sections */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50">
                <span className="text-xl">{section.icon}</span>
                <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
              </div>
              <div className="px-6 py-5 space-y-3">
                {section.content.map((paragraph, i) => (
                  <p key={i} className="text-sm text-gray-600 leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact + controls */}
      <section className="bg-gray-50 py-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions about your data?</h2>
          <p className="text-gray-600 mb-6">
            Email us at <a href="mailto:privacy@zuri.ai" className="text-indigo-600 hover:underline font-medium">privacy@zuri.ai</a>. We aim to respond within 48 hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/settings"
              className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Manage privacy settings
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Create an account
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
