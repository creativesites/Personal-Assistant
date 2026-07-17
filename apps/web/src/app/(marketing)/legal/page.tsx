import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '⚖️',
  label: 'Legal Firms',
  headline: 'Run client communication like a firm three times your size',
  subheadline: 'Zuri tracks every client conversation, flags when an update has lapsed, and drafts the status message before a client has to call and ask — the operational discipline that wins referrals.',
  accentColor: 'text-slate-700',
  accentBg: 'bg-slate-50',
  capabilities: [
    { label: 'Case update reminders' },
    { label: 'Deadline extraction' },
    { label: 'Sentiment monitoring' },
    { label: 'Confidentiality-first storage' },
  ],
  benefits: [
    {
      icon: '📋',
      title: 'Case update reminders',
      description: 'Zuri detects when a client hasn\'t heard an update in too long and prompts you to send a brief status message — before they call in frustration.',
    },
    {
      icon: '📅',
      title: 'Deadline tracking',
      description: 'Important dates and deadlines mentioned in conversations are extracted and added to your Zuri calendar with automatic alerts.',
    },
    {
      icon: '🤝',
      title: 'Client sentiment monitoring',
      description: 'Anxiety and frustration signals in client messages are flagged immediately. Respond before small concerns become formal complaints.',
    },
    {
      icon: '🔐',
      title: 'Confidentiality-first design',
      description: 'Client data is stored in your isolated private partition. We apply strict data handling practices appropriate for legal and professional services.',
    },
    {
      icon: '🎯',
      title: 'Referral opportunity detection',
      description: 'Satisfied clients who mention friends or family with legal needs are flagged — with a polite ask-for-referral draft ready to use.',
    },
    {
      icon: '📊',
      title: 'Matter health by client',
      description: 'Each active matter gets a communication health score, so you can see at a glance which clients need more attention right now.',
    },
  ],
  useCases: [
    {
      title: 'Connect your firm\'s WhatsApp',
      description: 'All client conversations are processed immediately. Matter timelines and client communication patterns are extracted automatically.',
    },
    {
      title: 'Client profiles by matter',
      description: 'Each client gets a profile — their matter, key dates, communication preferences, and when they last received an update.',
    },
    {
      title: 'Proactive client communication',
      description: 'Daily nudges surface which clients need a check-in, with a concise status update draft tailored to their matter.',
    },
  ],
  scenario: {
    setup: 'A client\'s matter has been quiet for three weeks while the firm waited on a filing — no bad news, just no news, which clients read as neglect.',
    zuriDoes: 'Zuri flags the communication gap against the matter\'s own update cadence and drafts a short, professional status message summarising exactly where things stand.',
    outcome: 'The associate reviews and sends it in under a minute — the client hears from the firm before they ever have reason to call and ask.',
  },
}

export default function LegalPage() {
  return <IndustryPage config={config} />
}
