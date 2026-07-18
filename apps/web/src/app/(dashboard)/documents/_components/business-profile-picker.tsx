'use client'

import { useEffect, useState } from 'react'
import { Plus, Check, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { apiClient } from '@/lib/api'
import {
  BrandProfileFields, BLANK_FORM, type ProfileForm, type BusinessProfile,
} from '@/app/(dashboard)/studio/_components/brand-module'

// Reusable named Brand Profiles (see plan doc) — lets a document be pinned
// to a specific brand profile instead of always rendering with the user's
// default (e.g. invoicing as a side company). Reuses BrandProfileFields
// (Studio's Brand tab) for the "+ New Brand Profile" inline create so
// there's exactly one implementation of "edit a brand profile's fields."

export function BusinessProfilePicker({
  token, value, onChange,
}: { token?: string; value: string | null; onChange: (profileId: string | null) => void }) {
  const { addToast } = useToast()
  const [profiles, setProfiles] = useState<BusinessProfile[]>([])
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<ProfileForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!token) return
    apiClient<{ profiles: BusinessProfile[] }>('/api/business-profiles', { token })
      .then(d => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]))
  }
  useEffect(load, [token])

  async function handleCreate() {
    if (!form.name.trim()) {
      addToast({ variant: 'error', title: 'Give this profile a name first' })
      return
    }
    setSaving(true)
    try {
      const created = await apiClient<BusinessProfile>('/api/business-profiles', {
        method: 'POST', token, body: JSON.stringify(form),
      })
      addToast({ variant: 'success', title: 'Brand profile created' })
      setShowNew(false)
      setForm(BLANK_FORM)
      load()
      onChange(created.id)
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to create profile' })
    } finally {
      setSaving(false)
    }
  }

  if (profiles.length <= 1) {
    // Only the default profile exists — no reason to show a switcher yet,
    // just the entry point to create the first additional one.
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 min-h-11"
        >
          <Plus className="w-3.5 h-3.5" />Invoicing as a different company? Add a Brand Profile
        </button>
        {showNew && (
          <Modal open={showNew} onClose={() => setShowNew(false)} title="Add Brand Profile">
            <div className="space-y-4 p-1">
              <BrandProfileFields form={form} setForm={setForm} showName />
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button type="button" onClick={handleCreate} disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                  Create Profile
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Brand Profile</label>
      <div className="flex items-center gap-2">
        <select
          value={value ?? profiles.find(p => p.isDefault)?.id ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-11"
        >
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          title="Add a new Brand Profile"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-lg border border-gray-200 text-indigo-600 hover:bg-indigo-50"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showNew && (
        <Modal open={showNew} onClose={() => setShowNew(false)} title="Add Brand Profile">
          <div className="space-y-4 p-1">
            <BrandProfileFields form={form} setForm={setForm} showName />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="button" onClick={handleCreate} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                Create Profile
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
