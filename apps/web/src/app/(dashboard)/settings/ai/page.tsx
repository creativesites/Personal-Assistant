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
  Building, ChevronRight, Sliders, AlertCircle, Info, RefreshCw as RotateCcw,
  XCircle, ShieldAlert
} from 'lucide-react'

const OPENAI_MODELS = [
  { id: "gpt-5.6", name: "GPT-5.6 (Sol)", recommended: true },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "o4", name: "o4" },
  { id: "o4-mini", name: "o4 Mini" },
  { id: "o3", name: "o3" }
]

const GEMINI_MODELS = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", recommended: true },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "gemini-3-deep-think", name: "Gemini 3 Deep Think" },
  { id: "gemini-flash-cyber", name: "Gemini Flash Cyber" }
]

const CLAUDE_MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5", recommended: true },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-haiku-5", name: "Claude Haiku 5" }
]

const QWEN_MODELS = [
  { id: "qwen-3.8-max", name: "Qwen 3.8 Max", recommended: true },
  { id: "qwen-3.8", name: "Qwen 3.8" },
  { id: "qwen-3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen-3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "qwen-3.5", name: "Qwen 3.5" },
  { id: "qwen2.5-coder", name: "Qwen2.5 Coder" },
  { id: "qwen2.5-vl", name: "Qwen2.5 VL" },
  { id: "qwen2.5-math", name: "Qwen2.5 Math" }
]

// Plain-English AI Error Diagnostic Helper
function explainAiError(errMsg?: string | null, statusCode?: number): { title: string; explanation: string; solution: string } {
  if (!errMsg && (!statusCode || statusCode < 400)) {
    return {
      title: 'AI Service Operating Normally',
      explanation: 'No operational errors detected.',
      solution: 'All AI requests are routing successfully.',
    }
  }

  const str = (errMsg || '').toLowerCase()

  if (statusCode === 401 || str.includes('401') || str.includes('invalid_api_key') || str.includes('unauthorized') || str.includes('api key not valid')) {
    return {
      title: 'Invalid API Key',
      explanation: 'Your API key was rejected by the provider as invalid or expired.',
      solution: 'Copy your secret API key directly from your provider console without extra spaces and re-save it.',
    }
  }

  if (statusCode === 402 || str.includes('402') || str.includes('quota') || str.includes('insufficient_quota') || str.includes('billing') || str.includes('credit')) {
    return {
      title: 'Provider Account Out of Credits / Unpaid Balance',
      explanation: 'Your provider account has no remaining credit balance or has unpaid invoices.',
      solution: 'Log into your provider console (e.g. Google Cloud / OpenAI Billing) and add credits or check payment methods.',
    }
  }

  if (statusCode === 429 || str.includes('429') || str.includes('rate_limit') || str.includes('too many requests')) {
    return {
      title: 'Rate Limit Exceeded (RPM / TPM)',
      explanation: 'Your provider tier reached its maximum allowed requests per minute.',
      solution: 'Upgrade your billing tier on your provider account, or enable Zuri Auto-Failover to system backup models.',
    }
  }

  if (str.includes('model_not_found') || str.includes('not found') || str.includes('permission_denied') || str.includes('does not exist')) {
    return {
      title: 'Selected Model Unavailable on Your Account',
      explanation: 'Your API key does not have permission to access the selected AI model.',
      solution: 'Select a widely accessible model like Gemini 3.6 Flash or GPT-4o Mini in your AI settings below.',
    }
  }

  if (statusCode === 500 || statusCode === 503 || str.includes('500') || str.includes('503') || str.includes('overloaded') || str.includes('unavailable')) {
    return {
      title: 'Temporary Provider Outage',
      explanation: 'The AI provider is experiencing temporary server instability or high load.',
      solution: 'Zuri will automatically failover to system backup models. No action needed on your API key.',
    }
  }

  return {
    title: 'AI Request Issue',
    explanation: errMsg || `Request failed with status code ${statusCode || 'unknown'}.`,
    solution: 'Test your key connection or check your network status. Zuri will fall back to default system AI pool if needed.',
  }
}

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
  error_message?: string
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
    reasoning_model: 'gemini/gemini-3.6-flash',
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

  // Detect keys with active errors
  const erroredKeys = savedKeys.filter(k => k.status === 'invalid' || k.status === 'quota_exceeded' || k.last_error_message)
  const failedLogs = logs.filter(l => l.status_code >= 400)

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
              Zuri operates directly using your own AI provider accounts (Google Gemini, OpenAI, Anthropic Claude). Your conversations, CRM intelligence, document creation, and automated agents will use your API key, giving you uncapped rate limits, custom budgets, and complete ownership of your data.
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

          <div className="lg:col-span-5 bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-indigo-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" /> Real-time System Failover Safety
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              If your API key runs out of quota or encounters a temporary rate limit, Zuri automatically routes requests through backup system keys so your conversations and workspace operations are never interrupted.
            </p>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] font-mono space-y-1.5 text-slate-300">
              <div className="flex items-center justify-between">
                <span>1. User Key Request</span>
                <span className="text-emerald-400 font-bold">Attempting</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>2. Fallback Router</span>
                <span className="text-amber-400">System Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 1.5: AI HEALTH & ERROR DIAGNOSTICS BANNER ─────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">AI Health & Diagnostics</h3>
          </div>
          {erroredKeys.length > 0 || failedLogs.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Action Required ({erroredKeys.length + failedLogs.length} issues)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> All AI Services Operational
            </span>
          )}
        </div>

        {/* Display Plain-English Error Banners if Keys or Logs Have Errors */}
        {erroredKeys.length > 0 ? (
          <div className="space-y-3">
            {erroredKeys.map((key) => {
              const diag = explainAiError(key.last_error_message, key.status === 'quota_exceeded' ? 402 : 401)
              return (
                <div key={key.id} className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-950 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-red-950 uppercase">{key.provider} Key Error</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-200 text-red-900 font-bold">{key.key_hint}</span>
                        </div>
                        <p className="text-xs font-bold text-red-900">{diag.title}: {diag.explanation}</p>
                        <p className="text-xs text-red-800 font-medium">💡 <strong>Solution:</strong> {diag.solution}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderId(key.provider)
                        window.scrollTo({ top: 500, behavior: 'smooth' })
                      }}
                      className="px-3 py-1.5 bg-red-900 text-white font-bold text-xs rounded-xl hover:bg-red-800 transition-all shrink-0"
                    >
                      Fix {key.provider} Key
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 text-emerald-950 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Your API keys and fallback models are operating cleanly with zero authentication or quota errors.</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-700">Healthy</span>
          </div>
        )}
      </div>

      {/* ── SECTION 2: PROVIDER SELECTION ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">1. Select AI Provider</h3>
          <p className="text-xs text-slate-500">Choose the AI ecosystem you wish to configure or test.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {providers.map((p) => {
            const isSelected = selectedProviderId === p.id
            const keyInfo = savedKeys.find(k => k.provider === p.id)
            const hasError = keyInfo && (keyInfo.status === 'invalid' || keyInfo.status === 'quota_exceeded' || keyInfo.last_error_message)

            return (
              <div
                key={p.id}
                onClick={() => setSelectedProviderId(p.id)}
                className={`cursor-pointer rounded-2xl border p-5 transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 bg-white shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-extrabold text-sm text-slate-900">{p.name}</h4>
                    {keyInfo ? (
                      hasError ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                          <AlertTriangle className="w-3 h-3" /> Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Not Set
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-snug line-clamp-2">{p.description}</p>
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
              <p className="text-xs text-slate-500 mt-1">Follow these simple steps to copy your API key from {selectedProvider.company}. No developer setup required.</p>
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
                  <div className="space-y-1.5 w-full">
                    <p className="font-bold text-sm">
                      {testResult.ok ? 'Connection Validated' : 'Connection Error Diagnostic'}
                    </p>

                    {/* Plain-English Explanation */}
                    {(() => {
                      const diag = explainAiError(testResult.friendlyMessage || testResult.rawError)
                      return (
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800">{diag.title}: {diag.explanation}</p>
                          <p className="text-xs font-semibold text-slate-700">💡 <strong>Solution:</strong> {diag.solution}</p>
                        </div>
                      )
                    })()}

                    {testResult.rawError && (
                      <div className="mt-2">
                        <span className="text-[10px] text-amber-800/80 font-bold block uppercase tracking-wider mb-1">Raw Provider Error Response</span>
                        <pre className="font-mono text-[10px] bg-red-950/10 border border-red-500/10 text-red-950 p-2 rounded-lg max-h-32 overflow-y-auto break-all whitespace-pre-wrap">
                          {testResult.rawError}
                        </pre>
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
              <option value="gemini/gemini-3.6-flash">Gemini 3.6 Flash (Recommended)</option>
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

      {/* ── SECTION 5: ACTIVITY LOG & DIAGNOSTICS TABLE ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">AI Request Activity & Error Log</h3>
            <p className="text-xs text-slate-500">Real-time completion audit log with plain-English error explanations.</p>
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
                <th className="px-6 py-3">Status & Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No recent AI requests logged.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isErr = log.status_code >= 400
                  const diag = explainAiError(log.error_message, log.status_code)

                  return (
                    <tr key={log.id} className={`hover:bg-slate-50/50 transition-colors ${isErr ? 'bg-red-50/30' : ''}`}>
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
                      <td className="px-6 py-3">
                        {!isErr ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                            200 OK
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                              <AlertTriangle className="w-3 h-3" /> {log.status_code} Error
                            </span>
                            <p className="text-[11px] font-bold text-red-900">{diag.title}: {diag.explanation}</p>
                            <p className="text-[10px] text-red-800">💡 {diag.solution}</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
