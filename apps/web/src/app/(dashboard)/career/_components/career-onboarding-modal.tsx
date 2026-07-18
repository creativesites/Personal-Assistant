'use client'

import { useState } from 'react'
import { Briefcase, Building2, Handshake, Loader2, Search, Users } from 'lucide-react'
import { Modal, Input } from '@/components/ui'
import { apiClient } from '@/lib/api'
import type { CareerProfile } from './cv-studio/use-career-profile'

// Career OS Living Companion redesign — shown once, on first visit
// (career_profiles.onboarding_completed_at IS NULL). Spec §2/§3: ask how
// Zuri should help, then — for the two modes where a job/gig search is the
// primary lens — collect only the 6 fields job_discovery.py's own gate
// actually needs (target_roles, skills, experience level, location/remote,
// employment type, salary optional), never the full CV-Studio-style
// profile. Saving triggers the very first job-discovery run automatically
// (spec §4 — no manual button click required), exempted from the daily
// manual-run cap by career-job-discovery.ts's first_search_started_at check.

const MODES = [
  { value: 'job_seeker', label: 'Find a job', icon: Search, description: "I'm looking for my next role" },
  { value: 'employed', label: 'Grow where I am', icon: Briefcase, description: 'Employed, focused on advancing my career' },
  { value: 'freelancer', label: 'Freelance / consult', icon: Handshake, description: 'Find clients and contract work' },
  { value: 'business_owner', label: 'Grow my business', icon: Building2, description: 'Networking, partnerships, hiring' },
  { value: 'networking', label: 'Just networking', icon: Users, description: 'Build and maintain professional relationships' },
] as const

type CareerMode = typeof MODES[number]['value']

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry level' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
] as const

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const
const REMOTE_PREFERENCES = ['onsite', 'hybrid', 'remote', 'no_preference'] as const

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center rounded-2xl px-3 text-xs font-bold transition-colors ${
        selected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
      }`}
    >
      {label.replace(/_/g, ' ')}
    </button>
  )
}

export function CareerOnboardingModal({
  token, onComplete, onStartFirstSearch,
}: {
  token: string
  onComplete: () => void
  onStartFirstSearch: () => void
}) {
  const [step, setStep] = useState<'mode' | 'quickstart' | 'confirm'>('mode')
  const [mode, setMode] = useState<CareerMode>('job_seeker')
  const [saving, setSaving] = useState(false)

  const [targetRole, setTargetRole] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [experienceLevel, setExperienceLevel] = useState<typeof EXPERIENCE_LEVELS[number]['value']>('mid')
  const [location, setLocation] = useState('')
  const [remotePreference, setRemotePreference] = useState<typeof REMOTE_PREFERENCES[number]>('no_preference')
  const [employmentTypes, setEmploymentTypes] = useState<string[]>(['full_time'])
  const [salary, setSalary] = useState('')

  const isSearchMode = mode === 'job_seeker' || mode === 'freelancer'

  const toggleEmploymentType = (t: string) => {
    setEmploymentTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const finish = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        careerMode: mode,
        onboardingCompleted: true,
      }
      if (isSearchMode) {
        const roles = targetRole.split(',').map(s => s.trim()).filter(Boolean)
        const skills = skillsInput.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name }))
        body.targetRoles = roles
        body.skills = skills
        body.experienceLevel = experienceLevel
        body.remotePreference = remotePreference
        body.employmentTypePreference = employmentTypes
        if (location.trim()) body.location = location.trim()
        if (salary.trim()) body.salaryExpectationCents = Math.round(Number(salary) * 100)
      }
      await apiClient('/api/career/profile', { method: 'PATCH', token, body: JSON.stringify(body) })
      onComplete()
      if (isSearchMode && targetRole.trim()) {
        onStartFirstSearch()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => {}} title="" size="md">
      <div className="p-1">
        {step === 'mode' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-950">How would you like Zuri to help your career?</h2>
              <p className="text-sm text-gray-500 mt-1">You can change this anytime from your profile.</p>
            </div>
            <div className="space-y-2">
              {MODES.map(m => {
                const Icon = m.icon
                const selected = mode === m.value
                return (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors min-h-[56px] ${
                      selected ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'bg-white ring-1 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-500 truncate">{m.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setStep(isSearchMode ? 'quickstart' : 'confirm')}
              className="w-full rounded-2xl bg-indigo-600 text-white px-4 py-3 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px]"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'quickstart' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Let&apos;s find opportunities for you</h2>
              <p className="text-sm text-gray-500 mt-1">Just the basics — you can add more detail to your profile later.</p>
            </div>

            <Input
              label="Desired job title(s)"
              placeholder="e.g. Software Engineer, Product Manager"
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
            />
            <Input
              label="Your skills (comma-separated)"
              placeholder="e.g. React, SQL, Project Management"
              value={skillsInput}
              onChange={e => setSkillsInput(e.target.value)}
            />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Experience level</label>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVELS.map(l => (
                  <Chip key={l.value} label={l.label} selected={experienceLevel === l.value} onClick={() => setExperienceLevel(l.value)} />
                ))}
              </div>
            </div>

            <Input
              label="Preferred location"
              placeholder="e.g. Lusaka, Zambia"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Remote / onsite</label>
              <div className="flex flex-wrap gap-2">
                {REMOTE_PREFERENCES.map(r => (
                  <Chip key={r} label={r} selected={remotePreference === r} onClick={() => setRemotePreference(r)} />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Employment type</label>
              <div className="flex flex-wrap gap-2">
                {EMPLOYMENT_TYPES.map(t => (
                  <Chip key={t} label={t} selected={employmentTypes.includes(t)} onClick={() => toggleEmploymentType(t)} />
                ))}
              </div>
            </div>

            <Input
              label="Salary expectation (optional)"
              type="number"
              placeholder="e.g. 15000"
              value={salary}
              onChange={e => setSalary(e.target.value)}
            />

            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={() => setStep('mode')} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">
                Back
              </button>
              <button
                onClick={finish}
                disabled={saving || !targetRole.trim()}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Start finding opportunities
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Here&apos;s what Zuri will help with</h2>
              <p className="text-sm text-gray-500 mt-1">Based on your choice, Career OS will prioritize:</p>
            </div>
            <ul className="space-y-2">
              {(mode === 'employed'
                ? ['Career growth & skills', 'Networking', 'Promotion readiness', 'Learning suggestions']
                : mode === 'business_owner'
                ? ['Networking & partnerships', 'Speaking & board opportunities', 'Company growth signals']
                : ['Networking', 'Relationship-building opportunities']
              ).map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={() => setStep('mode')} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 min-h-[44px]">
                Back
              </button>
              <button
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px] disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Get started
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
