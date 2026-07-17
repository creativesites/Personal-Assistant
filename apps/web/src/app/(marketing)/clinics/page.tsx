import { IndustryPage } from '../_components/IndustryPage'
import type { IndustryConfig } from '../_components/IndustryPage'

const config: IndustryConfig = {
  icon: '🩺',
  label: 'Clinics & Health',
  headline: 'Run your clinic\'s front desk from WhatsApp — with AI backing you up',
  subheadline: 'Zuri tracks every patient conversation, remembers appointment history and follow-up needs, and drafts the reminders and check-ins your reception desk doesn\'t have time to send by hand.',
  accentColor: 'text-teal-700',
  accentBg: 'bg-teal-50',
  capabilities: [
    { label: 'Appointment reminders' },
    { label: 'No-show follow-ups' },
    { label: 'Patient history at a glance' },
    { label: 'Voice-matched replies' },
  ],
  benefits: [
    {
      icon: '📅',
      title: 'Appointment reminders',
      description: 'Zuri extracts appointment details mentioned in chats and reminds you (or the patient) 24 hours ahead — cutting down avoidable no-shows.',
    },
    {
      icon: '🩹',
      title: 'Follow-up care tracking',
      description: 'Post-visit and post-procedure follow-ups are flagged automatically, so a patient never falls through the cracks after a visit.',
    },
    {
      icon: '📋',
      title: 'Patient history at a glance',
      description: 'Past visits, conditions mentioned, and communication preferences are all captured in one profile — visible before you even reply.',
    },
    {
      icon: '😟',
      title: 'Urgency detection',
      description: 'Messages showing signs of distress or urgency are flagged for immediate attention, so nothing urgent sits in a queue.',
    },
    {
      icon: '🔁',
      title: 'Recall & re-booking nudges',
      description: 'Patients due for a check-up or who haven\'t booked in a while are surfaced with a ready-to-send re-booking message.',
    },
    {
      icon: '📊',
      title: 'Front-desk workload view',
      description: 'A daily queue of exactly who needs a reply, a reminder, or a follow-up — so reception always knows what matters most right now.',
    },
  ],
  useCases: [
    {
      title: 'Connect the clinic\'s WhatsApp',
      description: 'Scan a QR code and every existing patient conversation is read and organised automatically — no manual data entry.',
    },
    {
      title: 'Every patient gets a live profile',
      description: 'Appointment history, follow-up status, and communication style are all tracked without anyone typing it in.',
    },
    {
      title: 'The front desk works from one daily queue',
      description: 'Each morning, Zuri surfaces exactly who needs a reminder, a follow-up, or a reply — with a draft message ready for each.',
    },
  ],
  scenario: {
    setup: 'A patient had a procedure two weeks ago and hasn\'t been back in touch. Their file needs a follow-up call, but reception is juggling a full waiting room.',
    zuriDoes: 'Zuri flags the gap against the clinic\'s own follow-up window, pulls up what the procedure and prior notes were, and drafts a short, appropriately-toned check-in message.',
    outcome: 'Reception reviews and sends it in one tap — the patient is followed up on the same day it was due, without anyone having to remember to check.',
  },
}

export default function ClinicsPage() {
  return <IndustryPage config={config} />
}
