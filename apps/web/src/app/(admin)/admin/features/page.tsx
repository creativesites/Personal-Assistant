'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface FeatureFlags {
  temporal_engine: boolean
  world_knowledge_engine: boolean
  ai_drafts: boolean
  personal_mode: boolean
  hybrid_mode: boolean
  proactive_nudges: boolean
  ai_advisor: boolean
  calendar_intelligence: boolean
  [key: string]: boolean
}

interface FeaturesResponse {
  flags: FeatureFlags
}

const FLAG_META: Record<string, { label: string; description: string; category: string }> = {
  ai_drafts: { label: 'AI Reply Drafts', description: 'Generate voice-matched reply suggestions for incoming messages', category: 'Core AI' },
  temporal_engine: { label: 'Temporal Engine', description: 'Relationship clocks, cadence tracking, and overdue alerts', category: 'Core AI' },
  world_knowledge_engine: { label: 'World Knowledge Engine', description: 'Web search integration for real-time context enrichment', category: 'Core AI' },
  ai_advisor: { label: 'AI Advisor', description: 'Conversational AI assistant for relationship strategy queries', category: 'Core AI' },
  calendar_intelligence: { label: 'Calendar Intelligence', description: 'AI-extracted events from message context and proactive scheduling', category: 'Core AI' },
  proactive_nudges: { label: 'Proactive Nudges', description: 'Surface relationship maintenance opportunities and action queue', category: 'Features' },
  personal_mode: { label: 'Personal Mode', description: 'Allow users to select personal use mode during onboarding', category: 'Modes' },
  hybrid_mode: { label: 'Hybrid Mode', description: 'Allow users to select hybrid (personal + business) mode', category: 'Modes' },
}

export default function AdminFeaturesPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<FeaturesResponse>('/api/admin/features', token)
  const [saving, setSaving] = useState(false)
  const [localFlags, setLocalFlags] = useState<FeatureFlags | null>(null)
  const [saved, setSaved] = useState(false)

  const flags = localFlags ?? data?.flags ?? ({} as FeatureFlags)

  const toggle = (key: string) => {
    const base = data?.flags ?? ({} as FeatureFlags)
    setLocalFlags({ ...(localFlags ?? base), [key]: !flags[key] })
    setSaved(false)
  }

  const save = async () => {
    if (!token || !localFlags) return
    setSaving(true)
    try {
      await apiClient('/api/admin/features', { method: 'PUT', token, body: JSON.stringify(localFlags) })
      await refetch()
      setLocalFlags(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = localFlags !== null

  const categories = [...new Set(Object.values(FLAG_META).map((m) => m.category))]

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Feature Flags</h1>
          <p className="text-gray-500 text-sm">Toggle platform capabilities for all users</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-400 font-medium">Saved</span>}
          {hasChanges && (
            <button
              onClick={() => { setLocalFlags(null); setSaved(false) }}
              className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Discard
            </button>
          )}
          <button
            disabled={!hasChanges || saving}
            onClick={save}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-16 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => {
            const categoryFlags = Object.entries(FLAG_META).filter(([, m]) => m.category === category)
            return (
              <div key={category} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{category}</p>
                </div>
                <div className="divide-y divide-gray-800">
                  {categoryFlags.map(([key, meta]) => {
                    const enabled = flags[key] ?? false
                    const changed = localFlags !== null && data?.flags?.[key] !== localFlags[key]
                    return (
                      <div key={key} className="px-5 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-white text-sm font-medium">{meta.label}</p>
                            {changed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 border border-indigo-800 font-semibold">CHANGED</span>}
                          </div>
                          <p className="text-gray-500 text-xs">{meta.description}</p>
                        </div>
                        <button
                          onClick={() => toggle(key)}
                          className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
                          role="switch"
                          aria-checked={enabled}
                        >
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Unknown flags from DB */}
          {Object.keys(flags).filter((k) => !FLAG_META[k]).length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-800">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Other</p>
              </div>
              <div className="divide-y divide-gray-800">
                {Object.keys(flags).filter((k) => !FLAG_META[k]).map((key) => (
                  <div key={key} className="px-5 py-4 flex items-center justify-between gap-4">
                    <p className="text-white text-sm font-mono">{key}</p>
                    <button
                      onClick={() => toggle(key)}
                      className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${flags[key] ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${flags[key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
