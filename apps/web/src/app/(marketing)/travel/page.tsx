import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '✈️',
  label: 'Travel & Tourism',
  headline: 'Every traveller feels like your only client',
  subheadline: 'Zuri tracks every quote, itinerary, and enquiry — scoring lead interest in real time and sending the perfect follow-up at exactly the right moment, so no quote goes cold in your inbox.',
  accentColor: 'text-sky-700',
  accentBg: 'bg-sky-50',
  capabilities: [
    { label: 'Destination preference tracking' },
    { label: 'Quote follow-up timing' },
    { label: 'Lead urgency scoring' },
    { label: 'Post-trip follow-ups' },
  ],
  benefits: [
    {
      icon: '🌍',
      title: 'Destination preference tracking',
      description: 'Zuri captures destination wishes, travel dates, budget signals, and group size from every conversation. Know exactly what each traveller is looking for.',
    },
    {
      icon: '💼',
      title: 'Quote follow-up timing',
      description: 'Sent a quote and gone quiet? Zuri knows when a traveller is thinking it over and nudges you to follow up before they book elsewhere.',
    },
    {
      icon: '🎯',
      title: 'Lead urgency scoring',
      description: 'Urgent travellers with imminent departure dates get prioritised automatically. Never miss a hot lead in a cluttered inbox.',
    },
    {
      icon: '📸',
      title: 'Post-trip follow-ups',
      description: 'After a trip, Zuri prompts you to check in and ask about their experience — turning happy travellers into repeat clients and referral sources.',
    },
    {
      icon: '🗓️',
      title: 'Booking anniversary nudges',
      description: 'On the anniversary of a past trip, Zuri suggests reaching out with a "time for another adventure?" message — capitalising on nostalgia.',
    },
    {
      icon: '✨',
      title: 'Personalised itinerary context',
      description: 'Client interests, travel style, and past trip mentions are all stored in their profile — so every itinerary you propose feels tailor-made.',
    },
  ],
  useCases: [
    {
      title: 'Connect your travel agency WhatsApp',
      description: 'All existing client conversations are analysed immediately. Travel preferences and lead warmth scores appear within the hour.',
    },
    {
      title: 'Every enquiry gets a live profile',
      description: 'Destination preferences, budget signals, travel dates, and urgency level — all extracted automatically from your WhatsApp conversations.',
    },
    {
      title: 'Convert more quotes to bookings',
      description: 'Zuri monitors every open quote and nudges you at exactly the right moment — with a personalised follow-up draft that converts.',
    },
  ],
  scenario: {
    setup: 'A traveller asked for a quote on a family trip, received it, and went quiet — with a departure date close enough that the window to book is closing.',
    zuriDoes: 'Zuri flags the quote as urgent based on the travel dates mentioned, and drafts a follow-up referencing the exact itinerary already discussed.',
    outcome: 'The agent sends a specific, well-timed nudge instead of a generic check-in — the traveller books before the dates make the trip impossible.',
  },
}

export default function TravelPage() {
  return <IndustryPage config={config} />
}
