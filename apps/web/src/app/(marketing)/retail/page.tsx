import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🛒',
  label: 'Online Retail',
  headline: 'Turn every WhatsApp customer into a loyal repeat buyer',
  subheadline: 'Zuri tracks every order conversation, flags unhappy customers before they churn, and drafts personalised follow-ups that bring buyers back — automatically.',
  accentColor: 'text-green-700',
  accentBg: 'bg-green-50',
  stats: [
    { value: '3.2×', label: 'Higher repeat purchase rate' },
    { value: '87%', label: 'Customer reply rate' },
    { value: '18%', label: 'Avg revenue increase' },
  ],
  benefits: [
    {
      icon: '📦',
      title: 'Order follow-up automation',
      description: 'Zuri detects when an order discussion goes quiet and nudges you to follow up — with a ready-made "did your order arrive okay?" message.',
    },
    {
      icon: '😤',
      title: 'Unhappy customer alerts',
      description: 'Sentiment analysis flags frustration the moment it appears. Get notified before a bad review — and a draft apology ready to send.',
    },
    {
      icon: '🎁',
      title: 'Birthday & occasion nudges',
      description: 'Zuri extracts birthdays from conversations and reminds you to send a personal discount or note — the kind of touch that turns buyers into fans.',
    },
    {
      icon: '🔄',
      title: 'Win-back campaigns',
      description: 'Customers who haven\'t ordered in 30+ days get flagged. Zuri drafts a personalised "we miss you" message based on their last purchase.',
    },
    {
      icon: '📊',
      title: 'Customer health scores',
      description: 'Every buyer gets a relationship health score. See at a glance which customers are thriving and which are at risk of churning.',
    },
    {
      icon: '✍️',
      title: 'Voice-matched replies',
      description: 'Replies that sound exactly like how your brand communicates — warm, professional, or casual — learned from your own past messages.',
    },
  ],
  useCases: [
    {
      title: 'Connect your business WhatsApp',
      description: 'Scan one QR code. Zuri starts reading all customer conversations immediately — new and existing threads.',
    },
    {
      title: 'Zuri builds buyer profiles',
      description: 'Every customer gets a profile: purchase history mentions, satisfaction signals, communication style, and relationship health score.',
    },
    {
      title: 'Act on daily opportunities',
      description: 'Each morning, Zuri surfaces 3–5 customer conversations that need your attention — with a ready-to-send message for each one.',
    },
  ],
  testimonial: {
    quote: "I used to lose track of so many customers after their first order. With Zuri, I turned 60% of first-time buyers into repeat customers within 3 months.",
    name: 'Nalwimba C.',
    role: 'Online Boutique Owner',
    location: 'Lusaka',
  },
}

export default function RetailPage() {
  return <IndustryPage config={config} />
}
