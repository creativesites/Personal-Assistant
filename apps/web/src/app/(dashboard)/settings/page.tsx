'use client'

import { useEffect, useState } from 'react'
import { useZuriSession, setStoredMode } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { ModeBadge, PageHeader, Tabs, useToast } from '@/components/ui'
import { Briefcase, Users, Zap, AlertTriangle } from 'lucide-react'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div className={`w-10 h-6 rounded-full flex items-center px-1 cursor-not-allowed opacity-60 transition-colors ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  )
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

  useEffect(() => {
    if (session.data?.mode) setPendingMode(session.data.mode)
  }, [session.data?.mode])

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
  }

  const DEFAULT_AUTO_RESPONSE: AutoResponseSettings = {
    enabled: false, businessHoursStart: '09:00', businessHoursEnd: '18:00',
    timezone: 'UTC', activeDays: [1, 2, 3, 4, 5], sendDelaySeconds: 30,
    approvalMode: 'preview', respondToLeads: true, respondToCustomers: true,
    respondToNewContacts: false, skipGroups: true, skipBroadcasts: true,
    escalationKeywords: [], escalationNotifyEmail: null, greetingMessage: null,
    awayMessage: null, smartFollowupEnabled: false, learnFromCorrections: true,
  }

  const [autoResponse, setAutoResponse] = useState<AutoResponseSettings>(DEFAULT_AUTO_RESPONSE)
  const [autoResponseLoaded, setAutoResponseLoaded] = useState(false)
  const [savingAutoResponse, setSavingAutoResponse] = useState(false)
  const [escalationKwInput, setEscalationKwInput] = useState('')

  const loadAutoResponse = async () => {
    if (!token || autoResponseLoaded) return
    setAutoResponseLoaded(true)
    try {
      const data = await apiClient<AutoResponseSettings>('/api/settings/auto-response', { token })
      setAutoResponse(data as AutoResponseSettings)
    } catch { /* ignore */ }
  }

  const saveAutoResponse = async () => {
    if (!token) return
    setSavingAutoResponse(true)
    try {
      await apiClient('/api/settings/auto-response', {
        method: 'PUT',
        token,
        body: JSON.stringify(autoResponse),
      })
      addToast({ variant: 'success', title: 'Auto-response settings saved' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save', description: 'Please try again.' })
    } finally {
      setSavingAutoResponse(false)
    }
  }

  const [activeTab, setActiveTab] = useState('account')

  const handleTabChange = (id: string) => {
    setActiveTab(id)
    if (id === 'enterprise' && !enterpriseLoaded) loadEnterprise()
    if (id === 'auto_responses' && !autoResponseLoaded) loadAutoResponse()
  }

  const tabs = [
    { id: 'account',        label: 'Account' },
    { id: 'workspace',      label: 'Workspace' },
    { id: 'intelligence',   label: 'AI Engines' },
    { id: 'auto_responses', label: 'Auto Responses' },
    { id: 'privacy',        label: 'Privacy' },
    { id: 'enterprise',     label: 'Enterprise' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-xl mx-auto space-y-4">

          {apiReachable === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Backend not reachable — some settings cannot be saved.</span>
            </div>
          )}

          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">
                {session.data?.user.name || session.data?.user.email}
              </p>
              {session.data?.user.name && (
                <p className="text-sm text-gray-400 truncate">{session.data.user.email}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Free plan</span>
                <ModeBadge mode={session.data?.mode ?? 'business'} />
              </div>
            </div>
          </div>

          <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange}>
            {(currentTab) => (
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

                {/* ── Intelligence tab ── */}
                {currentTab === 'intelligence' && (
                  <div className="space-y-4 pt-2">
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
                  </div>
                )}

                {/* ── Auto Responses tab ── */}
                {currentTab === 'auto_responses' && (
                  <div className="space-y-4 pt-2">
                    {/* Master toggle */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">AI Auto Responses</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Zuri will automatically draft and send replies on your behalf during your business hours. Off by default — you stay in control.
                          </p>
                        </div>
                        <button
                          onClick={() => setAutoResponse(s => ({ ...s, enabled: !s.enabled }))}
                          role="switch"
                          aria-checked={autoResponse.enabled}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${autoResponse.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${autoResponse.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {autoResponse.enabled && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-500 mb-2">Approval mode</label>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: 'auto',    label: 'Auto-send',  desc: 'Sends without review' },
                              { value: 'preview', label: 'Preview',    desc: 'Shows draft for 30s' },
                              { value: 'manual',  label: 'Manual',     desc: 'Always ask for approval' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setAutoResponse(s => ({ ...s, approvalMode: opt.value }))}
                                className={`text-left rounded-lg border-2 px-3 py-2.5 transition-all ${
                                  autoResponse.approvalMode === opt.value
                                    ? 'border-indigo-600 bg-indigo-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <p className="text-xs font-medium text-gray-900">{opt.label}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                              </button>
                            ))}
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

                    {/* Messages */}
                    <Section title="Message templates">
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Greeting message</label>
                          <p className="text-xs text-gray-400 mb-2">Sent to new contacts before the AI reply</p>
                          <textarea
                            value={autoResponse.greetingMessage ?? ''}
                            onChange={e => setAutoResponse(s => ({ ...s, greetingMessage: e.target.value || null }))}
                            placeholder="Hi! Thanks for reaching out. I'll get back to you shortly."
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Away message</label>
                          <p className="text-xs text-gray-400 mb-2">Sent when a message arrives outside business hours</p>
                          <textarea
                            value={autoResponse.awayMessage ?? ''}
                            onChange={e => setAutoResponse(s => ({ ...s, awayMessage: e.target.value || null }))}
                            placeholder="Thanks for your message! I'll respond during business hours (Mon–Fri, 9am–6pm)."
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
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
                      </div>
                    </Section>

                    <Section title="Data Controls">
                      <div className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Export my data</p>
                          <p className="text-xs text-gray-400 mt-0.5">Download all your contacts, messages, and AI profiles</p>
                        </div>
                        <button className="flex-shrink-0 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                          Export
                        </button>
                      </div>
                      <div className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-red-600">Delete all data</p>
                          <p className="text-xs text-gray-400 mt-0.5">Permanently remove all contacts, profiles, and history</p>
                        </div>
                        <button className="flex-shrink-0 text-sm text-red-500 hover:text-red-600 font-medium transition-colors">
                          Delete
                        </button>
                      </div>
                    </Section>
                  </div>
                )}
              </>
            )}
          </Tabs>

        </div>
      </div>
    </div>
  )
}
