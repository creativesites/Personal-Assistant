'use client'

import { useState, useCallback, useEffect } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Badge, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  agentType: string
  roleTitle: string | null
  avatarEmoji: string
  description: string | null
  trustLevel: string
  isActive: boolean
  isDefault: boolean
  assignmentCount: number
  messagesToday: number
  messagesThisWeek: number
  escalationsThisWeek: number
  createdAt: string
}

interface Escalation {
  id: string
  conversationId: string
  contactId: string | null
  contactName: string | null
  agentName: string
  reason: string
  contextSummary: string | null
  urgency: string
  status: string
  createdAt: string
}

interface Rule {
  id: string
  name: string
  type: string
  description: string
  enabled: boolean
  triggerCount: number
  lastTriggeredAt: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRUST_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  observe:    { label: 'Observer',   color: 'bg-gray-100 text-gray-600',   desc: 'Watches conversations only' },
  suggest:    { label: 'Suggester',  color: 'bg-blue-100 text-blue-700',   desc: 'Drafts replies for approval' },
  assisted:   { label: 'Assisted',   color: 'bg-cyan-100 text-cyan-700',   desc: 'Sends with 1-tap approval' },
  delegated:  { label: 'Delegated',  color: 'bg-amber-100 text-amber-700', desc: 'Auto-sends, you review after' },
  autonomous: { label: 'Autonomous', color: 'bg-green-100 text-green-700', desc: 'Fully autonomous replies' },
}

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700' },
  normal:   { label: 'Normal',   color: 'bg-gray-100 text-gray-600' },
}

const REASON_LABELS: Record<string, string> = {
  frustration:            'Customer frustrated',
  explicit_request:       'Requested human',
  out_of_scope:           'Out of scope',
}

const RULE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  follow_up_reminder: { icon: '🔔', label: 'Follow-up',    color: 'bg-indigo-100 text-indigo-700' },
  relationship_alert: { icon: '⚠️', label: 'Health alert', color: 'bg-amber-100 text-amber-700' },
  lead_nurture:       { icon: '🔥', label: 'Lead nurture', color: 'bg-orange-100 text-orange-700' },
  auto_reply:         { icon: '⚡', label: 'Auto reply',   color: 'bg-green-100 text-green-700' },
  birthday_reminder:  { icon: '🎂', label: 'Birthday',     color: 'bg-pink-100 text-pink-700' },
  dormant_contact:    { icon: '💤', label: 'Re-engage',    color: 'bg-purple-100 text-purple-700' },
}

const AGENT_TEMPLATES = [
  { emoji: '🏆', name: 'Sales Agent',           type: 'sales',             roleTitle: 'Sales Representative',  tone: 'persuasive',    desc: 'Qualifies leads, handles objections, and closes deals.' },
  { emoji: '💬', name: 'Support Agent',          type: 'support',           roleTitle: 'Customer Support',      tone: 'empathetic',    desc: 'Resolves customer issues and answers product questions.' },
  { emoji: '🎯', name: 'Receptionist',           type: 'custom',            roleTitle: 'Virtual Receptionist',  tone: 'friendly',      desc: 'Greets visitors, answers FAQs, and routes enquiries.' },
  { emoji: '📅', name: 'Appointment Scheduler', type: 'custom',            roleTitle: 'Booking Coordinator',   tone: 'professional',  desc: 'Books and confirms appointments via conversation.' },
  { emoji: '🔍', name: 'Lead Qualifier',         type: 'sales',             roleTitle: 'Lead Qualifier',        tone: 'consultative',  desc: 'Asks qualifying questions and scores inbound leads.' },
  { emoji: '🌐', name: 'Community Manager',      type: 'community_manager', roleTitle: 'Community Manager',     tone: 'casual',        desc: 'Engages community members and monitors sentiment.' },
  { emoji: '📦', name: 'Order Tracker',          type: 'support',           roleTitle: 'Order Support',         tone: 'helpful',       desc: 'Provides shipping updates and handles order enquiries.' },
  { emoji: '💎', name: 'VIP Concierge',          type: 'custom',            roleTitle: 'VIP Concierge',         tone: 'luxury',        desc: 'Premium experience for high-value clients.' },
  { emoji: '🤖', name: 'Custom Agent',           type: 'custom',            roleTitle: 'Custom Agent',          tone: 'professional',  desc: 'Start from scratch with your own instructions.' },
]

const PLACEHOLDER_RULES: Rule[] = [
  { id: '1', name: 'Follow up after 7 days',    type: 'follow_up_reminder', description: "Remind me to follow up when a conversation goes quiet for 7 days.", enabled: true,  triggerCount: 12, lastTriggeredAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '2', name: 'Health score alert',         type: 'relationship_alert', description: "Alert me when a contact's health score drops below 40.",            enabled: true,  triggerCount: 3,  lastTriggeredAt: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: '3', name: 'Hot lead detected',          type: 'lead_nurture',       description: "Notify me when a contact's lead score exceeds 70.",                enabled: false, triggerCount: 1,  lastTriggeredAt: null },
  { id: '4', name: 'Re-engage dormant contacts', type: 'dormant_contact',    description: "Add to proactive queue when a contact hasn't been messaged in 30 days.", enabled: true, triggerCount: 8, lastTriggeredAt: new Date(Date.now() - 86400000).toISOString() },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

function AgentCard({ agent, onToggle, onEdit }: { agent: Agent; onToggle: () => void; onEdit: () => void }) {
  const trust = TRUST_CONFIG[agent.trustLevel] ?? TRUST_CONFIG.suggest
  return (
    <div className={`bg-white rounded-xl border transition-all ${agent.isActive ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${agent.isActive ? 'bg-indigo-50' : 'bg-gray-50'}`}>
            {agent.avatarEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
                {agent.roleTitle && (
                  <p className="text-xs text-gray-500 truncate">{agent.roleTitle}</p>
                )}
              </div>
              <Toggle enabled={agent.isActive} onChange={onToggle} />
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${trust.color}`}>
                {trust.label}
              </span>
              {agent.isDefault && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Default
                </span>
              )}
            </div>
            {(agent.messagesThisWeek > 0 || agent.escalationsThisWeek > 0) && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                {agent.messagesThisWeek} handled this week
                {agent.escalationsThisWeek > 0 && ` · ${agent.escalationsThisWeek} escalated`}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900 tabular-nums">{agent.messagesToday}</p>
            <p className="text-[10px] text-gray-400">msgs today</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900 tabular-nums">{agent.assignmentCount}</p>
            <p className="text-[10px] text-gray-400">assigned</p>
          </div>
        </div>

        <button
          onClick={onEdit}
          className="mt-3 w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-50 transition-colors"
        >
          Edit agent
        </button>
      </div>
    </div>
  )
}

// ─── Template Gallery Modal ───────────────────────────────────────────────────

function TemplateGallery({ onSelect, onClose }: { onSelect: (t: typeof AGENT_TEMPLATES[0]) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Hire an agent</h2>
              <p className="text-xs text-gray-500 mt-0.5">Choose a role template to get started</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-5 grid grid-cols-1 gap-2">
          {AGENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => onSelect(tpl)}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group"
            >
              <span className="text-2xl flex-shrink-0">{tpl.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{tpl.name}</p>
                <p className="text-xs text-gray-500 line-clamp-1">{tpl.desc}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Agent Builder Modal ──────────────────────────────────────────────────────

interface AgentFormData {
  name: string
  roleTitle: string
  avatarEmoji: string
  agentType: string
  trustLevel: string
  tone: string
  systemPrompt: string
  goals: string
  escalateOnFrustration: boolean
  escalateOnExplicitRequest: boolean
  escalateOnOutOfScope: boolean
}

function AgentBuilderModal({
  initial,
  editingAgent,
  onSave,
  onClose,
}: {
  initial: typeof AGENT_TEMPLATES[0]
  editingAgent: Agent | null
  onSave: (data: AgentFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<AgentFormData>({
    name: editingAgent?.name ?? initial.name,
    roleTitle: editingAgent?.roleTitle ?? initial.roleTitle,
    avatarEmoji: editingAgent?.avatarEmoji ?? initial.emoji,
    agentType: editingAgent?.agentType ?? initial.type,
    trustLevel: editingAgent?.trustLevel ?? 'suggest',
    tone: initial.tone,
    systemPrompt: '',
    goals: '',
    escalateOnFrustration: true,
    escalateOnExplicitRequest: true,
    escalateOnOutOfScope: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Performance (docs/AUTO_REPLY_AGENTS_PLAN.md §6) — what this agent has
  // actually been doing, surfaced here since the edit modal is the one
  // reachable per-agent detail view in the current AI Workforce UI.
  const session = useZuriSession()
  const perfToken = session.data?.accessToken
  interface PerformanceTotals { totalMessages: number; totalEscalations: number; correctionCount: number; avgConfidence: number | null }
  const [performance, setPerformance] = useState<PerformanceTotals | null>(null)

  useEffect(() => {
    if (!editingAgent || !perfToken) return
    apiClient<{ totals: PerformanceTotals }>(`/api/agents/${editingAgent.id}/performance`, { token: perfToken })
      .then(d => setPerformance(d.totals))
      .catch(() => {})
  }, [editingAgent, perfToken])

  const set = (k: keyof AgentFormData, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }))

  const EMOJI_OPTIONS = ['🤖', '🏆', '💬', '🎯', '📅', '🔍', '🌐', '📦', '💎', '⚡', '🚀', '💡', '🔧', '📊', '🎨']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Agent name is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch {
      setError('Failed to save agent. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {editingAgent ? 'Edit agent' : `Set up ${initial.name}`}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5">
          {editingAgent && performance && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Performance</p>
              <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{performance.totalMessages}</p>
                  <p className="text-[10px] text-gray-400">messages sent</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{performance.totalEscalations}</p>
                  <p className="text-[10px] text-gray-400">escalated</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{performance.correctionCount}</p>
                  <p className="text-[10px] text-gray-400">corrections</p>
                </div>
              </div>
            </div>
          )}
          {/* Identity */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Identity</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => set('avatarEmoji', emoji)}
                      className={`w-9 h-9 text-xl rounded-lg border-2 transition-all ${form.avatarEmoji === emoji ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Maya"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role title</label>
                  <input
                    value={form.roleTitle}
                    onChange={(e) => set('roleTitle', e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Sales Lead"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Trust level */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Autonomy level</p>
            <div className="space-y-2">
              {Object.entries(TRUST_CONFIG).map(([level, cfg]) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set('trustLevel', level)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${form.trustLevel === level ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-gray-600">{cfg.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Instructions</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Goals</label>
                <textarea
                  value={form.goals}
                  onChange={(e) => set('goals', e.target.value)}
                  rows={2}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="What should this agent achieve? e.g. Book 5 demos per week..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">System prompt</label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => set('systemPrompt', e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Detailed instructions for how the agent should behave..."
                />
              </div>
            </div>
          </div>

          {/* Escalation */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Escalate to human when</p>
            <div className="space-y-2">
              {([
                ['escalateOnFrustration', 'Customer expresses frustration or anger'],
                ['escalateOnExplicitRequest', 'Customer asks to speak with a human'],
                ['escalateOnOutOfScope', 'Message is outside the agent\'s domain'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => set(key, !form[key])}
                    className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${form[key] ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 group-hover:border-indigo-400'}`}
                  >
                    {form[key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : (editingAgent ? 'Save changes' : 'Deploy agent')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const { data: agentsData, loading: agentsLoading, refetch: refetchAgents } =
    useApi<{ agents: Agent[] }>('/api/agents', token)
  const { data: escData, loading: escLoading, refetch: refetchEsc } =
    useApi<{ escalations: Escalation[] }>('/api/escalations?status=pending', token)
  const { data: rulesData, loading: rulesLoading } =
    useApi<{ rules: Rule[] }>('/api/automation/rules', token)

  const [activeTab, setActiveTab] = useState<'team' | 'escalations' | 'rules'>('team')
  const [showTemplateGallery, setShowTemplateGallery] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<typeof AGENT_TEMPLATES[0] | null>(null)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [localAgents, setLocalAgents] = useState<Agent[] | null>(null)
  const [localRules, setLocalRules] = useState<Rule[] | null>(null)

  const agents = localAgents ?? (agentsData?.agents ?? [])
  const escalations = escData?.escalations ?? []
  const rules = localRules ?? (rulesData?.rules && rulesData.rules.length > 0 ? rulesData.rules : PLACEHOLDER_RULES)

  const activeAgents = agents.filter((a) => a.isActive).length
  const messagesToday = agents.reduce((s, a) => s + a.messagesToday, 0)

  const handleToggleAgent = useCallback(async (agent: Agent) => {
    const updated = agents.map((a) => a.id === agent.id ? { ...a, isActive: !a.isActive } : a)
    setLocalAgents(updated)
    try {
      await apiClient(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        token: token ?? undefined,
        body: JSON.stringify({ is_active: !agent.isActive }),
      })
    } catch {
      setLocalAgents(agents)
    }
  }, [agents, token])

  const handleSaveAgent = useCallback(async (formData: AgentFormData) => {
    const payload = {
      name: formData.name,
      role_title: formData.roleTitle,
      avatar_emoji: formData.avatarEmoji,
      agent_type: formData.agentType,
      trust_level: formData.trustLevel,
      tone: formData.tone,
      goals: formData.goals || undefined,
      system_prompt: formData.systemPrompt || undefined,
      escalate_on_frustration: formData.escalateOnFrustration,
      escalate_on_explicit_human_request: formData.escalateOnExplicitRequest,
      escalate_on_out_of_scope: formData.escalateOnOutOfScope,
    }

    if (editingAgent) {
      await apiClient(`/api/agents/${editingAgent.id}`, {
        method: 'PATCH',
        token: token ?? undefined,
        body: JSON.stringify(payload),
      })
    } else {
      await apiClient('/api/agents', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify(payload),
      })
    }

    setLocalAgents(null)
    await refetchAgents()
    setSelectedTemplate(null)
    setEditingAgent(null)
  }, [editingAgent, token, refetchAgents])

  const handleResolveEscalation = useCallback(async (id: string) => {
    try {
      await apiClient(`/api/escalations/${id}`, {
        method: 'PATCH',
        token: token ?? undefined,
        body: JSON.stringify({ status: 'resolved' }),
      })
      await refetchEsc()
    } catch { /* silent */ }
  }, [token, refetchEsc])

  const toggleRule = (id: string) => {
    const base = localRules ?? rules
    setLocalRules(base.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  const isLoading = session.status === 'loading'

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="AI Workforce" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto w-full content-start">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <PageHeader
          title="AI Workforce"
          description={`${activeAgents} agent${activeAgents !== 1 ? 's' : ''} active`}
          action={
            <button
              onClick={() => setShowTemplateGallery(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Hire agent
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Agents',     value: agents.length,    color: 'text-gray-900' },
                { label: 'Active',     value: activeAgents,     color: 'text-indigo-600' },
                { label: 'Msgs today', value: messagesToday,    color: 'text-gray-900' },
                { label: 'Escalations', value: escalations.length, color: escalations.length > 0 ? 'text-red-600' : 'text-gray-900' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {([
                { key: 'team',        label: 'Your Team' },
                { key: 'escalations', label: `Escalations${escalations.length > 0 ? ` (${escalations.length})` : ''}` },
                { key: 'rules',       label: 'Rules' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Your Team tab */}
            {activeTab === 'team' && (
              <div>
                {agentsLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : agents.length === 0 ? (
                  <EmptyState
                    icon="🤖"
                    title="No agents yet"
                    description="Hire your first AI agent to start automating conversations."
                    action={
                      <button
                        onClick={() => setShowTemplateGallery(true)}
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Hire your first agent
                      </button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {agents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        onToggle={() => handleToggleAgent(agent)}
                        onEdit={() => {
                          const tpl = AGENT_TEMPLATES.find((t) => t.type === agent.agentType) ?? AGENT_TEMPLATES[AGENT_TEMPLATES.length - 1]
                          setSelectedTemplate(tpl)
                          setEditingAgent(agent)
                        }}
                      />
                    ))}
                  </div>
                )}

                {agents.length > 0 && (
                  <p className="text-xs text-gray-400 text-center mt-4">
                    Agents process messages in real time. Use &quot;Delegated&quot; or &quot;Autonomous&quot; trust for hands-free operation.
                  </p>
                )}
              </div>
            )}

            {/* Escalations tab */}
            {activeTab === 'escalations' && (
              <div className="space-y-3">
                {escLoading ? (
                  Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)
                ) : escalations.length === 0 ? (
                  <EmptyState
                    icon="✅"
                    title="No pending escalations"
                    description="When an agent can't handle a conversation, it appears here for your attention."
                  />
                ) : (
                  escalations.map((esc) => {
                    const urgency = URGENCY_CONFIG[esc.urgency] ?? URGENCY_CONFIG.normal
                    return (
                      <div key={esc.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-lg">
                            🚨
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {esc.contactName ?? 'Unknown contact'}
                                </p>
                                <p className="text-xs text-gray-500">via {esc.agentName}</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${urgency.color}`}>
                                  {urgency.label}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-3">
                              {REASON_LABELS[esc.reason] ?? esc.reason}
                              {esc.contextSummary && ` — ${esc.contextSummary}`}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">{timeAgo(esc.createdAt)}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleResolveEscalation(esc.id)}
                                  className="text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 rounded-lg border border-green-200 hover:bg-green-50 transition-colors"
                                >
                                  Resolve
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Rules tab */}
            {activeTab === 'rules' && (
              <div className="space-y-3">
                {rulesLoading ? (
                  Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)
                ) : (
                  rules.map((rule) => {
                    const cfg = RULE_CONFIG[rule.type] ?? { icon: '⚙️', label: rule.type, color: 'bg-gray-100 text-gray-700' }
                    return (
                      <div
                        key={rule.id}
                        className={`bg-white rounded-xl border transition-all ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl ${rule.enabled ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                              {cfg.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                                    {cfg.label}
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
                                <span className="text-xs text-gray-400">Last: {timeAgo(rule.lastTriggeredAt)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
                <p className="text-xs text-gray-400 text-center pb-2">
                  Rules run in the background. Zuri evaluates conditions every 15 minutes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template Gallery Modal */}
      {showTemplateGallery && (
        <TemplateGallery
          onSelect={(tpl) => {
            setSelectedTemplate(tpl)
            setEditingAgent(null)
            setShowTemplateGallery(false)
          }}
          onClose={() => setShowTemplateGallery(false)}
        />
      )}

      {/* Agent Builder Modal */}
      {selectedTemplate && (
        <AgentBuilderModal
          initial={selectedTemplate}
          editingAgent={editingAgent}
          onSave={handleSaveAgent}
          onClose={() => { setSelectedTemplate(null); setEditingAgent(null) }}
        />
      )}
    </>
  )
}
