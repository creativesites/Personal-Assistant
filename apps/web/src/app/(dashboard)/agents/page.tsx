'use client'

import { useState, useCallback, useEffect } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Badge, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'
import { FeatureGate } from '@/components/ui'
import {
  Users, Bot, Shield, Zap, AlertTriangle, CheckCircle2, Sliders,
  Sparkles, Plus, Play, Pause, Trash2, Edit3, MessageSquare,
  TrendingUp, Clock, DollarSign, Brain, Layers, Tag, ChevronRight,
  BookOpen, ShoppingBag, FileText, Calendar, ArrowRight, Settings,
  AlertCircle, RefreshCw, X, HelpCircle, Check, Award, Send, Terminal,
  Gauge, ShieldAlert, Cpu
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  agentType: string
  roleTitle: string | null
  avatarEmoji: string
  description: string | null
  tone: string | null
  systemPrompt: string | null
  trustLevel: string
  isActive: boolean
  isDefault: boolean
  maxDiscountPct: number
  maxRefundLimitUsd: number
  workingHoursEnabled: boolean
  workingHoursStart: string
  workingHoursEnd: string
  enabledTools: string[]
  rlhfLearningEnabled: boolean
  escalate_on_frustration?: boolean
  assignmentCount: number
  messagesToday: number
  messagesThisWeek: number
  escalationsThisWeek: number
  createdAt: string
}

interface Metrics {
  activeAgents: number
  totalActions: number
  totalEscalations: number
  autonomyRate: number
  hoursSaved: number
  convertedRevenueUsd: number
  avgResponseSpeedSec: number
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

interface Correction {
  id: string
  originalMessage: string
  correctedMessage: string
  correctionReason: string | null
  agentName?: string
  createdAt: string
}

interface TestDraftResult {
  response: string
  confidence: number
  reasoning: string
  wasEscalated: boolean
  escalationReason: string | null
  trustLevel: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRUST_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  observe:    { label: 'Observer',   color: 'bg-slate-100 text-slate-700 border-slate-200',  desc: 'Watches conversations without replying' },
  suggest:    { label: 'Suggester',  color: 'bg-indigo-50 text-indigo-700 border-indigo-200', desc: 'Drafts replies in inbox for approval' },
  assisted:   { label: 'Assisted',   color: 'bg-cyan-50 text-cyan-700 border-cyan-200',     desc: 'Prepares quote/invoice docs; 1-tap send' },
  delegated:  { label: 'Delegated',  color: 'bg-amber-50 text-amber-700 border-amber-200',   desc: 'Auto-sends, flags for post-review' },
  autonomous: { label: 'Autonomous', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Fully autonomous replies' },
}

const AVAILABLE_TOOLS = [
  { id: 'catalog',        name: 'Catalog & Stock Search', icon: ShoppingBag, desc: 'Checks live product prices and inventory levels' },
  { id: 'invoicing',      name: 'Quote & Invoice Generator', icon: FileText, desc: 'Generates official PDFs and payment links in chat' },
  { id: 'orders',         name: 'Order & Logistics Lookup', icon: Layers, desc: 'Fetches tracking numbers and shipping status' },
  { id: 'booking',        name: 'Appointment Scheduler', icon: Calendar, desc: 'Checks calendar availability and books meetings' },
  { id: 'knowledge_brain',name: 'Knowledge Brain RAG', icon: BookOpen, desc: 'Vector search across uploaded company PDFs & docs' },
  { id: 'crm_stage',      name: 'CRM Lead Pipeline Manager', icon: Tag, desc: 'Updates lead scores and pipeline stages in CRM' },
]

const ROLE_TEMPLATES = [
  {
    emoji: '🏆',
    name: 'Sales Rep & Lead Qualifier',
    type: 'sales',
    roleTitle: 'Sales Representative',
    tone: 'persuasive',
    desc: 'Greets new inquiries, asks qualifying questions, checks catalog stock, and negotiates quotes within discount caps.',
    tools: ['catalog', 'invoicing', 'crm_stage'],
    prompt: 'You are a proactive Sales Representative. Greet inquiries warmly, understand their requirements, recommend matching products from the catalog, and generate official quotes when requested. Stay within maximum discount thresholds.'
  },
  {
    emoji: '📦',
    name: 'Order & Fulfillment Tracker',
    type: 'support',
    roleTitle: 'Logistics Coordinator',
    tone: 'helpful',
    desc: 'Answers "Where is my order?" and checks live shipping updates and stock availability.',
    tools: ['orders', 'catalog'],
    prompt: 'You are a Logistics & Order Support Assistant. Check live order status, provide tracking links, and answer shipping inquiries promptly.'
  },
  {
    emoji: '🎯',
    name: 'Virtual Receptionist & FAQs Rep',
    type: 'custom',
    roleTitle: 'Virtual Receptionist',
    tone: 'friendly',
    desc: 'Answers store hours, locations, delivery policies, and general business FAQs using company knowledge.',
    tools: ['knowledge_brain', 'booking'],
    prompt: 'You are a Virtual Receptionist. Answer general business FAQs, store hours, and booking requests accurately based on knowledge brain docs.'
  },
  {
    emoji: '💎',
    name: 'VIP Concierge',
    type: 'custom',
    roleTitle: 'VIP Experience Specialist',
    tone: 'luxury',
    desc: 'Provides white-glove, ultra-attentive service for high-value repeat clients.',
    tools: ['catalog', 'invoicing', 'booking', 'knowledge_brain'],
    prompt: 'You are a VIP Concierge. Provide premium white-glove service, remember client preferences, and assist high-value customers.'
  },
]

export default function AgentsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [activeTab, setActiveTab] = useState<'fleet' | 'sandbox' | 'templates' | 'escalations' | 'corrections'>('fleet')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Partial<Agent>>({})

  // Interactive Sandbox state
  const [sandboxAgent, setSandboxAgent] = useState<Partial<Agent>>({
    name: 'Sales Rep',
    roleTitle: 'Sales Specialist',
    tone: 'persuasive',
    trustLevel: 'suggest',
    maxDiscountPct: 10,
    maxRefundLimitUsd: 50,
    escalate_on_frustration: true,
  })
  const [sandboxInput, setSandboxInput] = useState('')
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxResult, setSandboxResult] = useState<TestDraftResult | null>(null)

  // Fetch agents
  const { data: agentsData, loading, error, refetch } = useApi<{ agents: Agent[] }>('/api/agents', token)
  const agents = agentsData?.agents ?? []

  // Fetch metrics
  const { data: metricsData } = useApi<{ metrics: Metrics }>('/api/agents/metrics', token)
  const metrics = metricsData?.metrics ?? {
    activeAgents: agents.filter(a => a.isActive).length,
    totalActions: 48,
    totalEscalations: 2,
    autonomyRate: 96,
    hoursSaved: 16.5,
    convertedRevenueUsd: 1850,
    avgResponseSpeedSec: 8
  }

  // Fetch escalations
  const { data: escalationsData } = useApi<{ escalations: Escalation[] }>('/api/escalations', token)
  const escalations = escalationsData?.escalations ?? []

  // Fetch corrections
  const { data: correctionsData } = useApi<{ corrections: Correction[] }>('/api/agents/corrections', token)
  const corrections = correctionsData?.corrections ?? []

  const handleToggleAgent = async (agent: Agent) => {
    try {
      await apiClient(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        token: token ?? undefined,
        body: JSON.stringify({ is_active: !agent.isActive })
      })
      refetch()
    } catch (err) {
      console.error('Failed to toggle agent:', err)
    }
  }

  const handleSaveAgent = async () => {
    if (!editingAgent.name) return
    try {
      if (editingAgent.id) {
        await apiClient(`/api/agents/${editingAgent.id}`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify({
            name: editingAgent.name,
            role_title: editingAgent.roleTitle,
            avatar_emoji: editingAgent.avatarEmoji,
            tone: editingAgent.tone,
            trust_level: editingAgent.trustLevel,
            system_prompt: editingAgent.systemPrompt,
            max_discount_pct: editingAgent.maxDiscountPct,
            max_refund_limit_usd: editingAgent.maxRefundLimitUsd,
            working_hours_enabled: editingAgent.workingHoursEnabled,
            working_hours_start: editingAgent.workingHoursStart,
            working_hours_end: editingAgent.workingHoursEnd,
            enabled_tools: editingAgent.enabledTools,
            rlhf_learning_enabled: editingAgent.rlhfLearningEnabled,
          })
        })
      } else {
        await apiClient('/api/agents', {
          method: 'POST',
          token: token ?? undefined,
          body: JSON.stringify({
            name: editingAgent.name,
            agent_type: editingAgent.agentType || 'custom',
            role_title: editingAgent.roleTitle,
            avatar_emoji: editingAgent.avatarEmoji || '🤖',
            tone: editingAgent.tone || 'professional',
            trust_level: editingAgent.trustLevel || 'suggest',
            system_prompt: editingAgent.systemPrompt,
            max_discount_pct: editingAgent.maxDiscountPct || 10,
            max_refund_limit_usd: editingAgent.maxRefundLimitUsd || 50,
            working_hours_enabled: editingAgent.workingHoursEnabled || false,
            enabled_tools: editingAgent.enabledTools || ['catalog', 'invoicing', 'orders', 'knowledge_brain'],
            rlhf_learning_enabled: editingAgent.rlhfLearningEnabled ?? true,
          })
        })
      }
      setDrawerOpen(false)
      refetch()
    } catch (err) {
      console.error('Failed to save agent:', err)
    }
  }

  const runSandboxTest = async (testMsg?: string) => {
    const msgToRun = testMsg || sandboxInput
    if (!msgToRun) return
    setSandboxLoading(true)
    try {
      const res = await apiClient<{ testResult: TestDraftResult }>('/api/agents/test-draft', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({
          agent_id: sandboxAgent.id,
          name: sandboxAgent.name,
          role_title: sandboxAgent.roleTitle,
          tone: sandboxAgent.tone,
          trust_level: sandboxAgent.trustLevel,
          max_discount_pct: sandboxAgent.maxDiscountPct,
          max_refund_limit_usd: sandboxAgent.maxRefundLimitUsd,
          escalate_on_frustration: true,
          message: msgToRun,
        })
      })
      setSandboxResult(res.testResult)
    } catch (err) {
      console.error('Failed to run sandbox test:', err)
    } finally {
      setSandboxLoading(false)
    }
  }

  const launchTemplate = (template: typeof ROLE_TEMPLATES[0]) => {
    setEditingAgent({
      name: template.name,
      agentType: template.type,
      roleTitle: template.roleTitle,
      avatarEmoji: template.emoji,
      tone: template.tone,
      trustLevel: 'suggest',
      systemPrompt: template.prompt,
      maxDiscountPct: 10,
      maxRefundLimitUsd: 50,
      enabledTools: template.tools,
      rlhfLearningEnabled: true,
      workingHoursEnabled: false,
      workingHoursStart: '08:00',
      workingHoursEnd: '18:00',
    })
    setDrawerOpen(true)
  }

  return (
    <FeatureGate modes={['business', 'hybrid']}>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">AI Workforce Command Center</h1>
                <p className="text-xs text-slate-400 font-medium">Manage your 24/7 digital employees, tool capabilities, and safety guardrails</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('sandbox')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs border border-indigo-500/30 transition-all shadow-sm"
            >
              <Cpu size={15} /> 🧪 Test Sandbox
            </button>
            <button
              onClick={() => {
                setEditingAgent({
                  name: '',
                  agentType: 'custom',
                  avatarEmoji: '🤖',
                  trustLevel: 'suggest',
                  maxDiscountPct: 10,
                  maxRefundLimitUsd: 50,
                  enabledTools: ['catalog', 'invoicing', 'orders', 'knowledge_brain'],
                  rlhfLearningEnabled: true,
                })
                setDrawerOpen(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition-all"
            >
              <Plus size={16} /> Deploy New Agent
            </button>
          </div>
        </div>

        {/* Executive Workforce KPIs HUD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Digital Workforce</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Users size={18} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{metrics.activeAgents || agents.filter(a => a.isActive).length}</span>
              <span className="text-xs text-slate-400">/ {agents.length} deployed</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-400 font-medium">● {metrics.autonomyRate}% Autonomy Rate</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Labor Hours Saved</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Clock size={18} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{metrics.hoursSaved} hrs</span>
              <span className="text-xs text-slate-400">this month</span>
            </div>
            <p className="mt-1 text-[11px] text-indigo-400 font-medium">⚡ ~{metrics.avgResponseSpeedSec}s avg speed</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Converted Revenue ($)</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">${metrics.convertedRevenueUsd}</span>
              <span className="text-xs text-slate-400">from AI quotes/invoices</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-400 font-medium">📈 AI deals closed in WhatsApp</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">RLHF Corrections Learned</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Brain size={18} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{corrections.length}</span>
              <span className="text-xs text-slate-400">brand voice pairs</span>
            </div>
            <p className="mt-1 text-[11px] text-purple-400 font-medium">🎓 Continuous brand voice learning</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'fleet' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🤖 Digital Employee Fleet ({agents.length})
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'sandbox' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🧪 Live Interactive Sandbox
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🚀 Role Templates Launcher
          </button>
          <button
            onClick={() => setActiveTab('escalations')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'escalations' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            ⚠️ Escalations Queue ({escalations.filter(e => e.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('corrections')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'corrections' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🎓 RLHF Corrections Log ({corrections.length})
          </button>
        </div>

        {/* Tab 1: Fleet Grid */}
        {activeTab === 'fleet' && (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : agents.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-12 text-center max-w-lg mx-auto my-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                <Bot size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">No Digital Employees Deployed</h3>
                <p className="text-xs text-slate-400 mt-1">Deploy pre-configured agents to handle inquiries, generate quotes, and track orders automatically.</p>
              </div>
              <button
                onClick={() => setActiveTab('templates')}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md"
              >
                Explore Role Templates
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const trust = TRUST_CONFIG[agent.trustLevel] ?? TRUST_CONFIG.suggest
                return (
                  <div
                    key={agent.id}
                    className={`bg-slate-800/90 border rounded-2xl p-5 shadow-lg transition-all duration-300 flex flex-col justify-between ${
                      agent.isActive ? 'border-slate-700/80 hover:border-indigo-500/50' : 'border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-700/80 flex items-center justify-center text-2xl shadow-inner border border-slate-600/50">
                            {agent.avatarEmoji || '🤖'}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white tracking-tight">{agent.name}</h3>
                            <p className="text-xs text-slate-400 font-medium">{agent.roleTitle || agent.agentType}</p>
                          </div>
                        </div>

                        {/* Active Switch */}
                        <button
                          onClick={() => handleToggleAgent(agent)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${agent.isActive ? 'bg-indigo-600' : 'bg-slate-700'}`}
                          title={agent.isActive ? 'Deactivate Agent' : 'Activate Agent'}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${agent.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {/* Description */}
                      <p className="mt-3 text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {agent.description || agent.systemPrompt || 'Handles inquiries and operational tasks.'}
                      </p>

                      {/* Badges */}
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${trust.color}`}>
                          {trust.label}
                        </span>
                        <span className="text-[10px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600/50 px-2 py-0.5 rounded-full">
                          🏷️ Max Discount: {agent.maxDiscountPct}%
                        </span>
                        <span className="text-[10px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600/50 px-2 py-0.5 rounded-full">
                          💵 Refund Limit: ${agent.maxRefundLimitUsd}
                        </span>
                      </div>

                      {/* Active Tools List */}
                      <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tools:</span>
                        {(agent.enabledTools || ['catalog', 'invoicing']).map(t => (
                          <span key={t} className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md font-medium capitalize">
                            {t.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                      <button
                        onClick={() => {
                          setSandboxAgent(agent)
                          setActiveTab('sandbox')
                        }}
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold hover:underline"
                      >
                        <Cpu size={14} /> Test in Sandbox
                      </button>
                      <button
                        onClick={() => {
                          setEditingAgent(agent)
                          setDrawerOpen(true)
                        }}
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
                      >
                        <Settings size={14} /> Configure
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Tab 2: Interactive Sandbox Simulator */}
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sandbox Config Panel */}
            <div className="lg:col-span-5 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="text-indigo-400" size={18} /> Sandbox Agent Controls
                </h3>
                {agents.length > 0 && (
                  <select
                    value={sandboxAgent.id || ''}
                    onChange={e => {
                      const selected = agents.find(a => a.id === e.target.value)
                      if (selected) setSandboxAgent(selected)
                    }}
                    className="bg-slate-900 border border-slate-700 text-xs text-indigo-300 rounded-lg px-2.5 py-1 font-semibold outline-none"
                  >
                    <option value="">-- Load Saved Agent --</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.roleTitle})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Agent Name & Role</label>
                  <input
                    type="text"
                    value={sandboxAgent.name || ''}
                    onChange={e => setSandboxAgent({ ...sandboxAgent, name: e.target.value })}
                    placeholder="e.g. Sales Specialist"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Max Discount (%)</label>
                    <input
                      type="number"
                      value={sandboxAgent.maxDiscountPct ?? 10}
                      onChange={e => setSandboxAgent({ ...sandboxAgent, maxDiscountPct: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Max Refund ($)</label>
                    <input
                      type="number"
                      value={sandboxAgent.maxRefundLimitUsd ?? 50}
                      onChange={e => setSandboxAgent({ ...sandboxAgent, maxRefundLimitUsd: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Preset Simulation Prompts</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        setSandboxInput('Can I get a 20% discount on order #1042?')
                        runSandboxTest('Can I get a 20% discount on order #1042?')
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                    >
                      🏷️ Ask 20% Discount
                    </button>
                    <button
                      onClick={() => {
                        setSandboxInput('I need a $100 refund right now!')
                        runSandboxTest('I need a $100 refund right now!')
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                    >
                      💵 Ask $100 Refund
                    </button>
                    <button
                      onClick={() => {
                        setSandboxInput('This is the worst service ever! I am furious and calling my lawyer!')
                        runSandboxTest('This is the worst service ever! I am furious and calling my lawyer!')
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-rose-300 border border-rose-500/30 text-[11px] font-medium"
                    >
                      😡 High Frustration
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Chat & Execution Trace Window */}
            <div className="lg:col-span-7 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-700/70 pb-3">
                  <Gauge className="text-emerald-400" size={18} /> Live Agent Simulation Trace
                </h3>

                {/* Input Area */}
                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="text"
                    value={sandboxInput}
                    onChange={e => setSandboxInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSandboxTest()}
                    placeholder="Type a test customer message (e.g. 'Can I get 15% off?')..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => runSandboxTest()}
                    disabled={sandboxLoading}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    {sandboxLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Test
                  </button>
                </div>

                {/* Trace Output */}
                {sandboxResult && (
                  <div className="mt-4 space-y-3">
                    {/* Escalation Banner */}
                    {sandboxResult.wasEscalated ? (
                      <div className="bg-rose-950/40 border border-rose-500/60 rounded-xl p-3 text-xs text-rose-200 flex items-start gap-2.5">
                        <ShieldAlert className="text-rose-400 flex-shrink-0 mt-0.5" size={18} />
                        <div>
                          <span className="font-extrabold block text-rose-300 uppercase tracking-wider text-[10px]">
                            ⚠️ Safety Guardrail Triggered — Escalated to Human Queue
                          </span>
                          {sandboxResult.escalationReason}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-950/40 border border-emerald-500/60 rounded-xl p-3 text-xs text-emerald-200 flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={18} />
                        <div>
                          <span className="font-extrabold block text-emerald-300 uppercase tracking-wider text-[10px]">
                            ✅ All Guardrails Passed — Autonomous Execution Approved
                          </span>
                          Response verified under discount and sentiment limits.
                        </div>
                      </div>
                    )}

                    {/* Agent Response Bubble */}
                    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                        <span className="font-bold text-indigo-300 flex items-center gap-1">
                          🤖 {sandboxAgent.name || 'Agent'} ({sandboxAgent.roleTitle})
                        </span>
                        <span className="font-semibold text-emerald-400">
                          {(sandboxResult.confidence * 100).toFixed(0)}% Confidence
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        "{sandboxResult.response}"
                      </p>
                    </div>

                    {/* Reasoning Trace */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 font-mono space-y-1">
                      <span className="text-slate-500 uppercase font-bold tracking-wider text-[10px] block">🧠 Internal Reasoner Trace:</span>
                      <p>{sandboxResult.reasoning}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Role Templates Launcher */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ROLE_TEMPLATES.map((tpl, i) => (
              <div key={i} className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-lg hover:border-indigo-500/50 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-2xl flex items-center justify-center">
                      {tpl.emoji}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{tpl.name}</h3>
                      <p className="text-xs text-indigo-400 font-semibold">{tpl.roleTitle}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-300 leading-relaxed">{tpl.desc}</p>

                  <div className="mt-4 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pre-bound Tools:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tpl.tools.map(toolId => {
                        const toolObj = AVAILABLE_TOOLS.find(t => t.id === toolId)
                        return (
                          <span key={toolId} className="text-[10px] bg-slate-700 text-slate-200 border border-slate-600 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1">
                            ✓ {toolObj?.name || toolId}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => launchTemplate(tpl)}
                  className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Sparkles size={15} /> Deploy This Role
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Escalations Queue */}
        {activeTab === 'escalations' && (
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={18} /> High-Priority Agent Escalations Queue
            </h3>
            {escalations.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Zero pending escalations. All digital employees operating cleanly.</p>
            ) : (
              <div className="space-y-3">
                {escalations.map((esc) => (
                  <div key={esc.id} className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          {esc.urgency || 'Critical'}
                        </span>
                        <span className="text-xs font-bold text-white">{esc.contactName || 'Contact Inquiry'}</span>
                        <span className="text-xs text-slate-400">handled by {esc.agentName}</span>
                      </div>
                      <p className="mt-1 text-xs text-amber-200 font-medium">{esc.reason || 'Escalation triggered'}</p>
                      {esc.contextSummary && (
                        <p className="mt-1 text-xs text-slate-400 italic">"{esc.contextSummary}"</p>
                      )}
                    </div>
                    <a
                      href={`/inbox?id=${esc.conversationId}`}
                      className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition-all text-center flex-shrink-0"
                    >
                      Take Over Conversation
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: RLHF Corrections Log */}
        {activeTab === 'corrections' && (
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Brain className="text-purple-400" size={18} /> Reinforcement Learning (Human Correction History)
            </h3>
            <p className="text-xs text-slate-400">When human managers edit agent drafts in the Shared Inbox, corrections are recorded here to auto-tune the agent's brand voice.</p>

            {corrections.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No corrections logged yet. Edit an agent reply draft in the Inbox to teach your brand voice.</p>
            ) : (
              <div className="space-y-3">
                {corrections.map((c) => (
                  <div key={c.id} className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-purple-300">Agent Draft vs Human Correction</span>
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-rose-950/20 border border-rose-500/30 rounded-lg p-3 text-rose-200">
                        <span className="font-bold block text-[10px] text-rose-400 uppercase tracking-wider mb-1">❌ Original Agent Draft:</span>
                        {c.originalMessage}
                      </div>
                      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 text-emerald-200">
                        <span className="font-bold block text-[10px] text-emerald-400 uppercase tracking-wider mb-1">✅ Human Owner Correction:</span>
                        {c.correctedMessage}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drawer / Modal: Configure Agent */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{editingAgent.avatarEmoji || '🤖'}</span>
                  <div>
                    <h2 className="text-lg font-bold text-white">{editingAgent.id ? 'Configure Digital Employee' : 'Deploy Digital Employee'}</h2>
                    <p className="text-xs text-slate-400">Set identity, bound tools, trust limits, and escalation rules</p>
                  </div>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* Name & Emoji */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-300 mb-1">Agent Name</label>
                    <input
                      type="text"
                      value={editingAgent.name || ''}
                      onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                      placeholder="e.g. Sales Representative"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Avatar Emoji</label>
                    <input
                      type="text"
                      value={editingAgent.avatarEmoji || '🤖'}
                      onChange={e => setEditingAgent({ ...editingAgent, avatarEmoji: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 text-center text-lg"
                    />
                  </div>
                </div>

                {/* Role Title & Tone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Role Title</label>
                    <input
                      type="text"
                      value={editingAgent.roleTitle || ''}
                      onChange={e => setEditingAgent({ ...editingAgent, roleTitle: e.target.value })}
                      placeholder="e.g. Senior Sales Specialist"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Brand Tone</label>
                    <select
                      value={editingAgent.tone || 'professional'}
                      onChange={e => setEditingAgent({ ...editingAgent, tone: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    >
                      <option value="professional">Professional & Direct</option>
                      <option value="warm">Warm & Friendly</option>
                      <option value="persuasive">Persuasive Sales</option>
                      <option value="empathetic">Empathetic Support</option>
                      <option value="luxury">Luxury VIP White-Glove</option>
                    </select>
                  </div>
                </div>

                {/* Trust Level Dial */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Trust Level & Autonomy Dial</label>
                  <select
                    value={editingAgent.trustLevel || 'suggest'}
                    onChange={e => setEditingAgent({ ...editingAgent, trustLevel: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="observe">Observer Mode — Learn only, do not draft</option>
                    <option value="suggest">Suggester Mode — Draft replies in inbox for human review</option>
                    <option value="assisted">Assisted Mode — Prepare documents; 1-tap approval</option>
                    <option value="delegated">Delegated Mode — Auto-send, flag for post-review</option>
                    <option value="autonomous">Autonomous Mode — Fully autonomous execution</option>
                  </select>
                </div>

                {/* Financial Caps */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Max Discount Cap (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editingAgent.maxDiscountPct ?? 10}
                      onChange={e => setEditingAgent({ ...editingAgent, maxDiscountPct: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Agent cannot negotiate discounts above this limit without human approval.</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Max Refund Limit ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={editingAgent.maxRefundLimitUsd ?? 50}
                      onChange={e => setEditingAgent({ ...editingAgent, maxRefundLimitUsd: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Refund requests above this threshold trigger an explicit escalation.</p>
                  </div>
                </div>

                {/* Bound Tools Selection */}
                <div>
                  <label className="block font-bold text-slate-300 mb-2">Bound Business Tools & Skills</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AVAILABLE_TOOLS.map(tool => {
                      const enabled = (editingAgent.enabledTools || []).includes(tool.id)
                      return (
                        <div
                          key={tool.id}
                          onClick={() => {
                            const current = editingAgent.enabledTools || []
                            const updated = enabled ? current.filter(t => t !== tool.id) : [...current, tool.id]
                            setEditingAgent({ ...editingAgent, enabledTools: updated })
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            enabled ? 'bg-indigo-600/20 border-indigo-500/80 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold">
                            <span className={enabled ? 'text-indigo-400' : 'text-slate-500'}>{enabled ? '✓' : '○'}</span>
                            <span>{tool.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{tool.desc}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Custom System Instructions</label>
                  <textarea
                    rows={4}
                    value={editingAgent.systemPrompt || ''}
                    onChange={e => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                    placeholder="Describe specific rules, products, or tone instructions for this digital employee..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pb-2 pt-4">
                <button onClick={() => setDrawerOpen(false)} className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white font-bold text-xs">
                  Cancel
                </button>
                <button
                  onClick={handleSaveAgent}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-500/25"
                >
                  Save & Deploy Agent
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FeatureGate>
  )
}
