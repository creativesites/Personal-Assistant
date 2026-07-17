'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

// CV Studio Phase 4 — shared profile state for every wizard step that
// reads/writes career_profiles directly (Personal Details, Summary,
// Objectives, Additional Information). One fetch, optimistic local update
// + fire-and-forget PATCH per field — matches the autosave-on-blur
// discipline every other wizard step uses.

export interface CareerProfile {
  fullName: string | null
  email: string | null
  headline: string | null
  summary: string | null
  careerGoalsText: string | null
  targetRoles: string[]
  targetIndustries: string[]
  salaryExpectationCents: number | null
  salaryCurrency: string
  remotePreference: string | null
  relocationPreference: string | null
  workAuthorization: string | null
  githubUrl: string | null
  linkedinUrl: string | null
  portfolioUrl: string | null
  country: string | null
  phone: string | null
  location: string | null
  websiteUrl: string | null
  drivingLicence: string | null
  nationality: string | null
  passportOrNrc: string | null
  availability: string | null
  noticePeriod: string | null
  interests: string[]
  referencesMode: 'available_on_request' | 'listed'
  defaultPageSize: 'A4' | 'Letter'
  useCvTerminology: boolean
}

export function useCareerProfile(token: string) {
  const [profile, setProfile] = useState<CareerProfile | null>(null)

  useEffect(() => {
    apiClient<{ profile: CareerProfile }>('/api/career/profile', { token }).then(d => setProfile(d.profile))
  }, [token])

  const updateField = useCallback(<K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => {
    setProfile(prev => (prev ? { ...prev, [key]: value } : prev))
    apiClient('/api/career/profile', { method: 'PATCH', token, body: JSON.stringify({ [key]: value }) }).catch(() => {})
  }, [token])

  return { profile, updateField }
}
