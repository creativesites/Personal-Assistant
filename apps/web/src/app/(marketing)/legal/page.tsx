import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '⚖️',
  label: 'Legal Firms',
  headline: 'Never let a client feel forgotten during their case',
  subheadline: 'Zuri tracks every client conversation, flags when communication has lapsed, and helps you send the right update at the right time — building the trust that wins referrals.',
  accentColor: 'text-slate-700',
  accentBg: 'bg-slate-50',
  stats: [
    { value: '94%', label: 'Client satisfaction rate' },
    { value: '2.8×', label: 'More referrals per client' },
    { value: '5hr', label: 'Saved on follow-ups weekly' },
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
      title: 'Relationship health by matter',
      description: 'Each active matter has a relationship health score. See at a glance which client relationships need more attention right now.',
    },
  ],
  useCases: [
    {
      title: 'Connect your firm\'s WhatsApp',
      description: 'All client conversations are processed immediately. Matter timelines and client communication patterns are extracted automatically.',
    },
    {
      title: 'Client profiles by matter',
      description: 'Each client gets a profile — their matter, key dates, communication preferences, anxiety level, and when they last received an update.',
    },
    {
      title: 'Proactive client communication',
      description: 'Daily nudges surface which clients need a check-in, with a concise status update draft tailored to their matter.',
    },
  ],
  testimonial: {
    quote: "Clients used to call asking for updates because they hadn\'t heard from us. With Zuri, we reach out first. Our client satisfaction scores are the highest they\'ve ever been.",
    name: 'Adv. Simfukwe T.',
    role: 'Managing Partner',
    location: 'Lusaka',
  },
}

export default function LegalPage() {
  return <IndustryPage config={config} />
}
