'use client'

import { Input } from '@/components/ui'
import type { CareerProfile } from './use-career-profile'

// CV Studio §4 Step 1 — Personal Details.

export function PersonalDetailsStep({
  profile, updateField,
}: {
  profile: CareerProfile
  updateField: <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => void
}) {
  const field = (key: keyof CareerProfile, label: string, placeholder?: string) => (
    <Input
      label={label}
      placeholder={placeholder}
      defaultValue={(profile[key] as string) ?? ''}
      onBlur={e => updateField(key, e.target.value || null)}
    />
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Your professional title, contact details, and links — the header of every CV generated from your profile.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field('headline', 'Professional title', 'e.g. Senior Software Engineer')}
        {field('phone', 'Phone')}
        {field('location', 'Location', 'City, Country')}
        {field('country', 'Country')}
        {field('githubUrl', 'GitHub URL')}
        {field('linkedinUrl', 'LinkedIn URL')}
        {field('portfolioUrl', 'Portfolio URL')}
        {field('websiteUrl', 'Website URL')}
        {field('drivingLicence', 'Driving licence')}
        {field('nationality', 'Nationality (optional, hidden by default)')}
        {field('passportOrNrc', 'Passport / NRC (optional, hidden by default)')}
        {field('workAuthorization', 'Work permit / authorization status')}
      </div>
    </div>
  )
}
