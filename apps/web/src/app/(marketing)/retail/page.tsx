import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🛒',
  label: 'Online Retail',
  headline: 'The back office your WhatsApp shop has never had',
  subheadline: 'Zuri tracks every order conversation, flags unhappy customers before they churn, drafts personalised win-back messages — and keeps your stock, pricing, and invoices in sync behind the scenes.',
  accentColor: 'text-green-700',
  accentBg: 'bg-green-50',
  capabilities: [
    { label: 'Order follow-ups' },
    { label: 'Inventory & stock tracking' },
    { label: 'Win-back campaigns' },
    { label: 'Voice-matched replies' },
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
      icon: '📊',
      title: 'Real stock, not guesswork',
      description: 'A stock ledger tracks every restock and sale, so you always know what\'s actually available — not what you think is left in the back room.',
    },
    {
      icon: '🔄',
      title: 'Win-back campaigns',
      description: 'Customers who haven\'t ordered in 30+ days get flagged. Zuri drafts a personalised "we miss you" message based on their last purchase.',
    },
    {
      icon: '🧾',
      title: 'Quotes & invoices, generated for you',
      description: 'Turn a WhatsApp conversation into a branded quotation or invoice in one tap — no separate invoicing app or spreadsheet.',
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
      title: 'Zuri builds buyer profiles and a live catalog',
      description: 'Every customer gets a profile — purchase history, satisfaction signals, communication style — while your products get real stock tracking.',
    },
    {
      title: 'Act on daily opportunities',
      description: 'Each morning, Zuri surfaces the customer conversations that need your attention — with a ready-to-send message for each one.',
    },
  ],
  scenario: {
    setup: 'A first-time buyer ordered, went quiet for three weeks, and never came back — a pattern that repeats across a shop\'s customer list without anyone noticing.',
    zuriDoes: 'Zuri flags the customer as at risk of churn based on the gap since their last order, and drafts a personal, purchase-specific "how did it work out?" message.',
    outcome: 'The shop owner reviews and sends it in seconds — the customer replies, reorders, and becomes a repeat buyer instead of a one-time sale.',
  },
}

export default function RetailPage() {
  return <IndustryPage config={config} />
}
