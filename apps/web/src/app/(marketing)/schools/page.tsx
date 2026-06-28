import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🎓',
  label: 'Schools',
  headline: 'Keep every parent informed, engaged, and loyal',
  subheadline: 'Zuri tracks every parent conversation, flags follow-ups for enrolment enquiries, and helps schools communicate with the personal touch that builds community trust.',
  accentColor: 'text-purple-700',
  accentBg: 'bg-purple-50',
  stats: [
    { value: '89%', label: 'Parent engagement rate' },
    { value: '3.4×', label: 'More enrolment conversions' },
    { value: '76%', label: 'Reduction in missed follow-ups' },
  ],
  benefits: [
    {
      icon: '📝',
      title: 'Enrolment enquiry follow-ups',
      description: 'Parents who enquire about enrolment and go quiet get flagged at the perfect moment. Zuri drafts a warm, personalised follow-up that moves the conversation forward.',
    },
    {
      icon: '👨‍👩‍👧',
      title: 'Parent relationship profiles',
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
      title: 'School-wide relationship health',
      description: 'A dashboard view of all parent relationships — enrolment pipeline, active families, at-risk families, and engagement scores across the school.',
    },
  ],
  useCases: [
    {
      title: 'Connect the school WhatsApp',
      description: 'All parent conversations are analysed immediately. Family profiles and enrolment pipeline scores appear within the hour.',
    },
    {
      title: 'Every family gets a profile',
      description: 'Student names, class details, parent communication preferences, satisfaction level, and relationship health score — built automatically.',
    },
    {
      title: 'Proactive parent engagement',
      description: 'Daily alerts surface families that need attention — a follow-up, a check-in, or an outstanding confirmation — with ready-to-send messages.',
    },
  ],
  testimonial: {
    quote: "Our enrolment conversion went from 31% to 84% after we started using Zuri. Parents feel like we actually care — because now we actually follow up.",
    name: 'Mrs. Phiri N.',
    role: 'Head of Admissions',
    location: 'Lusaka',
  },
}

export default function SchoolsPage() {
  return <IndustryPage config={config} />
}
