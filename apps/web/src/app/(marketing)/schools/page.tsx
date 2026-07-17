import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🎓',
  label: 'Schools',
  headline: 'Keep every parent informed, engaged, and enrolled',
  subheadline: 'Zuri tracks every parent conversation, flags enrolment enquiries before they go cold, and helps schools communicate with the personal touch that builds community trust and fills classrooms.',
  accentColor: 'text-purple-700',
  accentBg: 'bg-purple-50',
  capabilities: [
    { label: 'Enrolment follow-ups' },
    { label: 'Family profiles' },
    { label: 'Event reminders' },
    { label: 'At-risk family detection' },
  ],
  benefits: [
    {
      icon: '📝',
      title: 'Enrolment enquiry follow-ups',
      description: 'Parents who enquire about enrolment and go quiet get flagged at the perfect moment. Zuri drafts a warm, personalised follow-up that moves the conversation forward.',
    },
    {
      icon: '👨‍👩‍👧',
      title: 'Family profiles',
      description: 'Each parent gets a profile — their child\'s name and class, communication style, concerns they\'ve raised, and how engaged they are with school communications.',
    },
    {
      icon: '📣',
      title: 'Event reminders',
      description: 'Parents who haven\'t confirmed attendance for events, meetings, or payment deadlines get timely, gentle reminders — drafted and ready to send.',
    },
    {
      icon: '❤️',
      title: 'At-risk family detection',
      description: 'Families showing signs of disengagement or dissatisfaction are flagged early — before they withdraw their child or spread negative word-of-mouth.',
    },
    {
      icon: '🌟',
      title: 'Personalised communication',
      description: 'Every parent communication sounds personal, not broadcast. Zuri learns the school\'s tone and adapts messages so they feel written just for that family.',
    },
    {
      icon: '📊',
      title: 'School-wide enrolment pipeline',
      description: 'A dashboard view of every enquiry — enrolment pipeline stage, active families, at-risk families, and engagement across the school.',
    },
  ],
  useCases: [
    {
      title: 'Connect the school WhatsApp',
      description: 'All parent conversations are analysed immediately. Family profiles and enrolment pipeline stages appear within the hour.',
    },
    {
      title: 'Every family gets a profile',
      description: 'Student names, class details, parent communication preferences, and engagement level — built automatically.',
    },
    {
      title: 'Proactive parent engagement',
      description: 'Daily alerts surface families that need attention — a follow-up, a check-in, or an outstanding confirmation — with ready-to-send messages.',
    },
  ],
  scenario: {
    setup: 'A parent enquired about a place for next term, asked two follow-up questions, then went quiet for a week — a warm lead cooling with nobody assigned to chase it.',
    zuriDoes: 'Zuri flags the enquiry as stalled, recalls exactly what the parent asked about, and drafts a warm follow-up addressing their specific questions.',
    outcome: 'Admissions sends it in one tap — the parent responds, books a visit, and the enquiry converts instead of quietly disappearing.',
  },
}

export default function SchoolsPage() {
  return <IndustryPage config={config} />
}
