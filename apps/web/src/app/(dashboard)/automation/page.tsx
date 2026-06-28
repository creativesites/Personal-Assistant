'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Badge, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'

interface Rule {
  id: string
  name: string
  type: string
  description: string
  enabled: boolean
  triggerCount: number
  lastTriggeredAt: string | null
  conditions: Record<string, unknown>
  actions: Record<string, unknown>
}

const RULE_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  follow_up_reminder:    { icon: '🔔', label: 'Follow-up',    color: 'bg-indigo-100 text-indigo-700' },
  relationship_alert:    { icon: '⚠️', label: 'Health alert', color: 'bg-amber-100 text-amber-700' },
  lead_nurture:          { icon: '🔥', label: 'Lead nurture', color: 'bg-orange-100 text-orange-700' },
  auto_reply:            { icon: '⚡', label: 'Auto reply',   color: 'bg-green-100 text-green-700' },
  birthday_reminder:     { icon: '🎂', label: 'Birthday',     color: 'bg-pink-100 text-pink-700' },
  dormant_contact:       { icon: '💤', label: 'Re-engage',    color: 'bg-purple-100 text-purple-700' },
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        enabled ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const PLACEHOLDER_RULES: Rule[] = [
  {
    id: '1',
    name: 'Follow up after 7 days',
    type: 'follow_up_reminder',
    description: 'Remind me to follow up when a conversation goes quiet for 7 days.',
    enabled: true,
    triggerCount: 12,
    lastTriggeredAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    conditions: { daysSinceLastMessage: 7 },
    actions: { notify: true },
  },
  {
    id: '2',
    name: 'Health score alert',
    type: 'relationship_alert',
    description: 'Alert me when a contact\'s health score drops below 40.',
    enabled: true,
    triggerCount: 3,
    lastTriggeredAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    conditions: { healthScoreBelow: 40 },
    actions: { notify: true, addToProactive: true },
  },
  {
    id: '3',
    name: 'Hot lead detected',
    type: 'lead_nurture',
    description: 'Notify me when a contact\'s lead score exceeds 70.',
    enabled: false,
    triggerCount: 1,
    lastTriggeredAt: null,
    conditions: { leadScoreAbove: 70 },
    actions: { notify: true },
  },
  {
    id: '4',
    name: 'Re-engage dormant contacts',
    type: 'dormant_contact',
    description: 'Add to proactive queue when a contact hasn\'t been messaged in 30 days.',
    enabled: true,
    triggerCount: 8,
    lastTriggeredAt: new Date(Date.now() - 86400000).toISOString(),
    conditions: { daysSinceLastInteraction: 30 },
    actions: { addToProactive: true },
  },
]

export default function AutomationPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const { data, loading } = useApi<{ rules: Rule[] }>('/api/automation/rules', token)
  const [localRules, setLocalRules] = useState<Rule[] | null>(null)
  const [showNewRuleHint, setShowNewRuleHint] = useState(false)

  const rules = localRules ?? (data?.rules && data.rules.length > 0 ? data.rules : PLACEHOLDER_RULES)

  const enabledCount = rules.filter(r => r.enabled).length

  const toggleRule = (id: string) => {
    const base = localRules ?? rules
    setLocalRules(base.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Automation" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 max-w-2xl mx-auto w-full">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Automation"
        description={`${enabledCount} rule${enabledCount !== 1 ? 's' : ''} active`}
        action={
          <button
            onClick={() => setShowNewRuleHint(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New rule
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-3">

          {showNewRuleHint && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-2xl">✨</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-900">Custom rules coming soon</p>
                <p className="text-xs text-indigo-700 mt-1">Full rule builder with custom triggers, conditions, and actions is part of the Pro plan. Default rules below apply to all users.</p>
              </div>
              <button onClick={() => setShowNewRuleHint(false)} className="text-indigo-400 hover:text-indigo-600 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xl font-bold text-gray-900 tabular-nums">{rules.length}</p>
              <p className="text-xs text-gray-500 mt-1">Total rules</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xl font-bold text-indigo-600 tabular-nums">{enabledCount}</p>
              <p className="text-xs text-gray-500 mt-1">Active</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {rules.reduce((s, r) => s + r.triggerCount, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total fires</p>
            </div>
          </div>

          {/* Rules list */}
          {rules.length === 0 ? (
            <EmptyState
              icon="⚡"
              title="No automation rules"
              description="Rules will appear here once your workspace is configured."
            />
          ) : (
            rules.map(rule => {
              const config = RULE_TYPE_CONFIG[rule.type] ?? { icon: '⚙️', label: rule.type, color: 'bg-gray-100 text-gray-700' }
              return (
                <div
                  key={rule.id}
                  className={`bg-white rounded-xl border transition-all ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl ${rule.enabled ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                        {config.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                          <Toggle enabled={rule.enabled} onChange={() => toggleRule(rule.id)} />
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{rule.description}</p>
                      </div>
                    </div>

                    {(rule.triggerCount > 0 || rule.lastTriggeredAt) && (
                      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          Fired <span className="font-medium text-gray-600">{rule.triggerCount}×</span>
                        </span>
                        {rule.lastTriggeredAt && (
                          <span className="text-xs text-gray-400">
                            Last: {timeAgo(rule.lastTriggeredAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}

          <p className="text-xs text-gray-400 text-center pb-2">
            Rules run automatically in the background. Zuri processes conditions every 15 minutes.
          </p>
        </div>
      </div>
    </div>
  )
}
