import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🏠',
  label: 'Real Estate',
  headline: 'Close more deals by never losing track of a lead',
  subheadline: 'Zuri scores every buyer, seller, and tenant conversation in real time and prompts you to follow up before a client goes to a competitor — a full pipeline running quietly behind your WhatsApp.',
  accentColor: 'text-blue-700',
  accentBg: 'bg-blue-50',
  capabilities: [
    { label: 'Lead temperature scoring' },
    { label: 'Property preference tracking' },
    { label: 'Follow-up timing' },
    { label: 'Portfolio-wide pipeline view' },
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
      title: 'Seller communication tracking',
      description: 'Track vendor conversations separately — Zuri monitors sentiment and flags when a seller might be getting impatient or considering other agents.',
    },
    {
      icon: '📋',
      title: 'Tenant follow-ups',
      description: 'Maintenance requests, renewal conversations, and payment follow-ups are all tracked. Never lose a thread in the noise of managing multiple properties.',
    },
    {
      icon: '🎯',
      title: 'Portfolio-wide pipeline',
      description: 'A dashboard view of every active lead — buyers, sellers, tenants, and landlords — scored and ranked by urgency.',
    },
  ],
  useCases: [
    {
      title: 'Connect your WhatsApp',
      description: 'All your existing client conversations are analysed immediately. Lead profiles, property preferences, and warmth scores appear within the hour.',
    },
    {
      title: 'Every lead gets a live profile',
      description: 'Buyers, sellers, tenants, and landlords each get profiles — their property requirements, engagement level, and pipeline stage.',
    },
    {
      title: 'Never lose a deal to silence',
      description: 'Zuri monitors every active thread and alerts you the moment a lead goes quiet — with a follow-up draft ready to send in one tap.',
    },
  ],
  scenario: {
    setup: 'A buyer viewed a property, asked a few sharp questions, and then went quiet for eight days — long enough to be at real risk of moving to another agent.',
    zuriDoes: 'Zuri flags the lead as cooling, surfaces exactly what they asked and what mattered to them from the viewing conversation, and drafts a specific, non-generic check-in.',
    outcome: 'The agent sends it in one tap instead of a vague "just checking in" — the buyer replies within the hour, and the deal stays alive.',
  },
}

export default function RealEstatePage() {
  return <IndustryPage config={config} />
}
