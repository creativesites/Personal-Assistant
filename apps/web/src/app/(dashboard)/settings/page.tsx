'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useZuriSession, setStoredMode } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { ModeBadge, useToast, ConfirmModal, Badge, Select, EmptyState } from '@/components/ui'
import {
  Briefcase, Users, Zap, AlertTriangle, Globe, Camera, Music2,
  UserCircle, SlidersHorizontal, Brain, Bot, Database, ShieldCheck,
  Building2, Link2, ChevronRight, Palette, Upload,
  RefreshCw, Sparkles, X, CheckCircle,
} from 'lucide-react'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

interface WhatsAppStatus {
  connected: boolean
  phone?: string
  sessionState?: string
}

interface UserStats {
  totalContacts: number
  totalMessages: number
  totalSuggestions: number
}

const MODE_OPTIONS: {
  value: WorkspaceMode
  label: string
  description: string
  tier: string | null
  Icon: React.ElementType
}[] = [
  {
    value: 'business',
    label: 'Business',
    description: 'Customer relationships, deals, and support. WhatsApp as your CRM.',
    tier: null,
    Icon: Briefcase,
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'Family, friends, and personal relationships. AI relationship coach.',
    tier: 'Starter+',
    Icon: Users,
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Full access to both business and personal intelligence engines.',
    tier: 'Pro',
    Icon: Zap,
  },
]

const SOCIAL_PLATFORMS: { value: 'facebook' | 'instagram' | 'tiktok'; label: string; Icon: React.ElementType }[] = [
  { value: 'facebook', label: 'Facebook', Icon: Globe },
  { value: 'instagram', label: 'Instagram', Icon: Camera },
  { value: 'tiktok', label: 'TikTok', Icon: Music2 },
]

interface SocialAccount {
  id: string
  platform: 'facebook' | 'instagram' | 'tiktok'
  accountName: string | null
  status: string
}

interface BusinessProfile {
  companyName: string | null
  logoUrl: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  taxId: string | null
  registrationNumber: string | null
  bankDetails: { bankName?: string; accountName?: string; accountNumber?: string; branchCode?: string }
  mobileMoney: { provider?: string; number?: string }
  signatureUrl: string | null
  stampUrl: string | null
  themeColor: string
  accentColor: string
  footerText: string | null
  defaultTerms: string | null
  paymentInstructions: string | null
  defaultCurrency: string
  defaultTaxRate: number
  numbering: Record<string, { prefix: string; next: number }>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-slate-300/80">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="divide-y divide-slate-100/80">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/30 transition-colors">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div className={`w-10 h-6 rounded-full flex items-center px-1 cursor-not-allowed opacity-75 transition-all ${enabled ? 'bg-indigo-600 shadow-inner' : 'bg-slate-200'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  )
}

function MultiContactSelect({
  label,
  buttonText,
  contactOptions,
  onAdd,
  disabled
}: {
  label: string
  buttonText: string
  contactOptions: { id: string; name: string }[]
  onAdd: (ids: string[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const filtered = contactOptions.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  const toggleId = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-2 border border-gray-100 rounded-xl p-4 bg-gray-50/50">
      <label className="block text-xs font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer min-h-[38px] flex flex-wrap gap-1.5 items-center pr-8"
        >
          {selectedIds.length === 0 ? (
            <span className="text-gray-400">Search & select contacts...</span>
          ) : (
            selectedIds.map(id => {
              const name = contactOptions.find(c => c.id === id)?.name || id
              return (
                <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-md font-medium">
                  {name}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleId(id) }}
                    className="hover:text-indigo-900 font-bold"
                  >
                    ×
                  </button>
                </span>
              )
            })
          )}
          <span className="absolute right-3 top-3 text-gray-400 pointer-events-none">
            ▼
          </span>
        </div>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto p-2 space-y-2">
            <input
              type="text"
              placeholder="Filter contacts..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              onClick={e => e.stopPropagation()}
            />
            <div className="space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-gray-400 p-1">No contacts found</p>
              ) : (
                filtered.map(c => {
                  const isChecked = selectedIds.includes(c.id)
                  return (
                    <div
                      key={c.id}
                      onClick={(e) => { e.stopPropagation(); toggleId(c.id) }}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-gray-700">{c.name}</span>
                    </div>
                  )
                })
              )}
            </div>
            <div className="border-t border-gray-100 pt-1.5 flex justify-end">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsOpen(false) }}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={selectedIds.length === 0 || disabled}
          onClick={() => {
            onAdd(selectedIds)
            setSelectedIds([])
            setQuery('')
            setIsOpen(false)
          }}
          className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold rounded-lg disabled:opacity-50 transition-all shadow-sm"
        >
          {buttonText} ({selectedIds.length})
        </button>
      </div>
    </div>
  )
}

const TAB_ICONS: Record<string, React.ElementType> = {
  account: UserCircle,
  workspace: SlidersHorizontal,
  intelligence: Brain,
  auto_responses: Bot,
  memory: Database,
  privacy: ShieldCheck,
  enterprise: Building2,
  connected_accounts: Link2,
  brand_kit: Palette,
}

export default function SettingsPage() {
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [pendingMode, setPendingMode] = useState<WorkspaceMode>(session.data?.mode ?? 'business')
  const [savingMode, setSavingMode] = useState(false)
  // Business Events Part E — Business Manager Assistant kill switch. On by
  // default (businessManagerPaused=false); see docs/BUSINESS_EVENTS_PLAN.md.
  const [businessManagerPaused, setBusinessManagerPaused] = useState(false)
  const [businessManagerSaving, setBusinessManagerSaving] = useState(false)
  // Reality Engine Phase 1 — same on-by-default kill switch precedent. See
  // docs/REALITY_ENGINE_PLAN.md §10.
  const [realityEnginePaused, setRealityEnginePaused] = useState(false)
  const [realityEngineSaving, setRealityEngineSaving] = useState(false)

  // Localisation & Currency Settings
  const [preferredCurrency, setPreferredCurrency] = useState('ZMW')
  const [preferredLocale, setPreferredLocale] = useState('en-ZM')
  const [savingLocalisation, setSavingLocalisation] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCurrency = localStorage.getItem('zuri_preferred_currency') || 'ZMW'
      const savedLocale = localStorage.getItem('zuri_preferred_locale') || 'en-ZM'
      setPreferredCurrency(savedCurrency)
      setPreferredLocale(savedLocale)
    }
  }, [])

  const saveLocalisation = () => {
    setSavingLocalisation(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('zuri_preferred_currency', preferredCurrency)
      localStorage.setItem('zuri_preferred_locale', preferredLocale)
    }
    setTimeout(() => {
      setSavingLocalisation(false)
      addToast({
        variant: 'success',
        title: 'Localisation Settings Saved',
        description: `Currency updated to ${preferredCurrency} and region updated to ${preferredLocale}.`,
      })
    }, 400)
  }

  useEffect(() => {
    if (session.data?.mode) setPendingMode(session.data.mode)
  }, [session.data?.mode])

  useEffect(() => {
    if (!token) return
    apiClient<{ profile: { businessManagerPaused: boolean; realityEnginePaused: boolean } }>('/api/advisor/profile', { token })
      .then(data => {
        setBusinessManagerPaused(data.profile.businessManagerPaused)
        setRealityEnginePaused(data.profile.realityEnginePaused)
      })
      .catch(() => { /* ignore — defaults to on */ })
  }, [token])

  const toggleBusinessManager = async () => {
    if (!token || businessManagerSaving) return
    const next = !businessManagerPaused
    setBusinessManagerSaving(true)
    setBusinessManagerPaused(next)
    try {
      await apiClient('/api/advisor/profile', {
        method: 'PATCH', token,
        body: JSON.stringify({ businessManagerPaused: next }),
      })
    } catch {
      setBusinessManagerPaused(!next)
      addToast({ variant: 'error', title: 'Could not update Business Manager Assistant' })
    } finally {
      setBusinessManagerSaving(false)
    }
  }

  const toggleRealityEngine = async () => {
    if (!token || realityEngineSaving) return
    const next = !realityEnginePaused
    setRealityEngineSaving(true)
    setRealityEnginePaused(next)
    try {
      await apiClient('/api/advisor/profile', {
        method: 'PATCH', token,
        body: JSON.stringify({ realityEnginePaused: next }),
      })
    } catch {
      setRealityEnginePaused(!next)
      addToast({ variant: 'error', title: 'Could not update Reality Engine' })
    } finally {
      setRealityEngineSaving(false)
    }
  }

  useEffect(() => {
    if (!token) return

    apiClient<WhatsAppStatus>('/api/whatsapp/status', { token })
      .then(s => { setWaStatus(s); setApiReachable(true) })
      .catch(() => { setWaStatus({ connected: false }); setApiReachable(false) })

    Promise.all([
      apiClient<{ contacts: unknown[] }>('/api/contacts', { token }).catch(() => ({ contacts: [] })),
      apiClient<{ stats: UserStats }>('/api/users/me/stats', { token }).catch(() => null),
    ]).then(([contacts, statsData]) => {
      setStats({
        totalContacts: (contacts as any).contacts?.length ?? 0,
        totalMessages: (statsData as any)?.stats?.totalMessages ?? 0,
        totalSuggestions: (statsData as any)?.stats?.totalSuggestions ?? 0,
      })
    })
  }, [token])

  const disconnect = async () => {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiClient('/api/whatsapp/connect', { method: 'DELETE', token })
      setWaStatus({ connected: false })
      addToast({ variant: 'success', title: 'WhatsApp disconnected' })
    } catch {
      addToast({ variant: 'error', title: 'Disconnect failed', description: 'Please try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  const saveMode = async () => {
    if (!token || pendingMode === session.data?.mode) return
    setSavingMode(true)
    try {
      await apiClient<{ user: { mode: WorkspaceMode } }>('/api/users/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ mode: pendingMode }),
      })
      setStoredMode(pendingMode)
      addToast({ variant: 'success', title: 'Workspace mode updated' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save mode', description: 'Please try again.' })
    } finally {
      setSavingMode(false)
    }
  }

  const initials = (() => {
    const name = session.data?.user.name
    if (!name) return session.data?.user.email?.charAt(0).toUpperCase() ?? '?'
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  const [apiKeys, setApiKeys] = useState<Array<{ id: string; label: string; created_at: string }>>([])
  const [webhooks, setWebhooks] = useState<Array<{ id: string; url: string; events: string[]; is_active: boolean }>>([])
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [addingWebhook, setAddingWebhook] = useState(false)
  const [byokKeys, setByokKeys] = useState<Array<{ id: string; provider: string }>>([])
  const [byokProvider, setByokProvider] = useState('anthropic')
  const [byokApiKey, setByokApiKey] = useState('')
  const [savingByok, setSavingByok] = useState(false)
  const [enterpriseLoaded, setEnterpriseLoaded] = useState(false)

  const marketingAccess = session.data?.marketingAccess ?? 'none'
  const hasMarketingAccess = marketingAccess === 'beta' || marketingAccess === 'enabled'
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([])
  const [socialLoaded, setSocialLoaded] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
  const [connectAccountName, setConnectAccountName] = useState('')

  const loadSocialAccounts = async () => {
    if (!token || socialLoaded) return
    setSocialLoaded(true)
    try {
      const data = await apiClient<{ accounts: SocialAccount[] }>('/api/social-accounts', { token })
      setSocialAccounts(data.accounts)
    } catch { /* ignore */ }
  }

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [brandKitLoaded, setBrandKitLoaded] = useState(false)
  const [savingBrandKit, setSavingBrandKit] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState<'logo' | 'signature' | 'stamp' | null>(null)

  const loadBrandKit = async () => {
    if (!token || brandKitLoaded) return
    setBrandKitLoaded(true)
    try {
      const data = await apiClient<BusinessProfile>('/api/business-profile', { token })
      setBusinessProfile(data)
    } catch { /* ignore */ }
  }

  const saveBrandKit = async () => {
    if (!token || !businessProfile) return
    setSavingBrandKit(true)
    try {
      const data = await apiClient<BusinessProfile>('/api/business-profile', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          companyName: businessProfile.companyName ?? '',
          address: businessProfile.address ?? '',
          phone: businessProfile.phone ?? '',
          email: businessProfile.email ?? '',
          website: businessProfile.website ?? '',
          taxId: businessProfile.taxId ?? '',
          registrationNumber: businessProfile.registrationNumber ?? '',
          bankDetails: businessProfile.bankDetails,
          mobileMoney: businessProfile.mobileMoney,
          themeColor: businessProfile.themeColor,
          accentColor: businessProfile.accentColor,
          footerText: businessProfile.footerText ?? '',
          defaultTerms: businessProfile.defaultTerms ?? '',
          paymentInstructions: businessProfile.paymentInstructions ?? '',
          defaultCurrency: businessProfile.defaultCurrency,
          defaultTaxRate: businessProfile.defaultTaxRate,
        }),
      })
      setBusinessProfile(data)
      addToast({ variant: 'success', title: 'Brand Kit saved' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save Brand Kit' })
    } finally {
      setSavingBrandKit(false)
    }
  }

  const uploadBrandAsset = async (type: 'logo' | 'signature' | 'stamp', file: File) => {
    if (!token) return
    setUploadingAsset(type)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const res = await fetch(`${apiUrl}/api/business-profile/assets?type=${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json() as BusinessProfile
      setBusinessProfile(data)
      addToast({ variant: 'success', title: `${type[0].toUpperCase()}${type.slice(1)} uploaded` })
    } catch {
      addToast({ variant: 'error', title: `Failed to upload ${type}` })
    } finally {
      setUploadingAsset(null)
    }
  }

  const connectSocialAccount = async (platform: string) => {
    if (!token || !connectAccountName.trim()) return
    try {
      const data = await apiClient<{ account: SocialAccount }>('/api/social-accounts', {
        method: 'POST',
        token,
        body: JSON.stringify({ platform, accountName: connectAccountName.trim() }),
      })
      setSocialAccounts(a => [data.account, ...a])
      setConnectingPlatform(null)
      setConnectAccountName('')
      addToast({ variant: 'success', title: `${platform} connected` })
    } catch {
      addToast({ variant: 'error', title: 'Failed to connect account', description: 'Please try again.' })
    }
  }

  const disconnectSocialAccount = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/social-accounts/${id}`, { method: 'DELETE', token })
      setSocialAccounts(a => a.filter(acc => acc.id !== id))
      addToast({ variant: 'success', title: 'Account disconnected' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to disconnect account' })
    }
  }

  const loadEnterprise = async () => {
    if (!token || enterpriseLoaded) return
    setEnterpriseLoaded(true)
    try {
      const [keysData, hooksData, byokData] = await Promise.all([
        apiClient<{ api_keys: typeof apiKeys }>('/api/enterprise/api-keys', { token }).catch(() => ({ api_keys: [] })),
        apiClient<{ webhooks: typeof webhooks }>('/api/enterprise/webhooks', { token }).catch(() => ({ webhooks: [] })),
        apiClient<{ keys: typeof byokKeys }>('/api/enterprise/byok', { token }).catch(() => ({ keys: [] })),
      ])
      setApiKeys((keysData as any).api_keys ?? [])
      setWebhooks((hooksData as any).webhooks ?? [])
      setByokKeys((byokData as any).keys ?? [])
    } catch { /* ignore */ }
  }

  const createApiKey = async () => {
    if (!token || !newKeyLabel.trim()) return
    setCreatingKey(true)
    try {
      const data = await apiClient<{ api_key: { id: string; label: string; created_at: string }; key: string }>(
        '/api/enterprise/api-keys', { method: 'POST', token, body: JSON.stringify({ label: newKeyLabel.trim() }) }
      )
      setNewKeyValue((data as any).key)
      setNewKeyLabel('')
      const keysData = await apiClient<{ api_keys: typeof apiKeys }>('/api/enterprise/api-keys', { token }).catch(() => ({ api_keys: [] }))
      setApiKeys((keysData as any).api_keys ?? [])
    } finally { setCreatingKey(false) }
  }

  const revokeApiKey = async (id: string) => {
    if (!token || !confirm('Revoke this API key? It cannot be undone.')) return
    await apiClient(`/api/enterprise/api-keys/${id}`, { method: 'DELETE', token })
    setApiKeys(k => k.filter(k => k.id !== id))
  }

  const addWebhook = async () => {
    if (!token || !webhookUrl.trim()) return
    setAddingWebhook(true)
    try {
      await apiClient('/api/enterprise/webhooks', {
        method: 'POST', token,
        body: JSON.stringify({ url: webhookUrl.trim(), events: ['message.incoming', 'escalation.created', 'broadcast.sent'] }),
      })
      setWebhookUrl('')
      const data = await apiClient<{ webhooks: typeof webhooks }>('/api/enterprise/webhooks', { token }).catch(() => ({ webhooks: [] }))
      setWebhooks((data as any).webhooks ?? [])
    } finally { setAddingWebhook(false) }
  }

  const deleteWebhook = async (id: string) => {
    if (!token) return
    await apiClient(`/api/enterprise/webhooks/${id}`, { method: 'DELETE', token })
    setWebhooks(w => w.filter(w => w.id !== id))
  }

  const saveByok = async () => {
    if (!token || !byokApiKey.trim()) return
    setSavingByok(true)
    try {
      await apiClient('/api/enterprise/byok', {
        method: 'POST', token,
        body: JSON.stringify({ provider: byokProvider, api_key: byokApiKey.trim() }),
      })
      setByokApiKey('')
      const data = await apiClient<{ keys: typeof byokKeys }>('/api/enterprise/byok', { token }).catch(() => ({ keys: [] }))
      setByokKeys((data as any).keys ?? [])
    } finally { setSavingByok(false) }
  }

  interface AutoResponseSettings {
    enabled: boolean
    businessHoursStart: string
    businessHoursEnd: string
    timezone: string
    activeDays: number[]
    sendDelaySeconds: number
    approvalMode: 'auto' | 'preview' | 'manual'
    respondToLeads: boolean
    respondToCustomers: boolean
    respondToNewContacts: boolean
    skipGroups: boolean
    skipBroadcasts: boolean
    escalationKeywords: string[]
    escalationNotifyEmail: string | null
    greetingMessage: string | null
    awayMessage: string | null
    smartFollowupEnabled: boolean
    learnFromCorrections: boolean
    inclusionMode: boolean
  }

  const DEFAULT_AUTO_RESPONSE: AutoResponseSettings = {
    enabled: false, businessHoursStart: '09:00', businessHoursEnd: '18:00',
    timezone: 'UTC', activeDays: [1, 2, 3, 4, 5], sendDelaySeconds: 30,
    approvalMode: 'preview', respondToLeads: true, respondToCustomers: true,
    respondToNewContacts: false, skipGroups: true, skipBroadcasts: true,
    escalationKeywords: [], escalationNotifyEmail: null, greetingMessage: null,
    awayMessage: null, smartFollowupEnabled: false, learnFromCorrections: true,
    inclusionMode: false,
  }

  const [autoResponse, setAutoResponse] = useState<AutoResponseSettings>(DEFAULT_AUTO_RESPONSE)
  const [autoResponseLoaded, setAutoResponseLoaded] = useState(false)
  const [savingAutoResponse, setSavingAutoResponse] = useState(false)
  const [escalationKwInput, setEscalationKwInput] = useState('')

  // Default Assistant (docs/AUTO_REPLY_AGENTS_PLAN.md §2/§8) — the same
  // agent every user has from signup. Settings edits its persona and
  // trust_level directly via /api/agents/default; auto_response_settings
  // (above) stays the shared gate (business hours, targeting, escalation)
  // applied to this agent and every other one.
  interface DefaultAgent {
    id: string
    name: string
    roleTitle: string | null
    avatarEmoji: string
    tone: string | null
    trustLevel: 'observe' | 'suggest' | 'assisted' | 'delegated' | 'autonomous'
    isActive: boolean
    greetingMessage: string | null
    outOfHoursMessage: string | null
  }

  const [defaultAgent, setDefaultAgent] = useState<DefaultAgent | null>(null)
  const [savingAgent, setSavingAgent] = useState(false)

  const loadDefaultAgent = async () => {
    if (!token) return
    try {
      const data = await apiClient<{ agent: DefaultAgent }>('/api/agents/default', { token })
      setDefaultAgent(data.agent)
    } catch { /* ignore — falls back to the plain toggle UI below */ }
  }

  // Plain-language dial mapped onto trust_level + is_active — see plan §8.
  const AUTO_REPLY_MODES = [
    { key: 'off',        label: "Off — I'll reply myself",                              isActive: false, trustLevel: 'suggest' as const },
    { key: 'suggest',    label: 'Draft replies, I approve every one',                    isActive: true,  trustLevel: 'suggest' as const },
    { key: 'assisted',   label: "Draft replies, auto-send if I haven't responded",       isActive: true,  trustLevel: 'assisted' as const },
    { key: 'delegated',  label: 'Auto-send, only escalate when something needs me',      isActive: true,  trustLevel: 'delegated' as const },
    { key: 'autonomous', label: 'Fully autonomous',                                      isActive: true,  trustLevel: 'autonomous' as const },
  ] as const

  const currentAutoReplyMode = !defaultAgent?.isActive
    ? 'off'
    : (AUTO_REPLY_MODES.find(m => m.trustLevel === defaultAgent.trustLevel && m.isActive)?.key ?? 'suggest')

  const setAutoReplyMode = (key: typeof AUTO_REPLY_MODES[number]['key']) => {
    const mode = AUTO_REPLY_MODES.find(m => m.key === key)
    if (!mode || !defaultAgent) return
    setDefaultAgent({ ...defaultAgent, isActive: mode.isActive, trustLevel: mode.trustLevel })
  }

  const loadAutoResponse = async () => {
    if (!token || autoResponseLoaded) return
    setAutoResponseLoaded(true)
    try {
      const data = await apiClient<AutoResponseSettings>('/api/settings/auto-response', { token })
      setAutoResponse(data as AutoResponseSettings)
    } catch { /* ignore */ }
    loadDefaultAgent()
  }

  const saveAutoResponse = async () => {
    if (!token) {
      addToast({
        variant: 'error',
        title: 'Session Syncing',
        description: 'Your authentication token is still syncing. Please wait a moment and try again.',
      })
      return
    }
    setSavingAutoResponse(true)
    setSavingAgent(true)
    try {
      await Promise.all([
        apiClient('/api/settings/auto-response', {
          method: 'PUT',
          token,
          body: JSON.stringify(autoResponse),
        }),
        defaultAgent
          ? apiClient('/api/agents/default', {
              method: 'PATCH',
              token,
              body: JSON.stringify({
                trust_level: defaultAgent.trustLevel,
                is_active: defaultAgent.isActive,
                tone: defaultAgent.tone,
                greeting_message: defaultAgent.greetingMessage,
                out_of_hours_message: defaultAgent.outOfHoursMessage,
              }),
            })
          : Promise.resolve(),
      ])
      addToast({ variant: 'success', title: 'Auto-response settings saved' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save', description: 'Please try again.' })
    } finally {
      setSavingAutoResponse(false)
      setSavingAgent(false)
    }
  }

  // ── Auto-reply exceptions (docs/AUTO_REPLY_AGENTS_PLAN.md §4) ───────────
  // Two lists: explicit per-contact opt-outs and rule-based ones (matched
  // against relationship_type/tag/customer_status). Both are consulted by
  // every trust level, not just the plain non-agent path.
  interface ExclusionContact { id: string; contactId: string; contactName: string; avatarUrl: string | null; reason: string | null }
  interface ExclusionRule { id: string; ruleType: 'relationship_type' | 'tag' | 'customer_status'; ruleValue: string; sourceText: string | null }
  interface ContactOption { id: string; name: string }

  const [exclusionContacts, setExclusionContacts] = useState<ExclusionContact[]>([])
  const [exclusionRules, setExclusionRules] = useState<ExclusionRule[]>([])
  const [exclusionsLoaded, setExclusionsLoaded] = useState(false)
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [pickContactId, setPickContactId] = useState('')
  const [exclusionInstruction, setExclusionInstruction] = useState('')
  const [parsingExclusion, setParsingExclusion] = useState(false)
  const [pendingExclusion, setPendingExclusion] = useState<
    { type: 'contact'; contactId: string; contactName: string }
    | { type: 'rule'; ruleType: 'relationship_type' | 'tag' | 'customer_status'; ruleValue: string; matchCount: number }
    | null
  >(null)

  const [inclusionContacts, setInclusionContacts] = useState<ExclusionContact[]>([])
  const [privacyContacts, setPrivacyContacts] = useState<ExclusionContact[]>([])
  const [inclusionsLoaded, setInclusionsLoaded] = useState(false)
  const [privacyLoaded, setPrivacyLoaded] = useState(false)

  // Privacy Assistant states
  const [showPrivacyAssistant, setShowPrivacyAssistant] = useState(false)
  const [runningPrivacyAnalysis, setRunningPrivacyAnalysis] = useState(false)
  const [privacyAssistantResults, setPrivacyAssistantResults] = useState<{
    contacts: {
      id: string
      name: string
      reason: string
      confidence: number
      snippet: string
    }[]
  } | null>(null)
  const [selectedPrivacyAssistantContactIds, setSelectedPrivacyAssistantContactIds] = useState<string[]>([])
  const [applyingBulkPrivacy, setApplyingBulkPrivacy] = useState(false)

  const loadExclusions = async () => {
    if (!token || exclusionsLoaded) return
    setExclusionsLoaded(true)
    try {
      const data = await apiClient<{ contacts: ExclusionContact[]; rules: ExclusionRule[] }>(
        '/api/settings/auto-response/exclusions', { token },
      )
      setExclusionContacts(data.contacts)
      setExclusionRules(data.rules)
    } catch { /* ignore */ }
    try {
      const data = await apiClient<{ contacts: ContactOption[] }>('/api/contacts', { token })
      setContactOptions(data.contacts)
    } catch { /* ignore */ }
  }

  const loadInclusions = async () => {
    if (!token || inclusionsLoaded) return
    setInclusionsLoaded(true)
    try {
      const data = await apiClient<{ contacts: ExclusionContact[] }>(
        '/api/settings/auto-response/inclusions', { token },
      )
      setInclusionContacts(data.contacts)
    } catch { /* ignore */ }
  }

  const loadPrivacyExclusions = async () => {
    if (!token || privacyLoaded) return
    setPrivacyLoaded(true)
    try {
      const data = await apiClient<{ contacts: ExclusionContact[] }>(
        '/api/settings/privacy/exclusions', { token },
      )
      setPrivacyContacts(data.contacts)
    } catch { /* ignore */ }
  }

  const addContactExclusions = async (contactIds: string[]) => {
    if (!token || contactIds.length === 0) return
    try {
      await apiClient('/api/settings/auto-response/exclusions', {
        method: 'POST', token, body: JSON.stringify({ contactIds }),
      })
      addToast({ variant: 'success', title: `Excluded ${contactIds.length} contact(s)` })
      setExclusionsLoaded(false)
      loadExclusions()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add exclusions' })
    }
  }

  const addContactExclusion = async () => {
    if (!token || !pickContactId) return
    await addContactExclusions([pickContactId])
    setPickContactId('')
  }

  const removeContactExclusion = async (id: string) => {
    if (!token) return
    setExclusionContacts(prev => prev.filter(c => c.id !== id))
    try {
      await apiClient(`/api/settings/auto-response/exclusions/${id}`, { method: 'DELETE', token })
    } catch {
      addToast({ variant: 'error', title: 'Failed to remove exclusion' })
    }
  }

  const addInclusions = async (contactIds: string[]) => {
    if (!token || contactIds.length === 0) return
    try {
      await apiClient('/api/settings/auto-response/inclusions', {
        method: 'POST', token, body: JSON.stringify({ contactIds }),
      })
      addToast({ variant: 'success', title: `Added ${contactIds.length} contact(s) to inclusions` })
      setInclusionsLoaded(false)
      loadInclusions()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add inclusions' })
    }
  }

  const removeInclusion = async (id: string) => {
    if (!token) return
    setInclusionContacts(prev => prev.filter(c => c.id !== id))
    try {
      await apiClient(`/api/settings/auto-response/inclusions/${id}`, { method: 'DELETE', token })
    } catch {
      addToast({ variant: 'error', title: 'Failed to remove inclusion' })
    }
  }

  const addPrivacyExclusions = async (contactIds: string[]) => {
    if (!token || contactIds.length === 0) return
    try {
      await apiClient('/api/settings/privacy/exclusions', {
        method: 'POST', token, body: JSON.stringify({ contactIds }),
      })
      addToast({ variant: 'success', title: `Privacy-excluded ${contactIds.length} contact(s)` })
      setPrivacyLoaded(false)
      loadPrivacyExclusions()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add privacy exclusions' })
    }
  }

  const removePrivacyExclusion = async (id: string) => {
    if (!token) return
    setPrivacyContacts(prev => prev.filter(c => c.id !== id))
    try {
      await apiClient(`/api/settings/privacy/exclusions/${id}`, { method: 'DELETE', token })
    } catch {
      addToast({ variant: 'error', title: 'Failed to remove privacy exclusion' })
    }
  }

  const handleRunPrivacyAnalysis = async () => {
    if (!token) return
    setRunningPrivacyAnalysis(true)
    try {
      const data = await apiClient<{ contacts: any[] }>('/api/privacy/assistant', { token })
      setPrivacyAssistantResults({ contacts: data.contacts || [] })
      setSelectedPrivacyAssistantContactIds((data.contacts || []).map(c => c.id))
      setShowPrivacyAssistant(true)
      addToast({ variant: 'success', title: 'AI Privacy analysis completed' })
    } catch (err) {
      console.error('Failed to run privacy assistant', err)
      addToast({ variant: 'error', title: 'Failed to run AI Privacy Assistant analysis' })
    } finally {
      setRunningPrivacyAnalysis(false)
    }
  }

  const handleApplyBulkPrivacy = async () => {
    if (!token || selectedPrivacyAssistantContactIds.length === 0) return
    setApplyingBulkPrivacy(true)
    try {
      const data = await apiClient<{ ok: boolean; count: number }>('/api/privacy/bulk-apply', {
        method: 'POST',
        token,
        body: JSON.stringify({ contactIds: selectedPrivacyAssistantContactIds }),
      })
      if (data.ok) {
        addToast({ variant: 'success', title: `Successfully applied strict privacy to ${data.count} contacts` })
        setShowPrivacyAssistant(false)
        setPrivacyAssistantResults(null)
        // Refresh exclusions / privacy listings
        setPrivacyLoaded(false)
        loadPrivacyExclusions()
      }
    } catch (err) {
      console.error('Failed to bulk apply privacy settings', err)
      addToast({ variant: 'error', title: 'Failed to apply bulk privacy settings' })
    } finally {
      setApplyingBulkPrivacy(false)
    }
  }

  const removeExclusionRule = async (id: string) => {
    if (!token) return
    setExclusionRules(prev => prev.filter(r => r.id !== id))
    try {
      await apiClient(`/api/settings/auto-response/exclusion-rules/${id}`, { method: 'DELETE', token })
    } catch {
      addToast({ variant: 'error', title: 'Failed to remove rule' })
    }
  }

  const parseExclusionInstruction = async () => {
    if (!token || !exclusionInstruction.trim()) return
    setParsingExclusion(true)
    setPendingExclusion(null)
    try {
      const data = await apiClient<
        { type: 'contact'; contactId: string; contactName: string }
        | { type: 'rule'; ruleType: 'relationship_type' | 'tag' | 'customer_status'; ruleValue: string; matchCount: number }
        | { type: 'unknown' }
      >('/api/settings/auto-response/exclusions/parse', {
        method: 'POST', token, body: JSON.stringify({ instruction: exclusionInstruction.trim() }),
      })
      if (data.type === 'unknown') {
        addToast({ variant: 'error', title: "Couldn't understand that — try naming a specific contact or a relationship type/tag." })
      } else {
        setPendingExclusion(data)
      }
    } catch {
      addToast({ variant: 'error', title: 'Failed to parse instruction' })
    } finally {
      setParsingExclusion(false)
    }
  }

  const confirmPendingExclusion = async () => {
    if (!token || !pendingExclusion) return
    try {
      if (pendingExclusion.type === 'contact') {
        await apiClient('/api/settings/auto-response/exclusions', {
          method: 'POST', token, body: JSON.stringify({ contactId: pendingExclusion.contactId }),
        })
      } else {
        await apiClient('/api/settings/auto-response/exclusion-rules', {
          method: 'POST', token,
          body: JSON.stringify({
            ruleType: pendingExclusion.ruleType, ruleValue: pendingExclusion.ruleValue,
            sourceText: exclusionInstruction.trim(),
          }),
        })
      }
      setPendingExclusion(null)
      setExclusionInstruction('')
      setExclusionsLoaded(false)
      loadExclusions()
      addToast({ variant: 'success', title: 'Exception saved' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save exception' })
    }
  }

  // ── Memory tab: Business Facts ──────────────────────────────────────────
  interface BusinessFact {
    id: string; category: string; factKey: string; factValue: string
    confidence: number; evidenceCount: number; source: string
    isApproved: boolean; isActive: boolean; createdAt: string; updatedAt: string
  }
  const [businessFacts, setBusinessFacts] = useState<BusinessFact[]>([])
  const [factsFilter, setFactsFilter] = useState<'pending' | 'approved' | 'all'>('pending')
  const [factActionLoading, setFactActionLoading] = useState<string | null>(null)
  const [editingFactId, setEditingFactId] = useState<string | null>(null)
  const [editFactValue, setEditFactValue] = useState('')

  const loadBusinessFacts = async (filter: 'pending' | 'approved' | 'all') => {
    if (!token) return
    try {
      const qs = filter === 'pending' ? '?pending=true' : filter === 'all' ? '?includeInactive=true' : ''
      const data = await apiClient<{ facts: BusinessFact[] }>(`/api/business-facts${qs}`, { token })
      setBusinessFacts(filter === 'approved' ? data.facts.filter(f => f.isApproved) : data.facts)
    } catch { setBusinessFacts([]) }
  }

  const changeFactsFilter = (filter: 'pending' | 'approved' | 'all') => {
    setFactsFilter(filter)
    loadBusinessFacts(filter)
  }

  const approveFact = async (id: string) => {
    if (!token) return
    setFactActionLoading(id)
    try {
      await apiClient(`/api/business-facts/${id}/approve`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Fact approved' })
      await loadBusinessFacts(factsFilter)
    } catch {
      addToast({ variant: 'error', title: 'Failed to approve' })
    } finally {
      setFactActionLoading(null)
    }
  }

  const rejectFact = async (id: string) => {
    if (!token) return
    setFactActionLoading(id)
    try {
      await apiClient(`/api/business-facts/${id}/reject`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Fact rejected' })
      setBusinessFacts(prev => prev.filter(f => f.id !== id))
    } catch {
      addToast({ variant: 'error', title: 'Failed to reject' })
    } finally {
      setFactActionLoading(null)
    }
  }

  const startEditFact = (fact: BusinessFact) => {
    setEditingFactId(fact.id)
    setEditFactValue(fact.factValue)
  }

  const saveEditFact = async (id: string) => {
    if (!token) return
    setFactActionLoading(id)
    try {
      await apiClient(`/api/business-facts/${id}`, {
        method: 'PATCH', token, body: JSON.stringify({ factValue: editFactValue }),
      })
      addToast({ variant: 'success', title: 'Fact updated' })
      setEditingFactId(null)
      await loadBusinessFacts(factsFilter)
    } catch {
      addToast({ variant: 'error', title: 'Failed to update' })
    } finally {
      setFactActionLoading(null)
    }
  }

  // ── Memory tab: Agent Memories ───────────────────────────────────────────
  interface AgentSummary { id: string; name: string }
  interface AgentMemory {
    id: string; contactId: string | null; scope: 'contact' | 'general'; memoryType: 'fact' | 'experience'
    key: string | null; value: string | null; situation: string | null; actionTaken: string | null
    outcome: string | null; worked: boolean | null; confidence: number; evidenceCount: number; createdAt: string
  }
  const [agentsList, setAgentsList] = useState<AgentSummary[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentMemories, setAgentMemories] = useState<AgentMemory[]>([])
  const [agentMemoriesLoading, setAgentMemoriesLoading] = useState(false)
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)
  const [memoryTabLoaded, setMemoryTabLoaded] = useState(false)

  const loadAgentMemories = async (agentId: string) => {
    if (!token || !agentId) return
    setAgentMemoriesLoading(true)
    try {
      const data = await apiClient<{ memories: AgentMemory[] }>(`/api/agents/${agentId}/memories`, { token })
      setAgentMemories(data.memories)
    } catch {
      setAgentMemories([])
    } finally {
      setAgentMemoriesLoading(false)
    }
  }

  const selectAgent = (agentId: string) => {
    setSelectedAgentId(agentId)
    loadAgentMemories(agentId)
  }

  const deleteAgentMemory = async (memoryId: string) => {
    if (!token || !selectedAgentId) return
    setDeletingMemoryId(memoryId)
    try {
      await apiClient(`/api/agents/${selectedAgentId}/memories/${memoryId}`, { method: 'DELETE', token })
      setAgentMemories(prev => prev.filter(m => m.id !== memoryId))
      addToast({ variant: 'success', title: 'Memory deleted' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete' })
    } finally {
      setDeletingMemoryId(null)
    }
  }

  const loadMemoryTab = async () => {
    if (memoryTabLoaded || !token) return
    setMemoryTabLoaded(true)
    loadBusinessFacts('pending')
    try {
      const data = await apiClient<{ agents: AgentSummary[] }>('/api/agents', { token })
      setAgentsList(data.agents)
      if (data.agents.length) selectAgent(data.agents[0].id)
    } catch { setAgentsList([]) }
  }

  // ── Privacy tab: retention policy + export/clear ────────────────────────
  interface RetentionPolicy {
    raw_messages_days: number; message_analyses_days: number
    contact_insights_days: number; ai_suggestions_days: number
  }
  const DEFAULT_RETENTION: RetentionPolicy = {
    raw_messages_days: 365, message_analyses_days: 730, contact_insights_days: 0, ai_suggestions_days: 180,
  }
  const [retention, setRetention] = useState<RetentionPolicy>(DEFAULT_RETENTION)
  const [retentionLoaded, setRetentionLoaded] = useState(false)
  const [savingRetention, setSavingRetention] = useState(false)
  const [keepInsightsForever, setKeepInsightsForever] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  const loadRetention = async () => {
    if (!token || retentionLoaded) return
    setRetentionLoaded(true)
    try {
      const data = await apiClient<{ policy: RetentionPolicy }>('/api/data-retention', { token })
      setRetention(data.policy)
      setKeepInsightsForever(data.policy.contact_insights_days === 0)
    } catch { /* keep defaults */ }
  }

  const saveRetention = async () => {
    if (!token) return
    setSavingRetention(true)
    try {
      const payload = {
        ...retention,
        contact_insights_days: keepInsightsForever ? 0 : (retention.contact_insights_days || 365),
      }
      await apiClient('/api/data-retention', { method: 'PUT', token, body: JSON.stringify(payload) })
      setRetention(payload)
      addToast({ variant: 'success', title: 'Retention settings saved' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save' })
    } finally {
      setSavingRetention(false)
    }
  }

  const exportMemory = async () => {
    if (!token) return
    setExporting(true)
    try {
      const data = await apiClient('/api/memory/export', { token })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zuri-memory-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast({ variant: 'error', title: 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  const clearAllMemory = async () => {
    if (!token) return
    setClearingAll(true)
    try {
      const result = await apiClient<{ cleared: Record<string, number> }>('/api/memory/clear-all', {
        method: 'POST', token,
      })
      const total = Object.values(result.cleared).reduce((a, b) => a + b, 0)
      addToast({ variant: 'success', title: `Cleared ${total} AI-generated memories` })
      setClearAllOpen(false)
      setBusinessFacts([])
      setAgentMemories([])
    } catch {
      addToast({ variant: 'error', title: 'Failed to clear memories' })
    } finally {
      setClearingAll(false)
    }
  }

  // AI model preference — stored locally, applied via API call headers when backend supports per-user routing
  const [aiProvider, setAiProvider] = useState<string>('gemini')
  const [aiModel, setAiModel] = useState<string>('gemini/gemini-2.5-flash')
  const [aiPrefSaved, setAiPrefSaved] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('zuri_ai_model_pref')
    if (saved) {
      try {
        const { provider, model } = JSON.parse(saved)
        if (provider) setAiProvider(provider)
        if (model) setAiModel(model)
      } catch { /* ignore */ }
    }
  }, [])

  const saveAiPref = () => {
    localStorage.setItem('zuri_ai_model_pref', JSON.stringify({ provider: aiProvider, model: aiModel }))
    setAiPrefSaved(true)
    addToast({ variant: 'success', title: 'AI model preference saved' })
    setTimeout(() => setAiPrefSaved(false), 2000)
  }

  const AI_PROVIDERS: { value: string; label: string; models: { value: string; label: string }[] }[] = [
    {
      value: 'gemini',
      label: 'Google Gemini',
      models: [
        { value: 'gemini/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
        { value: 'gemini/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      ],
    },
    {
      value: 'anthropic',
      label: 'Anthropic Claude',
      models: [
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recommended)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
        { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      ],
    },
    {
      value: 'qwen',
      label: 'Alibaba Qwen (DashScope)',
      models: [
        { value: 'dashscope/qwen-max', label: 'Qwen Max (Recommended)' },
        { value: 'dashscope/qwen-plus', label: 'Qwen Plus' },
        { value: 'dashscope/qwen-turbo', label: 'Qwen Turbo' },
        { value: 'dashscope/qwen-long', label: 'Qwen Long' },
      ],
    },
    {
      value: 'openai',
      label: 'OpenAI',
      models: [
        { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ],
    },
  ]

  const currentProviderModels = AI_PROVIDERS.find(p => p.value === aiProvider)?.models ?? []

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'account')

  const handleTabChange = (id: string) => {
    setActiveTab(id)
  }

  // Reactive data loader: triggers automatically when token resolves or tab switches
  useEffect(() => {
    if (!token) return
    if (activeTab === 'enterprise' && !enterpriseLoaded) {
      loadEnterprise()
    } else if (activeTab === 'auto_responses' && !autoResponseLoaded) {
      loadAutoResponse()
      loadExclusions()
      loadInclusions()
    } else if (activeTab === 'memory' && !memoryTabLoaded) {
      loadMemoryTab()
    } else if (activeTab === 'privacy' && !retentionLoaded) {
      loadRetention()
      loadPrivacyExclusions()
    } else if (activeTab === 'connected_accounts' && !socialLoaded) {
      loadSocialAccounts()
    } else if (activeTab === 'brand_kit' && !brandKitLoaded) {
      loadBrandKit()
    }
  }, [token, activeTab, enterpriseLoaded, autoResponseLoaded, memoryTabLoaded, retentionLoaded, socialLoaded, brandKitLoaded])

  const tabs = [
    { id: 'account',        label: 'Account' },
    { id: 'workspace',      label: 'Workspace' },
    { id: 'brand_kit',      label: 'Brand Kit' },
    { id: 'intelligence',   label: 'AI Engines' },
    { id: 'auto_responses', label: 'Auto Responses' },
    { id: 'memory',         label: 'Memory' },
    { id: 'privacy',        label: 'Privacy' },
    { id: 'enterprise',     label: 'Enterprise' },
    ...(hasMarketingAccess ? [{ id: 'connected_accounts', label: 'Connected Accounts' }] : []),
  ]

  const activeTabMeta = tabs.find(tab => tab.id === activeTab) ?? tabs[0]

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="px-5 py-5 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-500">Control Center</p>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Settings</h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500">
                    Manage your workspace, automation, memory, privacy, integrations, and connected accounts.
                  </p>
                </div>

                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-base font-bold text-white shadow-sm">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {session.data?.user.name || session.data?.user.email}
                    </p>
                    {session.data?.user.name && (
                      <p className="truncate text-xs text-slate-500">{session.data.user.email}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">Free plan</span>
                      <ModeBadge mode={session.data?.mode ?? 'business'} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/80 px-2 py-2 lg:hidden">
              <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map(tab => {
                  const Icon = TAB_ICONS[tab.id] ?? SlidersHorizontal
                  const selected = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      className={`inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-bold transition-colors ${
                        selected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
                {tabs.map(tab => {
                  const Icon = TAB_ICONS[tab.id] ?? SlidersHorizontal
                  const selected = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                        selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                      }`}
                    >
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                        selected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-white'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{tab.label}</span>
                      </span>
                      {selected && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </aside>

            <main className="min-w-0">
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current section</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{activeTabMeta?.label}</p>
              </div>

              <div className="mx-auto max-w-4xl space-y-4">

          {apiReachable === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Backend not reachable — some settings cannot be saved.</span>
            </div>
          )}

          {(() => {
            const currentTab = activeTab
            return (
              <>
                {/* ── Account tab ── */}
                {currentTab === 'account' && (
                  <div className="space-y-4 pt-2">
                    <Section title="WhatsApp Connection">
                      {waStatus === null ? (
                        <div className="px-5 py-4 text-sm text-gray-400">Checking status…</div>
                      ) : waStatus.connected ? (
                        <div className="px-5 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">Connected</p>
                              {waStatus.phone && <p className="text-xs text-gray-400 mt-0.5">{waStatus.phone}</p>}
                            </div>
                          </div>
                          <button
                            onClick={disconnect}
                            disabled={disconnecting}
                            className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 font-medium transition-colors"
                          >
                            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                          </button>
                        </div>
                      ) : (
                        <div className="px-5 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                            <p className="text-sm text-gray-500">Not connected</p>
                          </div>
                          <a
                            href="/onboarding"
                            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                          >
                            Connect
                          </a>
                        </div>
                      )}
                    </Section>

                    {stats && (
                      <Section title="Usage">
                        <Row label="Contacts tracked"         value={stats.totalContacts.toLocaleString()} />
                        <Row label="Messages analysed"        value={stats.totalMessages.toLocaleString()} />
                        <Row label="AI suggestions generated" value={stats.totalSuggestions.toLocaleString()} />
                      </Section>
                    )}

                    <Section title="Account">
                      <div className="px-5 py-3">
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Account managed via Clerk SSO. To change your email or password, visit your account settings.
                        </p>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600">Billing & plan</span>
                        <a href="/billing" className="text-sm text-indigo-600 hover:underline font-medium">Manage →</a>
                      </div>
                    </Section>
                  </div>
                )}

                {/* ── Workspace tab ── */}
                {currentTab === 'workspace' && (
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-gray-500">
                      Choose how Zuri operates. This controls which intelligence engines run and what features appear in your dashboard.
                    </p>

                    <div className="space-y-2">
                      {MODE_OPTIONS.map(opt => {
                        const selected = pendingMode === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPendingMode(opt.value)}
                            className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-all ${
                              selected ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <opt.Icon className="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-500" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <ModeBadge mode={opt.value} />
                                  {opt.tier && (
                                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{opt.tier}</span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600">{opt.description}</p>
                              </div>
                              <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-indigo-600' : 'border-gray-300'}`}>
                                {selected && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-400 flex-1">Changes apply across all devices immediately.</p>
                      <button
                        type="button"
                        onClick={saveMode}
                        disabled={savingMode || pendingMode === session.data?.mode || !token}
                        className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        {savingMode ? 'Saving…' : 'Save Mode'}
                      </button>
                    </div>

                    <Section title="Currency &amp; Localisation">
                      <div className="p-5 space-y-4">
                        <p className="text-xs text-gray-500">
                          Set your default workspace currency and regional formatting standards for financial calculations and display.
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Preferred Currency</label>
                            <select
                              value={preferredCurrency}
                              onChange={e => setPreferredCurrency(e.target.value)}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="ZMW">ZMW - Zambian Kwacha (ZK)</option>
                              <option value="USD">USD - US Dollar ($)</option>
                              <option value="GBP">GBP - British Pound (£)</option>
                              <option value="EUR">EUR - Euro (€)</option>
                              <option value="ZAR">ZAR - South African Rand (R)</option>
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Regional Format</label>
                            <select
                              value={preferredLocale}
                              onChange={e => setPreferredLocale(e.target.value)}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="en-ZM">English (Zambia)</option>
                              <option value="en-US">English (United States)</option>
                              <option value="en-GB">English (United Kingdom)</option>
                              <option value="en-ZA">English (South Africa)</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={saveLocalisation}
                            disabled={savingLocalisation}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all"
                          >
                            {savingLocalisation ? 'Saving...' : 'Save Localisation'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    <Section title="What's included">
                      {[
                        { label: 'WhatsApp inbox',             modes: ['business', 'personal', 'hybrid'] },
                        { label: 'AI reply drafts',            modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Proactive follow-up queue',  modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Contact profiles',           modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Relationship health',        modes: ['personal', 'hybrid'] },
                        { label: 'Personal relationship coach', modes: ['personal', 'hybrid'] },
                        { label: 'Lead scoring',               modes: ['business', 'hybrid'] },
                        { label: 'Dual intelligence engines',  modes: ['hybrid'] },
                      ].map(row => {
                        const enabled = row.modes.includes(pendingMode)
                        return (
                          <div key={row.label} className="flex items-center justify-between px-5 py-3">
                            <span className={`text-sm ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{row.label}</span>
                            {enabled ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                              </svg>
                            )}
                          </div>
                        )
                      })}
                    </Section>
                  </div>
                )}

                {/* ── Brand Kit tab (Zuri Business Workspace) ── */}
                {currentTab === 'brand_kit' && businessProfile && (
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-gray-500">
                      Your logo, contact details, colors, and payment info appear automatically on every quotation and invoice Zuri generates.
                    </p>

                    <Section title="Company Info">
                      <div className="px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Company name</label>
                            <input
                              value={businessProfile.companyName ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, companyName: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Phone</label>
                            <input
                              value={businessProfile.phone ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, phone: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Email</label>
                            <input
                              value={businessProfile.email ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, email: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Website</label>
                            <input
                              value={businessProfile.website ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, website: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">TPIN / Tax ID</label>
                            <input
                              value={businessProfile.taxId ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, taxId: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Registration number</label>
                            <input
                              value={businessProfile.registrationNumber ?? ''}
                              onChange={e => setBusinessProfile(p => p && { ...p, registrationNumber: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Address</label>
                          <textarea
                            rows={2}
                            value={businessProfile.address ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, address: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </Section>

                    <Section title="Branding">
                      <div className="px-5 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Theme color</label>
                            <input
                              type="color"
                              value={businessProfile.themeColor}
                              onChange={e => setBusinessProfile(p => p && { ...p, themeColor: e.target.value })}
                              className="w-full h-9 border border-gray-300 rounded-lg px-1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Accent color</label>
                            <input
                              type="color"
                              value={businessProfile.accentColor}
                              onChange={e => setBusinessProfile(p => p && { ...p, accentColor: e.target.value })}
                              className="w-full h-9 border border-gray-300 rounded-lg px-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {([
                            { type: 'logo' as const, label: 'Logo', url: businessProfile.logoUrl },
                            { type: 'signature' as const, label: 'Signature', url: businessProfile.signatureUrl },
                            { type: 'stamp' as const, label: 'Stamp', url: businessProfile.stampUrl },
                          ]).map(asset => (
                            <div key={asset.type} className="border border-gray-200 rounded-lg p-3 text-center">
                              <p className="text-xs font-medium text-gray-700 mb-2">{asset.label}</p>
                              {asset.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${asset.url}?token=${token}`} alt={asset.label} className="h-12 mx-auto object-contain mb-2" />
                              ) : (
                                <div className="h-12 flex items-center justify-center text-gray-300 mb-2"><Upload className="w-5 h-5" /></div>
                              )}
                              <label className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">
                                {uploadingAsset === asset.type ? 'Uploading…' : asset.url ? 'Replace' : 'Upload'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingAsset !== null}
                                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadBrandAsset(asset.type, f) }}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Section>

                    <Section title="Payment Details">
                      <div className="px-5 py-4 space-y-3">
                        <p className="text-xs text-gray-400">Shown on quotations and invoices so customers know how to pay.</p>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            placeholder="Bank name"
                            value={businessProfile.bankDetails.bankName ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, bankDetails: { ...p.bankDetails, bankName: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            placeholder="Account name"
                            value={businessProfile.bankDetails.accountName ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, bankDetails: { ...p.bankDetails, accountName: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            placeholder="Account number"
                            value={businessProfile.bankDetails.accountNumber ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, bankDetails: { ...p.bankDetails, accountNumber: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            placeholder="Branch code"
                            value={businessProfile.bankDetails.branchCode ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, bankDetails: { ...p.bankDetails, branchCode: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            placeholder="Mobile money provider"
                            value={businessProfile.mobileMoney.provider ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, mobileMoney: { ...p.mobileMoney, provider: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            placeholder="Mobile money number"
                            value={businessProfile.mobileMoney.number ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, mobileMoney: { ...p.mobileMoney, number: e.target.value } })}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Payment instructions (e.g. 'Payment due within 14 days of invoice date')"
                          value={businessProfile.paymentInstructions ?? ''}
                          onChange={e => setBusinessProfile(p => p && { ...p, paymentInstructions: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </Section>

                    <Section title="Defaults">
                      <div className="px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Default currency</label>
                            <input
                              value={businessProfile.defaultCurrency}
                              onChange={e => setBusinessProfile(p => p && { ...p, defaultCurrency: e.target.value.toUpperCase().slice(0, 3) })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Default tax rate (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={businessProfile.defaultTaxRate}
                              onChange={e => setBusinessProfile(p => p && { ...p, defaultTaxRate: parseFloat(e.target.value) || 0 })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Default terms &amp; conditions</label>
                          <textarea
                            rows={3}
                            value={businessProfile.defaultTerms ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, defaultTerms: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Footer text</label>
                          <input
                            value={businessProfile.footerText ?? ''}
                            onChange={e => setBusinessProfile(p => p && { ...p, footerText: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </Section>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={saveBrandKit}
                        disabled={savingBrandKit}
                        className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {savingBrandKit ? 'Saving…' : 'Save Brand Kit'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Intelligence tab ── */}
                {currentTab === 'intelligence' && (
                  <div className="space-y-6 pt-2">
                    {/* Featured Production BYOK Hub Card */}
                    <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 rounded-2xl p-6 text-white border border-indigo-700/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                          Production BYOK System
                        </div>
                        <h3 className="text-xl font-extrabold text-white">Bring Your Own AI Account</h3>
                        <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                          Connect Google Gemini, OpenAI, or Anthropic Claude. Full key encryption, real-time latency diagnostics, zero markup, and custom spending limit controls.
                        </p>
                      </div>

                      <Link
                        href="/settings/ai"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-950 hover:bg-slate-100 font-extrabold text-xs rounded-xl shadow-lg transition-all shrink-0"
                      >
                        Configure BYOK AI Keys <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>

                    {/* AI Model Preference */}
                    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-5">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-950">AI Model</p>
                          <p className="text-[11px] text-gray-500">Choose your preferred AI provider and model for all Zuri intelligence features</p>
                        </div>
                      </div>


                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Provider</label>
                          <div className="grid grid-cols-2 gap-2">
                            {AI_PROVIDERS.map(p => (
                              <button
                                key={p.value}
                                onClick={() => {
                                  setAiProvider(p.value)
                                  setAiModel(p.models[0].value)
                                }}
                                className={`text-left px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                                  aiProvider === p.value
                                    ? 'border-indigo-600 bg-white text-indigo-700 shadow-sm'
                                    : 'border-white bg-white/60 text-gray-600 hover:border-indigo-200'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Model</label>
                          <select
                            value={aiModel}
                            onChange={e => setAiModel(e.target.value)}
                            className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400"
                          >
                            {currentProviderModels.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-white/70 rounded-xl px-3 py-2.5 border border-indigo-100">
                          <p className="text-[11px] text-gray-500">
                            <span className="font-semibold text-indigo-700">Active: </span>
                            {AI_PROVIDERS.find(p => p.value === aiProvider)?.label} — {currentProviderModels.find(m => m.value === aiModel)?.label?.replace(' (Recommended)', '')}
                          </p>
                        </div>

                        <button
                          onClick={saveAiPref}
                          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                            aiPrefSaved
                              ? 'bg-emerald-500 text-white'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 shadow-sm shadow-indigo-200'
                          }`}
                        >
                          {aiPrefSaved ? '✓ Saved' : 'Save Model Preference'}
                        </button>
                      </div>
                    </div>

                    <Section title="AI Engines">
                      {[
                        { label: 'Proactive suggestions',  desc: 'Daily AI-generated relationship nudges' },
                        { label: 'Relationship clocks',    desc: 'Per-contact timing engine' },
                        { label: 'World knowledge',        desc: 'Match news to contact interests' },
                        { label: 'Voice matching',         desc: 'Reply drafts in your writing style' },
                        { label: 'Lead detection',         desc: 'Buying-signal detection in conversations' },
                        { label: 'Sentiment analysis',     desc: 'Mood and tone tracking per contact' },
                      ].map(engine => (
                        <div key={engine.label} className="flex items-center justify-between px-5 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{engine.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{engine.desc}</p>
                          </div>
                          <Toggle enabled />
                        </div>
                      ))}
                    </Section>
                    <p className="text-xs text-gray-400 px-1">
                      Engine configuration managed by your subscription plan. Granular controls available on Pro.
                    </p>

                    <Section title="Business Manager Assistant">
                      <div className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Proactive business formalization</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Nudges you to draft invoices, quotations, and other records for completed work — even
                            when you don&apos;t need to send them. On by default.
                          </p>
                        </div>
                        <button
                          onClick={toggleBusinessManager}
                          disabled={businessManagerSaving}
                          role="switch"
                          aria-checked={!businessManagerPaused}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${!businessManagerPaused ? 'bg-indigo-600' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${!businessManagerPaused ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </Section>

                    <Section title="Reality Engine">
                      <div className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Keep Zuri&apos;s suggestions honest</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Automatically clears nudges and reminders once they&apos;re no longer relevant — a
                            reply gets sent, an invoice gets created — and flags contradictions for review. On
                            by default.
                          </p>
                        </div>
                        <button
                          onClick={toggleRealityEngine}
                          disabled={realityEngineSaving}
                          role="switch"
                          aria-checked={!realityEnginePaused}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${!realityEnginePaused ? 'bg-indigo-600' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${!realityEnginePaused ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </Section>
                  </div>
                )}

                {/* ── Auto Responses tab ── */}
                {currentTab === 'auto_responses' && (
                  <div className="space-y-4 pt-2">
                    {/* Default Assistant persona + auto-reply mode dial */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
                          {defaultAgent?.avatarEmoji ?? '🤝'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {defaultAgent?.name ?? 'Assistant'}
                            {defaultAgent?.roleTitle && <span className="text-gray-400 font-normal"> · {defaultAgent.roleTitle}</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Your default AI assistant — drafts and (optionally) sends replies for every contact not handled by a specialised agent. See it and its activity on the <Link href="/automation" className="text-indigo-600 hover:underline">AI Workforce</Link> page.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <label className="block text-xs font-medium text-gray-500 mb-2">Auto-reply mode</label>
                        <div className="space-y-1.5">
                          {AUTO_REPLY_MODES.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={!defaultAgent}
                              onClick={() => setAutoReplyMode(opt.key)}
                              className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-all disabled:opacity-50 ${
                                currentAutoReplyMode === opt.key
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <p className="text-xs font-medium text-gray-900">{opt.label}</p>
                            </button>
                          ))}
                        </div>
                        {!defaultAgent && (
                          <p className="text-xs text-amber-600 mt-2">Couldn&apos;t load your default agent — falling back to the plain on/off switch below.</p>
                        )}
                      </div>

                      {!defaultAgent && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-gray-700">Auto-respond</p>
                            <button
                              onClick={() => setAutoResponse(s => ({ ...s, enabled: !s.enabled }))}
                              role="switch"
                              aria-checked={autoResponse.enabled}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${autoResponse.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${autoResponse.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Business hours */}
                    <Section title="Business Hours">
                      <div className="px-5 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Start time</label>
                            <input
                              type="time"
                              value={autoResponse.businessHoursStart}
                              onChange={e => setAutoResponse(s => ({ ...s, businessHoursStart: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">End time</label>
                            <input
                              type="time"
                              value={autoResponse.businessHoursEnd}
                              onChange={e => setAutoResponse(s => ({ ...s, businessHoursEnd: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Active days</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                              const active = autoResponse.activeDays.includes(i)
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => setAutoResponse(s => ({
                                    ...s,
                                    activeDays: active
                                      ? s.activeDays.filter(d => d !== i)
                                      : [...s.activeDays, i].sort(),
                                  }))}
                                  className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${
                                    active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  }`}
                                >
                                  {day}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Send delay (seconds)</label>
                          <p className="text-xs text-gray-400 mb-2">Simulates natural typing time before sending</p>
                          <select
                            value={autoResponse.sendDelaySeconds}
                            onChange={e => setAutoResponse(s => ({ ...s, sendDelaySeconds: Number(e.target.value) }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value={10}>10 seconds</option>
                            <option value={30}>30 seconds</option>
                            <option value={60}>1 minute</option>
                            <option value={120}>2 minutes</option>
                            <option value={300}>5 minutes</option>
                          </select>
                        </div>
                      </div>
                    </Section>

                    {/* Conversation types */}
                    <Section title="Who to respond to">
                      {[
                        { key: 'respondToLeads',       label: 'Leads & prospects',    desc: 'Contacts in your sales pipeline' },
                        { key: 'respondToCustomers',   label: 'Existing customers',   desc: 'Contacts with customer status' },
                        { key: 'respondToNewContacts', label: 'New contacts',         desc: 'First-time messages from unknown contacts' },
                        { key: 'skipGroups',           label: 'Skip group chats',     desc: 'Never auto-respond in group conversations', invert: true },
                        { key: 'skipBroadcasts',       label: 'Skip broadcasts',      desc: 'Never auto-respond to broadcast lists', invert: true },
                      ].map(row => {
                        const val = autoResponse[row.key as keyof AutoResponseSettings] as boolean
                        const displayed = row.invert ? !val : val
                        return (
                          <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{row.label}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{row.desc}</p>
                            </div>
                            <button
                              onClick={() => setAutoResponse(s => ({ ...s, [row.key]: !val }))}
                              role="switch"
                              aria-checked={displayed}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${displayed ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${displayed ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                        )
                      })}
                    </Section>

                    <Section title="Inclusion-Only Mode">
                      <div className="px-5 py-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">Enable Inclusion-Only Mode</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Only auto-respond to contacts explicitly added to the inclusion list below. All other contacts will be ignored by auto-response.
                            </p>
                          </div>
                          <button
                            onClick={() => setAutoResponse(s => ({ ...s, inclusionMode: !s.inclusionMode }))}
                            role="switch"
                            aria-checked={autoResponse.inclusionMode}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${autoResponse.inclusionMode ? 'bg-indigo-600' : 'bg-gray-200'}`}
                          >
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${autoResponse.inclusionMode ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>

                        {autoResponse.inclusionMode && (
                          <div className="space-y-4 pt-2">
                            {inclusionContacts.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                                {inclusionContacts.map(c => (
                                  <span key={c.id} className="inline-flex items-center gap-1 text-xs bg-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                    {c.contactName}
                                    <button onClick={() => removeInclusion(c.id)} className="hover:text-indigo-900 font-bold">×</button>
                                  </span>
                                ))}
                              </div>
                            )}

                            <MultiContactSelect
                              label="Add contacts to auto-reply inclusions list"
                              buttonText="Include"
                              contactOptions={contactOptions}
                              onAdd={addInclusions}
                            />
                          </div>
                        )}
                      </div>
                    </Section>

                    {/* Exceptions — granular per-contact/rule exclusions (plan §4).
                        Additive on top of "Who to respond to": respond to
                        these types of contacts, EXCEPT these people/rules. */}
                    <Section title="Exceptions">
                      <div className="px-5 py-4 space-y-4">
                        <p className="text-xs text-gray-400">
                          Contacts and categories that should never be auto-engaged — e.g. family, or anyone you&apos;d rather handle yourself.
                        </p>

                        {(exclusionContacts.length > 0 || exclusionRules.length > 0) && (
                          <div className="flex flex-wrap gap-1.5">
                            {exclusionContacts.map(c => (
                              <span key={c.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                                {c.contactName}
                                <button onClick={() => removeContactExclusion(c.id)} className="hover:text-red-600 font-bold">×</button>
                              </span>
                            ))}
                            {exclusionRules.map(r => (
                              <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                                {r.ruleType.replace('_', ' ')} = {r.ruleValue}
                                <button onClick={() => removeExclusionRule(r.id)} className="hover:text-red-600 font-bold">×</button>
                              </span>
                            ))}
                          </div>
                        )}

                        <MultiContactSelect
                          label="Add contacts to auto-reply exclusion list"
                          buttonText="Exclude"
                          contactOptions={contactOptions}
                          onAdd={addContactExclusions}
                        />

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Or describe who to exclude</label>
                          <p className="text-xs text-gray-400 mb-2">e.g. &ldquo;exclude all my relatives&rdquo;, &ldquo;leave out anyone tagged personal&rdquo;</p>
                          <div className="flex gap-2">
                            <input
                              value={exclusionInstruction}
                              onChange={e => setExclusionInstruction(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') parseExclusionInstruction() }}
                              placeholder="Type an instruction…"
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              onClick={parseExclusionInstruction}
                              disabled={parsingExclusion || !exclusionInstruction.trim()}
                              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50"
                            >
                              {parsingExclusion ? 'Thinking…' : 'Parse'}
                            </button>
                          </div>

                          {pendingExclusion && (
                            <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
                              <p className="text-xs text-indigo-900">
                                {pendingExclusion.type === 'contact'
                                  ? <>This will exclude <strong>{pendingExclusion.contactName}</strong>.</>
                                  : <>This will exclude anyone matching <strong>{pendingExclusion.ruleType.replace('_', ' ')} = {pendingExclusion.ruleValue}</strong> ({pendingExclusion.matchCount} contact{pendingExclusion.matchCount === 1 ? '' : 's'} today).</>}
                              </p>
                              <div className="flex gap-2 mt-2">
                                <button onClick={confirmPendingExclusion} className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5">Confirm</button>
                                <button onClick={() => setPendingExclusion(null)} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Section>

                    {/* Escalation */}
                    <Section title="Escalation rules">
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Escalation keywords</label>
                          <p className="text-xs text-gray-400 mb-2">If a message contains these words, stop auto-responding and alert you</p>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {autoResponse.escalationKeywords.map(kw => (
                              <span key={kw} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
                                {kw}
                                <button onClick={() => setAutoResponse(s => ({ ...s, escalationKeywords: s.escalationKeywords.filter(k => k !== kw) }))} className="hover:text-red-900">×</button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={escalationKwInput}
                              onChange={e => setEscalationKwInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && escalationKwInput.trim()) {
                                  setAutoResponse(s => ({ ...s, escalationKeywords: [...s.escalationKeywords, escalationKwInput.trim()] }))
                                  setEscalationKwInput('')
                                }
                              }}
                              placeholder="e.g. refund, lawsuit, cancel (press Enter)"
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notify email (optional)</label>
                          <input
                            type="email"
                            value={autoResponse.escalationNotifyEmail ?? ''}
                            onChange={e => setAutoResponse(s => ({ ...s, escalationNotifyEmail: e.target.value || null }))}
                            placeholder="you@example.com"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </Section>

                    {/* Persona — backed by the Default Assistant's own row
                        (agents.greeting_message/out_of_hours_message/tone),
                        not auto_response_settings, so /automation always
                        shows the same values Settings does (plan §8). */}
                    <Section title="Persona & message templates">
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Tone</label>
                          <div className="flex gap-2 flex-wrap">
                            {['friendly', 'professional', 'casual', 'formal'].map(t => (
                              <button
                                key={t}
                                type="button"
                                disabled={!defaultAgent}
                                onClick={() => defaultAgent && setDefaultAgent({ ...defaultAgent, tone: t })}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                                  defaultAgent?.tone === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Greeting message</label>
                          <p className="text-xs text-gray-400 mb-2">Sent to new contacts before the AI reply</p>
                          <textarea
                            value={defaultAgent?.greetingMessage ?? ''}
                            disabled={!defaultAgent}
                            onChange={e => defaultAgent && setDefaultAgent({ ...defaultAgent, greetingMessage: e.target.value || null })}
                            placeholder="Hi! Thanks for reaching out. I'll get back to you shortly."
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Away message</label>
                          <p className="text-xs text-gray-400 mb-2">Sent when a message arrives outside business hours</p>
                          <textarea
                            value={defaultAgent?.outOfHoursMessage ?? ''}
                            disabled={!defaultAgent}
                            onChange={e => defaultAgent && setDefaultAgent({ ...defaultAgent, outOfHoursMessage: e.target.value || null })}
                            placeholder="Thanks for your message! I'll respond during business hours (Mon–Fri, 9am–6pm)."
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </Section>

                    {/* Learning */}
                    <Section title="Learning & improvement">
                      {[
                        { key: 'learnFromCorrections',  label: 'Learn from corrections',    desc: 'When you edit an auto-reply, Zuri learns your style' },
                        { key: 'smartFollowupEnabled',  label: 'Smart follow-ups',          desc: 'Auto-schedule follow-up messages if no reply in 48h' },
                      ].map(row => {
                        const val = autoResponse[row.key as keyof AutoResponseSettings] as boolean
                        return (
                          <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{row.label}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{row.desc}</p>
                            </div>
                            <button
                              onClick={() => setAutoResponse(s => ({ ...s, [row.key]: !val }))}
                              role="switch"
                              aria-checked={val}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${val ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                        )
                      })}
                    </Section>

                    <div className="flex justify-end">
                      <button
                        onClick={saveAutoResponse}
                        disabled={savingAutoResponse || !token}
                        className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {savingAutoResponse ? 'Saving…' : 'Save settings'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Enterprise tab ── */}
                {currentTab === 'enterprise' && (
                  <div className="space-y-4 pt-2">
                    {/* API Keys */}
                    <Section title="API Keys">
                      <div className="px-5 py-4">
                        <p className="text-xs text-gray-400 mb-3">Use API keys to integrate Zuri with external services. Keys are shown only once at creation.</p>
                        {apiKeys.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {apiKeys.map(k => (
                              <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{k.label}</p>
                                  <p className="text-xs text-gray-400">Created {new Date(k.created_at).toLocaleDateString()}</p>
                                </div>
                                <button onClick={() => revokeApiKey(k.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Revoke</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {newKeyValue && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">Copy this key now — it won&apos;t be shown again</p>
                            <code className="text-xs text-green-800 break-all">{newKeyValue}</code>
                            <button onClick={() => setNewKeyValue(null)} className="mt-2 text-xs text-green-600 hover:text-green-800 block">Dismiss</button>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)}
                            placeholder="Key label (e.g. Zapier)" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button disabled={creatingKey || !newKeyLabel.trim()} onClick={createApiKey}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                            {creatingKey ? '…' : 'Create'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    {/* Webhooks */}
                    <Section title="Webhooks">
                      <div className="px-5 py-4">
                        <p className="text-xs text-gray-400 mb-3">Receive real-time POST events for messages, escalations, and broadcasts.</p>
                        {webhooks.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {webhooks.map(w => (
                              <div key={w.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-gray-700 truncate font-mono">{w.url}</p>
                                  <p className="text-xs text-gray-400">{w.events?.join(', ')}</p>
                                </div>
                                <button onClick={() => deleteWebhook(w.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Delete</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                            placeholder="https://your-app.com/webhook"
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button disabled={addingWebhook || !webhookUrl.trim()} onClick={addWebhook}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                            {addingWebhook ? '…' : 'Add'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    {/* BYOK */}
                    <Section title="Bring Your Own AI Keys (BYOK)">
                      <div className="px-5 py-4">
                        <p className="text-xs text-gray-400 mb-3">Use your own AI provider API keys so usage is billed directly to your account.</p>
                        {byokKeys.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {byokKeys.map(k => (
                              <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <p className="text-sm font-medium text-gray-800 capitalize">{k.provider}</p>
                                <span className="text-xs text-green-600 font-medium">● Configured</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 mb-2">
                          <select value={byokProvider} onChange={e => setByokProvider(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="anthropic">Anthropic</option>
                            <option value="openai">OpenAI</option>
                            <option value="google">Google AI</option>
                          </select>
                          <input value={byokApiKey} onChange={e => setByokApiKey(e.target.value)}
                            type="password" placeholder="sk-..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <button disabled={savingByok || !byokApiKey.trim()} onClick={saveByok}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                          {savingByok ? 'Saving…' : 'Save key'}
                        </button>
                      </div>
                    </Section>

                    {/* CRM link */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">CRM Integrations</p>
                        <p className="text-xs text-gray-400 mt-0.5">Connect HubSpot, Salesforce, and more</p>
                      </div>
                      <a href="/settings/integrations" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Configure →</a>
                    </div>
                  </div>
                )}

                {/* ── Connected Accounts tab (Zuri Marketing) ── */}
                {currentTab === 'connected_accounts' && (
                  <div className="space-y-4 pt-2">
                    <Section title="Social Accounts">
                      <div className="px-5 py-4 space-y-3">
                        <p className="text-xs text-gray-400">
                          Connect the accounts Studio posts to. Real OAuth for Facebook, Instagram
                          and TikTok isn&apos;t wired up yet — connecting here records the account so
                          you can build and test the rest of the publishing flow now.
                        </p>
                        {SOCIAL_PLATFORMS.map(({ value, label, Icon }) => {
                          const connected = socialAccounts.filter(a => a.platform === value)
                          return (
                            <div key={value} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-medium text-gray-800">{label}</span>
                              </div>
                              {connected.map(acc => (
                                <div key={acc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2">
                                  <span className="text-sm text-gray-700">{acc.accountName}</span>
                                  <button onClick={() => disconnectSocialAccount(acc.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">
                                    Disconnect
                                  </button>
                                </div>
                              ))}
                              {connectingPlatform === value ? (
                                <div className="flex gap-2">
                                  <input
                                    value={connectAccountName}
                                    onChange={e => setConnectAccountName(e.target.value)}
                                    placeholder="Page or account name"
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <button
                                    disabled={!connectAccountName.trim()}
                                    onClick={() => connectSocialAccount(value)}
                                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                  >
                                    Connect
                                  </button>
                                  <button
                                    onClick={() => { setConnectingPlatform(null); setConnectAccountName('') }}
                                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConnectingPlatform(value)}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                  + Connect {label} account
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </Section>
                  </div>
                )}

                {/* ── Memory tab ── */}
                {currentTab === 'memory' && (
                  <div className="space-y-4 pt-2">
                    <Section title="Business Facts">
                      <div className="px-5 py-3 flex items-center gap-2">
                        {(['pending', 'approved', 'all'] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => changeFactsFilter(f)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors capitalize ${
                              factsFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      {businessFacts.length === 0 ? (
                        <EmptyState
                          title="No business facts here"
                          description="Zuri learns pricing, policies, and product facts automatically from your conversations."
                        />
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {businessFacts.map(fact => (
                            <div key={fact.id} className="px-5 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="purple">{fact.category}</Badge>
                                    <Badge variant={fact.isApproved ? 'success' : 'warning'}>
                                      {fact.isApproved ? 'Approved' : 'Pending review'}
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                      {Math.round(fact.confidence * 100)}% confidence · {fact.evidenceCount} mention{fact.evidenceCount === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-gray-900">{fact.factKey}</p>
                                  {editingFactId === fact.id ? (
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <input
                                        value={editFactValue}
                                        onChange={e => setEditFactValue(e.target.value)}
                                        className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <button
                                        onClick={() => saveEditFact(fact.id)}
                                        disabled={factActionLoading === fact.id}
                                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                                      >
                                        Save
                                      </button>
                                      <button onClick={() => setEditingFactId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-600 mt-0.5">{fact.factValue}</p>
                                  )}
                                </div>
                                {editingFactId !== fact.id && (
                                  <div className="flex-shrink-0 flex items-center gap-3">
                                    {!fact.isApproved && (
                                      <button
                                        onClick={() => approveFact(fact.id)}
                                        disabled={factActionLoading === fact.id}
                                        className="text-xs font-medium text-green-600 hover:text-green-700"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    <button
                                      onClick={() => startEditFact(fact)}
                                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => rejectFact(fact.id)}
                                      disabled={factActionLoading === fact.id}
                                      className="text-xs font-medium text-red-500 hover:text-red-600"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Agent Memories">
                      <div className="px-5 py-3">
                        {agentsList.length === 0 ? (
                          <p className="text-sm text-gray-400">No agents yet — create one in AI Workforce first.</p>
                        ) : (
                          <Select
                            value={selectedAgentId}
                            onChange={e => selectAgent(e.target.value)}
                            className="max-w-xs"
                            options={agentsList.map(a => ({ value: a.id, label: a.name }))}
                          />
                        )}
                      </div>
                      {agentMemoriesLoading ? (
                        <div className="px-5 py-4 text-sm text-gray-400">Loading…</div>
                      ) : agentMemories.length === 0 ? (
                        <EmptyState
                          title="Nothing remembered yet"
                          description="This agent hasn't learned any facts or experiences from its conversations yet."
                        />
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {agentMemories.map(mem => (
                            <div key={mem.id} className="px-5 py-4 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={mem.memoryType === 'experience' ? 'info' : 'default'}>
                                    {mem.memoryType}
                                  </Badge>
                                  <Badge variant="default">{mem.scope}</Badge>
                                  <span className="text-xs text-gray-400">{Math.round(mem.confidence * 100)}% confidence</span>
                                </div>
                                {mem.memoryType === 'experience' ? (
                                  <p className="text-sm text-gray-700">
                                    <span className="font-medium">{mem.situation}</span> → {mem.actionTaken} → {mem.outcome}
                                    {mem.worked !== null && (
                                      <span className={mem.worked ? 'text-green-600' : 'text-red-500'}> ({mem.worked ? 'worked' : "didn't work"})</span>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-700"><span className="font-medium">{mem.key}:</span> {mem.value}</p>
                                )}
                              </div>
                              <button
                                onClick={() => deleteAgentMemory(mem.id)}
                                disabled={deletingMemoryId === mem.id}
                                className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  </div>
                )}

                {/* ── Privacy tab ── */}
                {currentTab === 'privacy' && (
                  <div className="space-y-4 pt-2">
                    <Section title="Data & Privacy">
                      <div className="px-5 py-4">
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                          Zuri processes your WhatsApp messages locally through your own account to build contact profiles and generate suggestions. Message content is never shared with third parties.
                        </p>
                        <ul className="space-y-2">
                          {[
                            'Messages are analysed on our secure servers',
                            'AI profiles are stored in your private database',
                            'You can delete all data at any time',
                            'No message content is used to train AI models',
                          ].map(item => (
                            <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                              <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              {item}
                            </li>
                          ))}
                        </ul>

                        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">AI Privacy Assistant</p>
                            <p className="text-xs text-gray-500 mt-0.5">Scan your contacts using AI to identify high-privacy relationships and apply strict privacy controls in bulk.</p>
                          </div>
                          <button
                            onClick={handleRunPrivacyAnalysis}
                            disabled={runningPrivacyAnalysis}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                          >
                            {runningPrivacyAnalysis ? (
                              <>
                                <RefreshCw size={13} className="animate-spin" />
                                <span>Scanning...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={13} />
                                <span>Launch Assistant</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </Section>

                    <Section title="Data Retention">
                      <div className="px-5 py-4 space-y-4">
                        <p className="text-xs text-gray-400">
                          How long Zuri keeps different kinds of data before it's automatically purged. 3650 days max.
                        </p>
                        {([
                          ['raw_messages_days', 'Raw messages'],
                          ['message_analyses_days', 'Message analysis (sentiment, intent, etc.)'],
                          ['ai_suggestions_days', 'AI reply suggestions'],
                        ] as const).map(([field, label]) => (
                          <div key={field} className="flex items-center justify-between gap-4">
                            <span className="text-sm text-gray-700">{label}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={3650}
                                value={retention[field]}
                                onChange={e => setRetention(prev => ({ ...prev, [field]: Number(e.target.value) || 1 }))}
                                className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <span className="text-xs text-gray-400">days</span>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-700">AI contact insights</span>
                          <div className="flex items-center gap-3">
                            {!keepInsightsForever && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={3650}
                                  value={retention.contact_insights_days || 365}
                                  onChange={e => setRetention(prev => ({ ...prev, contact_insights_days: Number(e.target.value) || 1 }))}
                                  className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-gray-400">days</span>
                              </div>
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={keepInsightsForever}
                                onChange={e => setKeepInsightsForever(e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              Keep forever
                            </label>
                          </div>
                        </div>
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={saveRetention}
                            disabled={savingRetention}
                            className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
                          >
                            {savingRetention ? 'Saving…' : 'Save retention settings'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    <Section title="System-wide Privacy Exclusions">
                      <div className="px-5 py-4 space-y-4">
                        <p className="text-xs text-gray-400">
                          Add contacts to completely exclude them from all of Zuri. When their messages are received, Zuri will completely bypass all intelligence ingestion pipelines (no logging, profiling, vector context snapshotting, or AI analysis).
                        </p>

                        {privacyContacts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 p-3 bg-red-50/50 rounded-xl border border-red-100/50">
                            {privacyContacts.map(c => (
                              <span key={c.id} className="inline-flex items-center gap-1 text-xs bg-red-100/50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                {c.contactName}
                                <button onClick={() => removePrivacyExclusion(c.id)} className="hover:text-red-900 font-bold">×</button>
                              </span>
                            ))}
                          </div>
                        )}

                        <MultiContactSelect
                          label="Exclude contacts from all Zuri processing"
                          buttonText="Privacy Exclude"
                          contactOptions={contactOptions}
                          onAdd={addPrivacyExclusions}
                        />
                      </div>
                    </Section>

                    <Section title="Data Controls">
                      <div className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Export my memory data</p>
                          <p className="text-xs text-gray-400 mt-0.5">Download every business fact, AI insight, and agent memory Zuri has created about you</p>
                        </div>
                        <button
                          onClick={exportMemory}
                          disabled={exporting}
                          className="flex-shrink-0 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors disabled:opacity-50"
                        >
                          {exporting ? 'Exporting…' : 'Export'}
                        </button>
                      </div>
                      <div className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-red-600">Clear all AI-generated memories</p>
                          <p className="text-xs text-gray-400 mt-0.5">Removes business facts, contact insights, and agent memories — not your messages or contacts</p>
                        </div>
                        <button
                          onClick={() => setClearAllOpen(true)}
                          className="flex-shrink-0 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </Section>
                  </div>
                )}
              </>
            )
          })()}

              </div>
            </main>
          </div>
        </div>
      </div>

      {showPrivacyAssistant && privacyAssistantResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowPrivacyAssistant(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-indigo-600">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">AI Privacy Assistant</h3>
                  <p className="text-xs text-gray-500">Suggested high-privacy contacts detected</p>
                </div>
              </div>
              <button
                onClick={() => setShowPrivacyAssistant(false)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                The Zuri Reality Engine detected conversational markers indicating sensitive, personal, medical, or confidential relationships. We recommend applying strict privacy settings to these contacts.
              </p>

              {privacyAssistantResults.contacts.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle size={18} />
                  </div>
                  <p className="text-xs font-semibold text-gray-800">All contacts are secure</p>
                  <p className="text-[11px] text-gray-400">No high-risk personal relationships detected.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {privacyAssistantResults.contacts.map((c) => {
                    const isSelected = selectedPrivacyAssistantContactIds.includes(c.id)
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPrivacyAssistantContactIds(prev => prev.filter(id => id !== c.id))
                          } else {
                            setSelectedPrivacyAssistantContactIds(prev => [...prev, c.id])
                          }
                        }}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none text-left ${
                          isSelected
                            ? 'bg-indigo-50/50 border-indigo-200/80 shadow-sm'
                            : 'bg-white border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/20 w-4 h-4 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-900">{c.name}</p>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-100/50 flex-shrink-0">
                              {c.confidence}% Risk
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-amber-800/85 mt-1 leading-relaxed bg-amber-50/50 px-2 py-1 rounded-lg border border-amber-100/30">
                            {c.reason}
                          </p>
                          {c.snippet && (
                            <p className="text-[10px] text-gray-400 italic mt-1.5 leading-relaxed bg-gray-50 px-2 py-1 rounded-md border border-gray-100/40">
                              "{c.snippet}"
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {privacyAssistantResults.contacts.length > 0 && (
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                <p className="text-[11px] text-gray-500 font-semibold">
                  {selectedPrivacyAssistantContactIds.length} of {privacyAssistantResults.contacts.length} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrivacyAssistant(false)}
                    className="px-4 py-2 border border-gray-200 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyBulkPrivacy}
                    disabled={applyingBulkPrivacy || selectedPrivacyAssistantContactIds.length === 0}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {applyingBulkPrivacy ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Applying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} />
                        <span>Apply Strict Privacy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        onConfirm={clearAllMemory}
        title="Clear all AI-generated memories?"
        description="This deactivates every business fact, contact insight, and agent memory Zuri has learned. Your messages, contacts, and conversations are untouched — Zuri will simply start learning again from here."
        confirmLabel="Clear everything"
        destructive
        loading={clearingAll}
      />
    </div>
  )
}
