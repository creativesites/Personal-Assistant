'use client'

import { Input } from '@/components/ui'
import type { CareerProfile } from './use-career-profile'

// CV Studio §4 Step 14 — Additional Information. Driving licence/
// nationality/passport-or-NRC live on the Personal Details step (§4 Step 1
// lists the same fields — the plan's own two step lists overlap here; each
// field is edited in exactly one place to avoid conflicting inputs).

const REMOTE_PREFERENCES = ['onsite', 'hybrid', 'remote', 'no_preference'] as const
const RELOCATION_PREFERENCES = ['open', 'not_open', 'depends'] as const
const CAREER_MODES = [
  { value: 'job_seeker', label: 'Job Seeker' },
  { value: 'employed', label: 'Employed, growing my career' },
  { value: 'freelancer', label: 'Freelancer / Consultant' },
  { value: 'business_owner', label: 'Business Owner' },
  { value: 'networking', label: 'Networking-focused' },
] as const

export function AdditionalInfoStep({
  profile, updateField,
}: {
  profile: CareerProfile
  updateField: <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Availability, preferences, and interests — shown on your CV only where relevant.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">How Zuri helps you</label>
          <select
            defaultValue={profile.careerMode ?? ''}
            onChange={e => updateField('careerMode', (e.target.value || null) as CareerProfile['careerMode'])}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Not set</option>
            {CAREER_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Changes what Career OS prioritizes for you — not permanent, switch anytime.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Willing to relocate</label>
          <select
            defaultValue={profile.relocationPreference ?? ''}
            onChange={e => updateField('relocationPreference', (e.target.value || null) as CareerProfile['relocationPreference'])}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Not set</option>
            {RELOCATION_PREFERENCES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Remote preference</label>
          <select
            defaultValue={profile.remotePreference ?? ''}
            onChange={e => updateField('remotePreference', (e.target.value || null) as CareerProfile['remotePreference'])}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Not set</option>
            {REMOTE_PREFERENCES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        <Input
          label="Expected salary"
          type="number"
          defaultValue={profile.salaryExpectationCents != null ? profile.salaryExpectationCents / 100 : ''}
          onBlur={e => updateField('salaryExpectationCents', e.target.value ? Math.round(Number(e.target.value) * 100) : null)}
        />
        <Input
          label="Salary currency"
          defaultValue={profile.salaryCurrency}
          onBlur={e => updateField('salaryCurrency', e.target.value || 'ZMW')}
        />
        <Input
          label="Availability"
          placeholder="e.g. Immediate, 2 weeks notice"
          defaultValue={profile.availability ?? ''}
          onBlur={e => updateField('availability', e.target.value || null)}
        />
        <Input
          label="Notice period"
          defaultValue={profile.noticePeriod ?? ''}
          onBlur={e => updateField('noticePeriod', e.target.value || null)}
        />
        <Input
          label="Interests (comma-separated)"
          defaultValue={(profile.interests ?? []).join(', ')}
          onBlur={e => updateField('interests', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>
    </div>
  )
}
