import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🔧',
  label: 'Mechanics',
  headline: 'Keep every customer coming back for their next service',
  subheadline: 'Zuri tracks service histories, sends timely maintenance reminders, and makes sure no client drives away and forgets you exist — the follow-up system a busy shop never has time to run by hand.',
  accentColor: 'text-orange-700',
  accentBg: 'bg-orange-50',
  capabilities: [
    { label: 'Service reminders' },
    { label: 'Vehicle history tracking' },
    { label: 'Quote follow-ups' },
    { label: 'Loyalty tracking' },
  ],
  benefits: [
    {
      icon: '🗓️',
      title: 'Service reminder nudges',
      description: 'Zuri extracts service dates and vehicle mentions from conversations, then reminds you to reach out when the next oil change or service is due.',
    },
    {
      icon: '🚗',
      title: 'Vehicle history tracking',
      description: 'Every vehicle mentioned in your chats gets tracked — make, model, issues, and repairs. Know every car\'s history before the owner messages you.',
    },
    {
      icon: '⭐',
      title: 'Satisfaction follow-ups',
      description: 'After a repair, Zuri prompts you to follow up and check the customer is happy — catching issues before they become complaints.',
    },
    {
      icon: '💬',
      title: 'Quote follow-ups',
      description: 'Customers who received a quote and went quiet get a gentle nudge. Zuri drafts a "did you get a chance to think it over?" message.',
    },
    {
      icon: '📈',
      title: 'Customer loyalty tracking',
      description: 'See which customers are most loyal and which haven\'t been in for a while. Prioritise who to reconnect with.',
    },
    {
      icon: '🎯',
      title: 'Referral prompts',
      description: 'Happy customers get flagged as referral opportunities. Zuri suggests the perfect moment to ask for a recommendation.',
    },
  ],
  useCases: [
    {
      title: 'Connect your WhatsApp',
      description: 'Your existing customer chat history is read immediately. Vehicle details and service mentions are extracted automatically.',
    },
    {
      title: 'Profiles for every vehicle owner',
      description: 'Each customer gets a profile — vehicles they own, past issues, and when they last visited.',
    },
    {
      title: 'Never miss a service window',
      description: 'Zuri alerts you 2–4 weeks before a typical service interval and drafts the reminder for you to send in one tap.',
    },
  ],
  scenario: {
    setup: 'A customer had their car serviced four months ago — right around when they\'re due again — but nobody on the shop floor is tracking that calendar.',
    zuriDoes: 'Zuri matches the vehicle\'s service interval against the last visit on file and drafts a specific reminder mentioning the actual car and last service done.',
    outcome: 'The reminder goes out before the customer even thinks about it — the car comes back in, instead of going to whichever shop they remember first.',
  },
}

export default function MechanicsPage() {
  return <IndustryPage config={config} />
}
