import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🍽',
  label: 'Restaurants',
  headline: 'Turn first-time diners into regulars — without lifting a finger',
  subheadline: 'Zuri tracks every reservation conversation, remembers diner preferences, and sends the right nudge at the right moment to bring customers back to your table.',
  accentColor: 'text-red-700',
  accentBg: 'bg-red-50',
  capabilities: [
    { label: 'Reservation extraction' },
    { label: 'Preference memory' },
    { label: 'Win-back nudges' },
    { label: 'Post-visit follow-ups' },
  ],
  benefits: [
    {
      icon: '📅',
      title: 'Reservation management',
      description: 'Zuri extracts reservation details from your WhatsApp chats — date, time, party size — and reminds you to confirm 24 hours in advance.',
    },
    {
      icon: '🥘',
      title: 'Preference memory',
      description: 'Dietary requirements, favourite dishes, and special requests mentioned in conversations are captured in each diner\'s profile.',
    },
    {
      icon: '🎂',
      title: 'Occasion spotting',
      description: 'Birthdays, anniversaries, and celebrations mentioned in chats are flagged. Reach out with a personal offer before the big day.',
    },
    {
      icon: '🔄',
      title: 'Win-back nudges',
      description: 'Regulars who haven\'t booked in 30+ days get flagged. Zuri drafts a personal "we haven\'t seen you in a while" message that feels genuine.',
    },
    {
      icon: '⭐',
      title: 'Post-visit follow-ups',
      description: 'After a booking, Zuri prompts you to follow up and check satisfaction — catching issues early and generating stronger word-of-mouth.',
    },
    {
      icon: '📣',
      title: 'Event promotions',
      description: 'When you have a special event or new menu, Zuri identifies which customers are most likely to be interested and drafts personalised invites.',
    },
  ],
  useCases: [
    {
      title: 'Connect your restaurant WhatsApp',
      description: 'Your entire booking history and customer conversations are analysed immediately. Diner profiles appear within the first hour.',
    },
    {
      title: 'Every regular gets a profile',
      description: 'Dining preferences, visit frequency, and satisfaction signals — all built automatically from your conversations.',
    },
    {
      title: 'Fill tables effortlessly',
      description: 'Daily nudges tell you which customers haven\'t visited in a while and draft the perfect re-engagement message for each one.',
    },
  ],
  scenario: {
    setup: 'A regular who used to book every couple of weeks hasn\'t made a reservation in over a month — easy to miss when you\'re juggling tonight\'s bookings.',
    zuriDoes: 'Zuri flags the gap against that diner\'s usual visit rhythm, recalls their favourite table and dish from past chats, and drafts a warm, specific check-in.',
    outcome: 'The message goes out same-day instead of never — the diner books again, and the table doesn\'t sit empty on a night it didn\'t have to.',
  },
}

export default function RestaurantsPage() {
  return <IndustryPage config={config} />
}
