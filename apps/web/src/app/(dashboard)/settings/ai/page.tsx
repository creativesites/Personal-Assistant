'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { useToast, Badge, PageHeader } from '@/components/ui'
import {
  Sparkles, Key, ShieldCheck, Zap, Server, Activity, ArrowRight, CheckCircle2,
  AlertTriangle, Copy, Eye, EyeOff, RefreshCw, Layers, DollarSign,
  TrendingUp, Clock, HelpCircle, ExternalLink, Lock, Check, Cpu, BarChart3,
  Building, ChevronRight, Sliders, AlertCircle, Info, RefreshCw as RotateCcw
} from 'lucide-react'

export const OPENAI_MODELS = [
  { id: "gpt-5.6", name: "GPT-5.6 (Sol)", recommended: true },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "o4", name: "o4" },
  { id: "o4-mini", name: "o4 Mini" },
  { id: "o3", name: "o3" }
]

export const GEMINI_MODELS = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", recommended: true },
  { id: "gemini-3.5-pro", name: "Gemini 3.5 Pro" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "gemini-3-deep-think", name: "Gemini 3 Deep Think" },
  { id: "gemini-flash-cyber", name: "Gemini Flash Cyber" }
]

export const CLAUDE_MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5", recommended: true },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-haiku-5", name: "Claude Haiku 5" }
]

export const QWEN_MODELS = [
  { id: "qwen-3.8-max", name: "Qwen 3.8 Max", recommended: true },
  { id: "qwen-3.8", name: "Qwen 3.8" },
  { id: "qwen-3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen-3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "qwen-3.5", name: "Qwen 3.5" },
  { id: "qwen2.5-coder", name: "Qwen2.5 Coder" },
  { id: "qwen2.5-vl", name: "Qwen2.5 VL" },
  { id: "qwen2.5-math", name: "Qwen2.5 Math" }
]

interface ProviderMetadata {
  id: string
  name: string
  company: string
  description: string
  strengths: string[]
  best_for: string
  estimated_pricing: string
  difficulty: string
  is_recommended: boolean
  badge?: string
  console_url: string
  documentation_url: string
  setup_steps: { step: number; title: string; description: string; action_label?: string; action_url?: string }[]
  default_model: string
  recommended_models: { id: string; name: string; type: string; description: string }[]
}

interface SavedKey {
  id: string
  provider: string
  key_hint: string
  is_active: boolean
  status: 'healthy' | 'invalid' | 'quota_exceeded' | 'untested'
  last_validated_at: string | null
  last_error_message: string | null
  metadata: { modelsCount?: number; recommended_model?: string; latencyMs?: number }
}

interface AISettings {
  default_provider: string
  preferred_model: string
  reasoning_model: string
  fast_model: string
  vision_model: string
  temperature: number
  max_output_length: number
  streaming_enabled: boolean
  auto_fallback_enabled: boolean
  daily_budget_usd: number
  monthly_budget_usd: number
  budget_warning_threshold_pct: number
  budget_hard_limit_enabled: boolean
  budget_soft_limit_enabled: boolean
}

interface UsageSummary {
  todaySpendUsd: number
  monthSpendUsd: number
  todayRequests: number
  monthRequests: number
}

interface AIAnalytics {
  timeframe: string
  metrics: {
    totalRequests: number
    totalTokens: number
    promptTokens: number
    completionTokens: number
    estimatedCostUsd: number
    avgLatencyMs: number
    avgTokensPerRequest: number
    successRate: number
    failureRate: number
  }
  timeseries: { date: string; requests: number; cost_usd: number; tokens: number }[]
  modelBreakdown: { model: string; requests: number; cost_usd: number; tokens: number }[]
  featureBreakdown: { feature: string; requests: number; cost_usd: number }[]
}

interface ActivityLog {
  id: string
  provider: string
  model: string
  feature: string
  service: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  latency_ms: number
  status_code: number
  is_byok: boolean
  created_at: string
}

export default function AISettingsPage() {
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken

  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<ProviderMetadata[]>([])
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([])
  const [settings, setSettings] = useState<AISettings>({
    default_provider: 'google',
    preferred_model: 'gemini/gemini-3.6-flash',
    reasoning_model: 'gemini/gemini-3.5-pro',
    fast_model: 'gemini/gemini-3.6-flash',
    vision_model: 'gemini/gemini-3.6-flash',
    temperature: 0.7,
    max_output_length: 2048,
    streaming_enabled: true,
    auto_fallback_enabled: true,
    daily_budget_usd: 0,
    monthly_budget_usd: 0,
    budget_warning_threshold_pct: 80,
    budget_hard_limit_enabled: false,
    budget_soft_limit_enabled: true,
  })
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({
    todaySpendUsd: 0, monthSpendUsd: 0, todayRequests: 0, monthRequests: 0,
  })


  // Selected Provider for Guided Wizard & Entry
  const [selectedProviderId, setSelectedProviderId] = useState<string>('google')
  const [inputKey, setInputKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    latencyMs?: number
    modelsCount?: number
    friendlyMessage?: string
    rawError?: string
  } | null>(null)

  // Analytics & Timeframe
  const [timeframe, setTimeframe] = useState<'1d' | '7d' | '30d' | '90d'>('30d')
  const [analytics, setAnalytics] = useState<AIAnalytics | null>(null)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [savingSettings, setSavingSettings] = useState(false)

  // Load initial BYOK data
  useEffect(() => {
    if (!token) return

    setLoading(true)
    Promise.all([
      apiClient<{ providers: ProviderMetadata[] }>('/api/byok/providers', { token }).catch(() => ({ providers: [] })),
      apiClient<{ keys: SavedKey[] }>('/api/byok/keys', { token }).catch(() => ({ keys: [] })),
      apiClient<{ settings: AISettings; usage: UsageSummary }>('/api/byok/settings', { token }).catch(() => null),
      apiClient<AIAnalytics>(`/api/ai/analytics?timeframe=${timeframe}`, { token }).catch(() => null),
      apiClient<{ logs: ActivityLog[] }>('/api/ai/logs?limit=15', { token }).catch(() => ({ logs: [] })),
    ]).then(([provData, keysData, settingsData, analyticsData, logsData]) => {
      setProviders(provData.providers || [])
      setSavedKeys(keysData.keys || [])
      if (settingsData) {
        setSettings(settingsData.settings)
        setUsageSummary(settingsData.usage)
        if (settingsData.settings.default_provider) {
          setSelectedProviderId(settingsData.settings.default_provider)
        }
      }
      if (analyticsData) setAnalytics(analyticsData)
      if (logsData) setLogs(logsData.logs || [])
      setLoading(false)
    })
  }, [token])

  // Refetch analytics when timeframe changes
  useEffect(() => {
    if (!token) return
    apiClient<AIAnalytics>(`/api/ai/analytics?timeframe=${timeframe}`, { token })
      .then(data => setAnalytics(data))
      .catch(() => {})
  }, [token, timeframe])

  const selectedProvider = providers.find(p => p.id === selectedProviderId) || providers[0]
  const currentSavedKey = savedKeys.find(k => k.provider === selectedProviderId)

  // Test Connection Handler
  const handleTestConnection = async () => {
    if (!token) return
    setTestingKey(true)
    setTestResult(null)
    try {
      const res = await apiClient<{
        ok: boolean
        latencyMs: number
        modelsCount: number
        friendlyMessage: string
        rawError?: string
      }>('/api/byok/test', {
        method: 'POST',
        token,
        body: JSON.stringify({
          provider: selectedProviderId,
          api_key: inputKey.trim() || undefined,
        }),
      })
      setTestResult(res)
      if (res.ok) {
        addToast({ variant: 'success', title: 'Connection Successful', description: res.friendlyMessage })
        // Refresh keys list
        const updatedKeys = await apiClient<{ keys: SavedKey[] }>('/api/byok/keys', { token }).catch(() => ({ keys: [] }))
        setSavedKeys(updatedKeys.keys || [])
      } else {
        addToast({ variant: 'error', title: 'Connection Test Failed', description: res.friendlyMessage })
      }
    } catch (err: any) {
      const msg = err.message || 'Connection test encountered an error.'
      setTestResult({ ok: false, friendlyMessage: msg, rawError: msg })
      addToast({ variant: 'error', title: 'Connection Failed', description: msg })
    } finally {
      setTestingKey(false)
    }
  }

  // Save Key Handler
  const handleSaveKey = async () => {
    if (!token || !inputKey.trim()) return
    setSavingKey(true)
    try {
      await apiClient('/api/byok/keys', {
        method: 'POST',
        token,
        body: JSON.stringify({
          provider: selectedProviderId,
          api_key: inputKey.trim(),
        }),
      })
      setInputKey('')
      addToast({
        variant: 'success',
        title: 'API Key Saved',
        description: `Your ${selectedProvider?.name || selectedProviderId} key has been encrypted and saved.`,
      })
      // Refresh saved keys & run test
      const updatedKeys = await apiClient<{ keys: SavedKey[] }>('/api/byok/keys', { token }).catch(() => ({ keys: [] }))
      setSavedKeys(updatedKeys.keys || [])
      handleTestConnection()
    } catch {
      addToast({ variant: 'error', title: 'Save Failed', description: 'Could not encrypt and save API key.' })
    } finally {
      setSavingKey(false)
    }
  }

  // Delete Key Handler
  const handleDeleteKey = async (providerId: string) => {
    if (!token || !confirm(`Remove saved API key for ${providerId}? Zuri will fall back to default AI services.`)) return
    try {
      await apiClient(`/api/byok/keys/${providerId}`, { method: 'DELETE', token })
      setSavedKeys(prev => prev.filter(k => k.provider !== providerId))
      setTestResult(null)
      addToast({ variant: 'success', title: 'Key Removed', description: `Removed ${providerId} key.` })
    } catch {
      addToast({ variant: 'error', title: 'Error removing key' })
    }
  }

  // Save AI Settings Handler
  const handleSaveSettings = async () => {
    if (!token) return
    setSavingSettings(true)
    try {
      await apiClient('/api/byok/settings', {
        method: 'PUT',
        token,
        body: JSON.stringify(settings),
      })
      addToast({ variant: 'success', title: 'AI Preferences Saved', description: 'Your default AI model and parameters were updated.' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save preferences' })
    } finally {
      setSavingSettings(false)
    }
  }

  // Handle Paste from Clipboard
  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setInputKey(text.trim())
        addToast({ variant: 'info', title: 'Key Pasted', description: 'Pasted key from clipboard.' })
      }
    } catch {
      addToast({ variant: 'warning', title: 'Clipboard Access', description: 'Please paste using Ctrl+V or Cmd+V.' })
    }
  }

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Page Header */}
      <PageHeader
        title="Bring Your Own AI (BYOK)"
        description="Connect your personal or enterprise AI account. Complete control over models, costs, and data privacy."
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              BYOK Router Active
            </span>
            <Link
              href="/settings"
              className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              Back to Settings
            </Link>
          </div>
        }
      />

      {/* ── SECTION 1: OVERVIEW & ARCHITECTURE ────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 rounded-2xl p-6 md:p-8 text-white shadow-xl overflow-hidden border border-indigo-800/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              What is Bring Your Own AI?
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Use Zuri with your own AI API keys — zero markup, full privacy.
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Zuri can operate directly using your own AI provider accounts (Google Gemini, OpenAI, Anthropic Claude). Your conversations, CRM intelligence, document creation, and automated agents will use your API key, giving you uncapped rate limits, custom budgets, and complete ownership of your data.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center">
                <ShieldCheck className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-white">Encrypted Keys</p>
                <p className="text-[10px] text-slate-400">AES-256-GCM</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center">
                <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-white">Direct Billing</p>
                <p className="text-[10px] text-slate-400">No Zuri markup</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center">
                <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-white">Uncapped Speed</p>
                <p className="text-[10px] text-slate-400">Your tier limits</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center">
                <Building className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-white">Org Priority</p>
                <p className="text-[10px] text-slate-400">Team key support</p>
              </div>
            </div>
          </div>

          {/* Interactive Illustration Diagram */}
          <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Architectural Flow</p>
            <div className="flex flex-col items-center gap-3">
              <div className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-3 rounded-xl shadow-md text-center flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold">Zuri Intelligence Engine</span>
              </div>
              <div className="flex flex-col items-center text-slate-400 my-0">
                <div className="w-0.5 h-4 bg-indigo-500/50" />
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded-full border border-indigo-800">AES-256 Decrypted Request</span>
                <div className="w-0.5 h-4 bg-indigo-500/50" />
              </div>
              <div className="w-full bg-slate-800 border border-indigo-500/30 p-3 rounded-xl text-center flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Your AI Provider</span>
                </div>
                <Badge variant="purple">
                  {selectedProvider?.name || 'Selected Provider'}
                </Badge>

              </div>
              <div className="flex flex-col items-center text-slate-400 my-0">
                <div className="w-0.5 h-4 bg-indigo-500/50" />
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded-full border border-indigo-800">Smart Responses & CRM Updates</span>
                <div className="w-0.5 h-4 bg-indigo-500/50" />
              </div>
              <div className="w-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 p-2.5 rounded-xl text-center text-xs font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Executed in &lt; 500ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: CHOOSE PROVIDER CARDS ────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">1. Select AI Provider</h3>
          <p className="text-sm text-slate-500">Choose your preferred AI infrastructure provider to configure below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {providers.map(p => {
            const isSelected = p.id === selectedProviderId
            const isSaved = savedKeys.some(k => k.provider === p.id && k.status === 'healthy')

            return (
              <div
                key={p.id}
                onClick={() => { setSelectedProviderId(p.id); setTestResult(null) }}
                className={`relative rounded-2xl p-5 border cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-50/40 border-indigo-600 ring-2 ring-indigo-600/20 shadow-indigo-100'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {p.is_recommended && (
                  <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500 text-white shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Recommended
                  </span>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${
                        p.id === 'google' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                        p.id === 'openai' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        p.id === 'anthropic' ? 'bg-orange-50 text-orange-600 border border-orange-200' :
                        'bg-purple-50 text-purple-600 border border-purple-200'
                      }`}>
                        {p.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
                        <p className="text-[11px] text-slate-500">{p.company}</p>
                      </div>
                    </div>
                    {isSaved && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                        <Check className="w-3 h-3" /> Connected
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{p.description}</p>

                  <div className="space-y-1.5 pt-1">
                    {p.strengths.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Est. Pricing</span>
                    <span className="font-semibold text-slate-800">{p.estimated_pricing}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Setup</span>
                    <span className="font-semibold text-indigo-600">{p.difficulty}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── SECTION 3: GUIDED SETUP WIZARD & KEY ENTRY ─────────────────────────── */}
      {selectedProvider && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">2</span>
                <h3 className="text-base font-bold text-slate-900">Guided Setup: {selectedProvider.name}</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">Follow these simple 5 steps to copy your API key from {selectedProvider.company}. No developer setup required.</p>
            </div>

            <a
              href={selectedProvider.console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-xl shadow-sm transition-all shrink-0"
            >
              Open {selectedProvider.name} Dashboard <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Setup Steps Visual Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {selectedProvider.setup_steps.map(s => (
              <div key={s.step} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5 relative">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {s.step}
                </div>
                <p className="text-xs font-bold text-slate-900">{s.title}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{s.description}</p>
              </div>
            ))}
          </div>

          {/* Key Input & Action Buttons */}
          <div className="space-y-4 pt-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Paste Your {selectedProvider.name} API Key
            </label>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={currentSavedKey ? `Saved: ${currentSavedKey.key_hint}` : `Paste your ${selectedProvider.name} secret key here...`}
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none pr-24 transition-all"
                />
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePasteKey}
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors text-xs font-semibold flex items-center gap-1 px-2"
                    title="Paste from clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" /> Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={!inputKey.trim() || savingKey}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {savingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Save Key
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingKey}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {testingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  Test Connection
                </button>

                {currentSavedKey && (
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(selectedProviderId)}
                    className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-all shrink-0"
                    title="Remove Saved Key"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Test Connection Diagnostic Result Banner */}
            {testResult && (
              <div className={`p-4 rounded-xl border text-xs leading-relaxed transition-all animate-fadeIn ${
                testResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold text-sm">
                      {testResult.ok ? 'Connection Validated' : 'Connection Guidance'}
                    </p>
                    <p>{testResult.friendlyMessage}</p>
                    {testResult.latencyMs && (
                      <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-600 pt-1">
                        <span>Latency: {testResult.latencyMs}ms</span>
                        <span>Available Models: {testResult.modelsCount || 'Multiple'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 4: AI CONFIGURATION & MODEL DEFAULTS ────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-bold text-slate-900">3. AI Configuration & Model Selection</h3>
          <p className="text-xs text-slate-500 mt-1">Configure default providers, reasoning engines, and fallback behavior across Zuri.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Default AI Provider</label>
            <select
              value={settings.default_provider}
              onChange={e => setSettings({ ...settings, default_provider: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="google">Google Gemini (Recommended)</option>
              <option value="openai">OpenAI (GPT-5 / GPT-4o)</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="qwen">Alibaba Qwen</option>
              <option value="openrouter">OpenRouter Gateway</option>
              <option value="groq">Groq LPU</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Preferred General Model</label>
            <select
              value={settings.preferred_model}
              onChange={e => setSettings({ ...settings, preferred_model: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <optgroup label="Google Gemini">
                {GEMINI_MODELS.map(m => (
                  <option key={m.id} value={`gemini/${m.id}`}>
                    {m.name} {m.recommended ? '(Recommended)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="OpenAI">
                {OPENAI_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.recommended ? '(Recommended)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Anthropic">
                {CLAUDE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.recommended ? '(Recommended)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Alibaba Qwen">
                {QWEN_MODELS.map(m => (
                  <option key={m.id} value={`dashscope/${m.id}`}>
                    {m.name} {m.recommended ? '(Recommended)' : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Reasoning & Negotiation Model</label>
            <select
              value={settings.reasoning_model}
              onChange={e => setSettings({ ...settings, reasoning_model: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="gemini/gemini-3.5-pro">Gemini 3.5 Pro (Deep Reasoning)</option>
              <option value="gemini/gemini-3-deep-think">Gemini 3 Deep Think</option>
              <option value="gpt-5.6">GPT-5.6 (Sol)</option>
              <option value="o4">o4 Reasoning</option>
              <option value="o3">o3 Reasoning</option>
              <option value="claude-opus-5">Claude Opus 5</option>
              <option value="dashscope/qwen-3.8-max">Qwen 3.8 Max</option>
            </select>
          </div>


          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Temperature (Creativity Level): {settings.temperature}</label>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={settings.temperature}
              onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>0.0 — Precise & Factual</span>
              <span>0.7 — Balanced</span>
              <span>1.5 — Creative & Warm</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.streaming_enabled}
                onChange={e => setSettings({ ...settings, streaming_enabled: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              Enable Real-time Response Streaming
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.auto_fallback_enabled}
                onChange={e => setSettings({ ...settings, auto_fallback_enabled: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              Enable Automatic Failover to Zuri System Pool
            </label>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
          >
            {savingSettings ? 'Saving...' : 'Save AI Preferences'}
          </button>
        </div>
      </div>

      {/* ── SECTION 5: USAGE DASHBOARD & COST MANAGEMENT ────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">4. Usage & Cost Analytics</h3>
            <p className="text-sm text-slate-500">Track requests, token consumption, and estimated spend across all features.</p>
          </div>

          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
            {(['1d', '7d', '30d', '90d'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  timeframe === tf ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
                }`}
              >
                {tf === '1d' ? 'Today' : tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Analytics Stat Cards */}
        {analytics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Requests</span>
              <p className="text-2xl font-black text-slate-900">{analytics.metrics.totalRequests.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500">Avg {analytics.metrics.avgTokensPerRequest} tokens / req</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tokens Consumed</span>
              <p className="text-2xl font-black text-indigo-600">{analytics.metrics.totalTokens.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500">{analytics.metrics.promptTokens.toLocaleString()} in / {analytics.metrics.completionTokens.toLocaleString()} out</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estimated Spend</span>
              <p className="text-2xl font-black text-emerald-600">${analytics.metrics.estimatedCostUsd.toFixed(4)}</p>
              <p className="text-[11px] text-slate-500">Direct provider rates</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Success Rate</span>
              <p className="text-2xl font-black text-slate-900">{analytics.metrics.successRate}%</p>
              <p className="text-[11px] text-slate-500">Avg response {analytics.metrics.avgLatencyMs}ms</p>
            </div>
          </div>
        )}

        {/* Spending Limits Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Cost Control & Budget Limits</h4>
              <p className="text-xs text-slate-500">Set daily and monthly spending controls to prevent unexpected costs.</p>
            </div>
            <Badge variant="info">Spend Safety Active</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Daily Budget Limit ($USD)</label>
              <input
                type="number"
                step="0.5"
                placeholder="0.00 (Unlimited)"
                value={settings.daily_budget_usd || ''}
                onChange={e => setSettings({ ...settings, daily_budget_usd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900"
              />
              <p className="text-[10px] text-slate-400">Today's Spend: ${usageSummary.todaySpendUsd.toFixed(4)}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Monthly Budget Limit ($USD)</label>
              <input
                type="number"
                step="5"
                placeholder="0.00 (Unlimited)"
                value={settings.monthly_budget_usd || ''}
                onChange={e => setSettings({ ...settings, monthly_budget_usd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900"
              />
              <p className="text-[10px] text-slate-400">This Month's Spend: ${usageSummary.monthSpendUsd.toFixed(4)}</p>
            </div>
          </div>

          {/* Budget Progress Meter */}
          {settings.monthly_budget_usd > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-600">Monthly Budget Progress</span>
                <span className="text-slate-900 font-bold">
                  ${usageSummary.monthSpendUsd.toFixed(2)} / ${settings.monthly_budget_usd.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (usageSummary.monthSpendUsd / settings.monthly_budget_usd) >= 0.9 ? 'bg-red-500' :
                    (usageSummary.monthSpendUsd / settings.monthly_budget_usd) >= 0.75 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min((usageSummary.monthSpendUsd / settings.monthly_budget_usd) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 6: ACTIVITY LOG TABLE ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">AI Request Activity Log</h3>
            <p className="text-xs text-slate-500">Metadata-only audit log of recent AI completions across Zuri features.</p>
          </div>
          <Badge variant="purple">Zero Content Logged</Badge>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Provider & Model</th>
                <th className="px-6 py-3">Feature</th>
                <th className="px-6 py-3">Tokens</th>
                <th className="px-6 py-3">Latency</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No recent AI requests logged.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 text-slate-500 font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span className="capitalize text-indigo-600 font-bold">{log.provider}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 text-[11px] font-mono">{log.model.split('/').pop()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 capitalize">{log.feature.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-600">
                      {log.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-600">
                      {log.latency_ms || 340}ms
                    </td>
                    <td className="px-6 py-3">
                      {log.status_code < 400 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                          200 OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                          {log.status_code} Err
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
