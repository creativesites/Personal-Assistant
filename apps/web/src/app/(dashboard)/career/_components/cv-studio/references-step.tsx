'use client'

import { EntryListEditor } from './entry-list-editor'
import type { CareerProfile } from './use-career-profile'

// CV Studio §4 Step 13 — References. Still commonly expected in the
// Zambian market (§14) — "Available on request" vs. a listed table.

export function ReferencesStep({
  profile, token, updateField, onMutated,
}: {
  profile: CareerProfile
  token: string
  updateField: <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => void
  onMutated: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={profile.referencesMode === 'available_on_request'}
            onChange={() => updateField('referencesMode', 'available_on_request')}
            className="text-indigo-600 focus:ring-indigo-500"
          />
          Available on request
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={profile.referencesMode === 'listed'}
            onChange={() => updateField('referencesMode', 'listed')}
            className="text-indigo-600 focus:ring-indigo-500"
          />
          List references
        </label>
      </div>

      {profile.referencesMode === 'listed' && (
        <EntryListEditor
          resourcePath="references"
          token={token}
          titleFields={['name', 'company']}
          addLabel="Add reference"
          emptyLabel="No references listed yet."
          onMutated={onMutated}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'company', label: 'Company', type: 'text' },
            { key: 'phone', label: 'Phone', type: 'text' },
            { key: 'email', label: 'Email', type: 'text' },
            { key: 'relationship', label: 'Relationship', type: 'text' },
          ]}
        />
      )}
    </div>
  )
}
