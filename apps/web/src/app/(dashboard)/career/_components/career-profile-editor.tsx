'use client'

import { Modal, Tabs } from '@/components/ui'
import { useCareerProfile, type CareerProfile } from './cv-studio/use-career-profile'
import { PersonalDetailsStep } from './cv-studio/personal-details-step'
import { SummaryStep, ObjectivesStep } from './cv-studio/summary-objectives-step'
import { AdditionalInfoStep } from './cv-studio/additional-info-step'

// Career Profile polish — the /career page's "Edit Profile" modal used to
// cover only 4 of career_profiles' ~25 fields (headline/summary/targetRoles/
// remotePreference), forcing a trip into CV Studio's wizard just to set a
// phone number or LinkedIn URL. This reuses the exact same autosave-on-blur
// step components the wizard already built (personal-details-step.tsx,
// summary-objectives-step.tsx, additional-info-step.tsx) rather than
// duplicating field-by-field logic a second time — same career_profiles
// row, same /api/career/profile endpoint, same useCareerProfile hook.

const TABS = [
  { id: 'basics', label: 'Basics' },
  { id: 'summary', label: 'Summary & Goals' },
  { id: 'preferences', label: 'Preferences' },
]

export function CareerProfileEditor({
  token, open, onClose, sharedProfile,
}: {
  token: string
  open: boolean
  onClose: () => void
  sharedProfile?: ReturnType<typeof useCareerProfile>
}) {
  const owned = useCareerProfile(token)
  const { profile, updateField } = sharedProfile ?? owned

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="Career Profile" size="lg">
      {!profile ? (
        <p className="text-sm text-gray-500 p-1">Loading...</p>
      ) : (
        <div className="p-1">
          <Tabs tabs={TABS} defaultTab="basics">
            {(activeTab) => (
              <div className="pt-4">
                {activeTab === 'basics' && <PersonalDetailsStep profile={profile} updateField={updateField} />}
                {activeTab === 'summary' && (
                  <div className="space-y-5">
                    <SummaryStep profile={profile} token={token} updateField={updateField} />
                    <ObjectivesStep profile={profile} token={token} updateField={updateField} />
                  </div>
                )}
                {activeTab === 'preferences' && <AdditionalInfoStep profile={profile} updateField={updateField} />}
              </div>
            )}
          </Tabs>

          <div className="flex items-center justify-between gap-2 pt-5 mt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">Saved automatically as you go.</p>
            <button
              onClick={onClose}
              className="rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 min-h-[44px]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export type { CareerProfile }
