import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🔧',
  label: 'Mechanics',
  headline: 'Keep every customer coming back for their next service',
  subheadline: 'Zuri tracks service histories, sends timely maintenance reminders, and makes sure no client drives away and forgets you exist.',
  accentColor: 'text-orange-700',
  accentBg: 'bg-orange-50',
  stats: [
    { value: '2.7×', label: 'More return visits' },
    { value: '91%', label: 'Reminder open rate' },
    { value: '4.2×', label: 'ROI in first month' },
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
      title: 'Customer loyalty scores',
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
      description: 'Each customer gets a profile — vehicles they own, past issues, satisfaction scores, and when they last visited.',
    },
    {
      title: 'Never miss a service window',
      description: 'Zuri alerts you 2–4 weeks before a typical service interval and drafts the reminder for you to send in one tap.',
    },
  ],
  testimonial: {
    quote: "I used to lose customers after one repair because I had no system for follow-ups. Zuri changed that. My repeat business went up 70% in 8 weeks.",
    name: 'Brighton M.',
    role: 'Auto Repair Shop Owner',
    location: 'Lusaka',
  },
}

export default function MechanicsPage() {
  return <IndustryPage config={config} />
}
