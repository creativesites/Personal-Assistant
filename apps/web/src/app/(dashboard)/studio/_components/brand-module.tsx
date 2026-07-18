'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Palette, Edit2, Trash2, RefreshCw, Check, X, Plus, Star,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { uploadBrandLogo } from '@/lib/storage'

// Reusable named Brand Profiles (see plan doc / CLAUDE.md's Business
// Workspace section) — the default profile card + edit form below is
// unchanged from before this feature (still reads/writes the singular
// /api/business-profile, so the /business Brand Kit page's mental model of
// "my one Brand Kit" keeps working exactly as it did). The new "Other Brand
// Profiles" section is additive: a user running more than one business/side
// company adds named profiles here, each with its own logo/address/bank
// details/numbering sequence, and picks which one applies per document.

export interface BusinessProfile {
  id: string
  name?: string
  isDefault?: boolean
  companyName: string | null
  tagline: string | null
  industry: string | null
  logoUrl: string | null
  themeColor: string | null
  accentColor: string | null
  brandVoice: string | null
  companyValues: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  bankDetails: Record<string, string>
  mobileMoney: Record<string, string>
  defaultCurrency: string | null
  defaultTaxRate: number
  footerText: string | null
  defaultTerms: string | null
  paymentInstructions: string | null
}

type ProfileForm = {
  name: string
  companyName: string
  tagline: string
  industry: string
  themeColor: string
  accentColor: string
  brandVoice: string
  companyValues: string
  address: string
  phone: string
  email: string
  website: string
  footerText: string
  defaultTerms: string
  paymentInstructions: string
  defaultCurrency: string
  defaultTaxRate: number
}

const BLANK_FORM: ProfileForm = {
  name: '', companyName: '', tagline: '', industry: '', themeColor: '#4F46E5', accentColor: '#818CF8',
  brandVoice: '', companyValues: '', address: '', phone: '', email: '', website: '', footerText: '',
  defaultTerms: '', paymentInstructions: '', defaultCurrency: 'ZMW', defaultTaxRate: 0,
}

function profileToForm(p: BusinessProfile): ProfileForm {
  return {
    name: p.name ?? '',
    companyName: p.companyName ?? '',
    tagline: p.tagline ?? '',
    industry: p.industry ?? '',
    themeColor: p.themeColor ?? '#4F46E5',
    accentColor: p.accentColor ?? '#818CF8',
    brandVoice: p.brandVoice ?? '',
    companyValues: p.companyValues ?? '',
    address: p.address ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: p.website ?? '',
    footerText: p.footerText ?? '',
    defaultTerms: p.defaultTerms ?? '',
    paymentInstructions: p.paymentInstructions ?? '',
    defaultCurrency: p.defaultCurrency ?? 'ZMW',
    defaultTaxRate: p.defaultTaxRate ?? 0,
  }
}

// Shared field grid — used both by the default profile's inline edit form
// and the additional-profile create/edit modal, so there's exactly one
// implementation of "edit a brand profile's fields."
function BrandProfileFields({
  form, setForm, showName,
}: { form: ProfileForm; setForm: (updater: (f: ProfileForm) => ProfileForm) => void; showName?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {showName && (
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Profile Name (for you to tell profiles apart)</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Side Company" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Business Name</label>
        <input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Acme Ltd" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Tagline</label>
        <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="Building the future of..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Industry</label>
        <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Technology, Retail, Services..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Default Currency</label>
        <input value={form.defaultCurrency} onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value.toUpperCase() }))} placeholder="ZMW" maxLength={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Phone</label>
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+260 97 000 0000" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email</label>
        <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@business.com" type="email" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Website</label>
        <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://business.com" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Tax Rate (%)</label>
        <input value={form.defaultTaxRate} onChange={e => setForm(f => ({ ...f, defaultTaxRate: Number(e.target.value) }))} type="number" min={0} max={100} step={0.5} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Primary Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.themeColor} onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
            <span className="text-xs text-gray-400 font-mono">{form.themeColor}</span>
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Accent Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
            <span className="text-xs text-gray-400 font-mono">{form.accentColor}</span>
          </div>
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Address</label>
        <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Lusaka, Zambia" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Brand Voice</label>
        <textarea value={form.brandVoice} onChange={e => setForm(f => ({ ...f, brandVoice: e.target.value }))} placeholder="Professional but approachable. We avoid jargon and speak plainly..." rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Company Values</label>
        <textarea value={form.companyValues} onChange={e => setForm(f => ({ ...f, companyValues: e.target.value }))} placeholder="Customer first. Quality over speed. Transparency in all dealings..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Default Payment Instructions</label>
        <textarea value={form.paymentInstructions} onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))} placeholder="Bank transfer: ABC Bank, Account 1234567..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Default Document Terms</label>
        <textarea value={form.defaultTerms} onChange={e => setForm(f => ({ ...f, defaultTerms: e.target.value }))} placeholder="Payment due within 30 days. Late fees may apply..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
    </div>
  )
}

// ─── Additional Brand Profiles list + add/edit modal ──────────────────────
function OtherBrandProfiles({ token }: { token: string | undefined }) {
  const { data, loading, refetch } = useApi<{ profiles: BusinessProfile[] }>(
    token ? '/api/business-profiles' : null, token,
  )
  const { addToast } = useToast()
  const [editingProfile, setEditingProfile] = useState<BusinessProfile | null | 'new'>(null)
  const [form, setForm] = useState<ProfileForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const profiles = (data?.profiles ?? []).filter(p => !p.isDefault)

  useEffect(() => {
    if (editingProfile && editingProfile !== 'new') setForm(profileToForm(editingProfile))
    else if (editingProfile === 'new') setForm(BLANK_FORM)
  }, [editingProfile])

  async function handleSave() {
    if (!form.name.trim()) {
      addToast({ variant: 'error', title: 'Give this profile a name first' })
      return
    }
    setSaving(true)
    try {
      if (editingProfile === 'new') {
        await apiClient('/api/business-profiles', { method: 'POST', token, body: JSON.stringify(form) })
        addToast({ variant: 'success', title: 'Brand profile created' })
      } else if (editingProfile) {
        await apiClient(`/api/business-profiles/${editingProfile.id}`, { method: 'PATCH', token, body: JSON.stringify(form) })
        addToast({ variant: 'success', title: 'Brand profile saved' })
      }
      setEditingProfile(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save profile' })
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || editingProfile === 'new' || !editingProfile) return
    setUploadingLogo(true)
    try {
      const url = await uploadBrandLogo(editingProfile.id, file)
      await apiClient(`/api/business-profiles/${editingProfile.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ logoUrl: url }),
      })
      addToast({ variant: 'success', title: 'Logo uploaded' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Logo upload failed', description: err.message })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await apiClient(`/api/business-profiles/${id}/set-default`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Default brand profile updated' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to set default' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/business-profiles/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Brand profile deleted' })
      setDeleteConfirm(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete profile' })
    }
  }

  return (
    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="font-semibold text-gray-900">Other Brand Profiles</p>
          <p className="text-xs text-gray-500 mt-0.5">Invoicing as more than one company? Add a profile and pick which one a document uses.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditingProfile('new')}>
          <Plus className="w-3.5 h-3.5 mr-1" />Add Profile
        </Button>
      </div>

      {loading ? (
        <div className="mt-4"><SkeletonCard /></div>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">No additional profiles yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {profiles.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3">
              {p.logoUrl ? (
                <img src={p.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-gray-50 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: p.themeColor ?? '#4F46E5' }}>
                  {(p.companyName ?? p.name ?? 'B')[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.companyName || 'No business name set'}</p>
              </div>
              {deleteConfirm === p.id ? (
                <div className="flex items-center gap-1.5 text-sm shrink-0">
                  <span className="text-gray-500">Delete?</span>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:underline">No</button>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleSetDefault(p.id)} title="Set as default" className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 hover:text-amber-500">
                    <Star className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingProfile(p)} title="Edit" className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 hover:text-indigo-600">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteConfirm(p.id)} title="Delete" className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingProfile && (
        <Modal open={!!editingProfile} onClose={() => setEditingProfile(null)} title={editingProfile === 'new' ? 'Add Brand Profile' : 'Edit Brand Profile'}>
          <div className="space-y-4 p-1">
            {editingProfile !== 'new' && (
              <div className="flex items-center gap-3">
                <div className="relative group">
                  {editingProfile.logoUrl ? (
                    <img src={editingProfile.logoUrl} alt="" className="w-16 h-16 rounded-xl object-contain border border-gray-200 bg-gray-50" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-xl font-bold" style={{ background: form.themeColor }}>
                      {(form.companyName || 'B')[0]?.toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  >
                    {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </div>
                <p className="text-xs text-gray-400">Click logo to change</p>
              </div>
            )}
            <BrandProfileFields form={form} setForm={setForm} showName />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" type="button" onClick={() => setEditingProfile(null)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                {editingProfile === 'new' ? 'Create Profile' : 'Save Profile'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Brand Module ─────────────────────────────────────────────────────────────

export function BrandModule({ token }: { token: string | undefined }) {
  const { data: profile, loading, refetch } = useApi<BusinessProfile>(
    token ? '/api/business-profile' : null, token,
  )
  const { addToast } = useToast()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<ProfileForm>(BLANK_FORM)

  useEffect(() => {
    if (profile) setForm(profileToForm(profile))
  }, [profile])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return
    setUploadingLogo(true)
    try {
      const url = await uploadBrandLogo(profile.id, file)
      await apiClient('/api/business-profile', {
        method: 'PUT', token,
        body: JSON.stringify({ logoUrl: url }),
      })
      addToast({ variant: 'success', title: 'Logo uploaded' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Logo upload failed', description: err.message ?? 'Check Supabase bucket policies allow INSERT.' })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiClient('/api/business-profile', { method: 'PUT', token, body: JSON.stringify(form) })
      addToast({ variant: 'success', title: 'Brand profile saved' })
      setEditing(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save profile' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SkeletonCard />

  return (
    <div className="space-y-6">
      {/* Logo + identity card (always visible) */}
      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Logo with upload overlay */}
            <div className="relative group">
              {profile?.logoUrl ? (
                <img src={profile.logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-contain border border-gray-200 bg-gray-50" />
              ) : (
                <div
                  className="w-20 h-20 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
                  style={{ background: profile?.themeColor ?? '#4F46E5' }}
                >
                  {(profile?.companyName ?? 'B')[0]?.toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
              >
                {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile?.companyName ?? 'Untitled Business'}</h2>
              {profile?.tagline && <p className="text-sm text-gray-500 mt-0.5">{profile.tagline}</p>}
              {profile?.industry && <Badge variant="info" className="mt-2">{profile.industry}</Badge>}
              <p className="text-xs text-gray-400 mt-1">Click logo to change · Default profile</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setEditing(e => !e)}>
            <Edit2 className="w-4 h-4 mr-1.5" />
            {editing ? 'Cancel' : 'Edit Brand'}
          </Button>
        </div>

        {!editing && profile && (
          <>
            {(profile.brandVoice || profile.companyValues) && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                {profile.brandVoice && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brand Voice</p>
                    <p className="text-sm text-gray-700">{profile.brandVoice}</p>
                  </div>
                )}
                {profile.companyValues && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Company Values</p>
                    <p className="text-sm text-gray-700">{profile.companyValues}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3 items-center pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">Brand colors:</p>
              {[profile.themeColor, profile.accentColor].filter(Boolean).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full border border-gray-200 shadow-sm" style={{ background: c! }} />
                  <span className="text-xs text-gray-400 font-mono">{c}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-6 space-y-5">
          <p className="font-semibold text-gray-900">Edit Brand Profile</p>
          <BrandProfileFields form={form} setForm={setForm} />
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save Profile
            </Button>
          </div>
        </form>
      )}

      <OtherBrandProfiles token={token} />
    </div>
  )
}
