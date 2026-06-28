import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🏠',
  label: 'Real Estate',
  headline: 'Close more deals by never losing track of a lead',
  subheadline: 'Zuri tracks every buyer, seller, and tenant conversation — scoring lead warmth in real-time and prompting you to follow up before a client goes to a competitor.',
  accentColor: 'text-blue-700',
  accentBg: 'bg-blue-50',
  stats: [
    { value: '2.4×', label: 'More closed deals' },
    { value: '67%', label: 'Lead conversion rate' },
    { value: '15hr', label: 'Saved per week' },
  ],
  benefits: [
    {
      icon: '🌡️',
      title: 'Lead temperature scoring',
      description: 'Every lead gets a real-time warmth score based on engagement frequency, urgency signals, and conversation sentiment. Prioritise the hottest leads instantly.',
    },
    {
      icon: '🏘️',
      title: 'Property preference tracking',
      description: 'Zuri extracts property requirements — location, size, budget, timeline — from conversations. See every buyer\'s wish list at a glance.',
    },
    {
      icon: '⏰',
      title: 'Follow-up timing',
      description: 'Leads that go quiet after a viewing or quote get flagged at exactly the right moment. Zuri drafts the "just checking in" message that feels natural.',
    },
    {
      icon: '🤝',
      title: 'Seller relationship tracking',
      description: 'Track vendor relationships separately — Zuri monitors their sentiment and flags when a seller might be getting impatient or considering other agents.',
    },
    {
      icon: '📋',
      title: 'Tenant follow-ups',
      description: 'Maintenance requests, renewal conversations, and payment follow-ups are all tracked. Never lose a thread in the noise of managing multiple properties.',
    },
    {
      icon: '🎯',
      title: 'Portfolio-wide health',
      description: 'Get a dashboard view of every active relationship — buyers, sellers, tenants, and landlords — all scored and ranked by urgency.',
    },
  ],
  useCases: [
    {
      title: 'Connect your WhatsApp',
      description: 'All your existing client conversations are analysed immediately. Lead profiles, property preferences, and warmth scores appear within the hour.',
    },
    {
      title: 'Every lead gets a live profile',
      description: 'Buyers, sellers, tenants, and landlords each get profiles — their property requirements, engagement level, and relationship health score.',
    },
    {
      title: 'Never lose a deal to silence',
      description: 'Zuri monitors every active thread and alerts you the moment a lead goes quiet — with a follow-up draft ready to send in one tap.',
    },
  ],
  testimonial: {
    quote: "I was losing leads to silence — they\'d enquire, I\'d get busy, and by the time I followed up they\'d gone with another agent. Zuri ended that.",
    name: 'Tendai R.',
    role: 'Real Estate Agent',
    location: 'Harare',
  },
}

export default function RealEstatePage() {
  return <IndustryPage config={config} />
}
