import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '👩🏽‍⚕️',
  label: 'Clinics & Health',
  headline: 'Reduce no-shows and keep every patient close',
  subheadline: 'Zuri sends timely appointment reminders, tracks patient follow-up conversations, and helps you deliver the personalised care that builds lifelong patient loyalty.',
  accentColor: 'text-teal-700',
  accentBg: 'bg-teal-50',
  stats: [
    { value: '64%', label: 'Reduction in no-shows' },
    { value: '3×', label: 'More follow-up visits' },
    { value: '96%', label: 'Patient satisfaction score' },
  ],
  benefits: [
    {
      icon: '📅',
      title: 'Appointment reminders',
      description: 'Zuri extracts appointment details from your WhatsApp conversations and prompts you to send reminders 24 hours and 2 hours before — drastically cutting no-shows.',
    },
    {
      icon: '💊',
      title: 'Medication follow-ups',
      description: 'Track which patients are on ongoing treatment. Get nudged to check in when a patient hasn\'t responded since their last prescription.',
    },
    {
      icon: '🫀',
      title: 'Patient health tracking',
      description: 'Each patient gets a relationship profile — their communication style, health mentions, satisfaction signals, and how engaged they are with their care.',
    },
    {
      icon: '🔔',
      title: 'Recall campaign nudges',
      description: 'Patients who haven\'t visited in 3+ months get flagged. Zuri drafts a caring "time for your check-up" message that feels personal, not generic.',
    },
    {
      icon: '✨',
      title: 'Sensitive tone matching',
      description: 'Healthcare communication requires extra care. Zuri\'s voice matching learns your clinic\'s tone — warm, professional, and appropriate for health contexts.',
    },
    {
      icon: '🔒',
      title: 'Privacy-first design',
      description: 'Patient data is stored in your isolated private partition. We never share, aggregate, or use patient information for any purpose beyond your Zuri account.',
    },
  ],
  useCases: [
    {
      title: 'Connect your clinic WhatsApp',
      description: 'Scan one QR code. Zuri reads all patient conversations immediately and begins extracting appointment and health context.',
    },
    {
      title: 'Patient profiles are built automatically',
      description: 'Each patient gets a profile based on their conversations — visit history mentions, health topics, satisfaction levels, and responsiveness.',
    },
    {
      title: 'Proactive patient care',
      description: 'Daily alerts tell you which patients need a follow-up, which appointments need reminders, and which patients have gone quiet.',
    },
  ],
  testimonial: {
    quote: "Our no-show rate dropped from 35% to under 12% in six weeks. Zuri\'s reminders feel personal — patients actually respond to them.",
    name: 'Dr. Mwamba K.',
    role: 'General Practitioner',
    location: 'Lusaka',
  },
}

export default function ClinicsPage() {
  return <IndustryPage config={config} />
}
