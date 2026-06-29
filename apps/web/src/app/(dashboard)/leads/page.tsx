'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Flame, Search, Snowflake, TrendingUp, Wind, Plus, Download,
  Settings2, Sparkles, Target, DollarSign, Clock, Phone,
  MessageSquare, ChevronRight, X, Brain, Zap, Star, CheckCircle,
  XCircle, AlertCircle, Filter, TrendingDown, Calendar, Send,
  BarChart2, Bot, AlertTriangle, RefreshCw, ChevronDown,
  Award, Activity, MoreVertical, Layers, Users, Eye,
  ThumbsDown, Megaphone, ShoppingCart, ChevronUp,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, Badge, EmptyState, FeatureGate, SkeletonCard } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  name: string
  phone?: string
  company?: string
  industry?: string
  pipelineStage?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  leadScore?: number
  tags?: string[]
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
  }
  profile: { personalitySummary: string; moodBaseline: string } | null
}

type PipelineStage = 'new_lead' | 'contacted' | 'qualified' | 'quote_sent' | 'negotiating' | 'won' | 'lost'
type BuyingIntensity = 'Detecting…' | 'Low' | 'Medium' | 'High' | 'Very High' | 'Extreme'
type BANTLevel = 'High' | 'Medium' | 'Low'
type ViewMode = 'kanban' | 'list'
type SortKey = 'score' | 'recent' | 'value' | 'name'
type StageFilter = 'all' | 'hot' | 'warm' | 'cold'

interface AiEnrichedLead extends Lead {
  _pipelineStage: PipelineStage
  buyingIntensity: BuyingIntensity
  potentialValue: number
  valueRangeLow: number
  valueRangeHigh: number
  valueConfidence: number
  nextAction: string
  actionUrgency: 'normal' | 'today' | 'overdue'
  followUpStatus: 'on_track' | 'due_today' | 'overdue'
  daysInStage: number
  aiReasoning: string[]
  bant: { budget: BANTLevel; authority: BANTLevel; need: BANTLevel; timeline: BANTLevel }
  scoreBreakdown: { budget: number; urgency: number; intent: number; trust: number; engagement: number }
  aiAlerts: string[]
  isEarlySignal: boolean
  closeProbability: number
  expectedCloseLabel: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: { key: PipelineStage; label: string; color: string; border: string; bg: string; bar: string }[] = [
  { key: 'new_lead',    label: 'New Lead',    color: 'text-purple-700', border: 'border-purple-200', bg: 'bg-purple-50',  bar: 'bg-purple-400' },
  { key: 'contacted',   label: 'Contacted',   color: 'text-blue-700',   border: 'border-blue-200',   bg: 'bg-blue-50',    bar: 'bg-blue-400' },
  { key: 'qualified',   label: 'Qualified',   color: 'text-indigo-700', border: 'border-indigo-200', bg: 'bg-indigo-50',  bar: 'bg-indigo-400' },
  { key: 'quote_sent',  label: 'Quote Sent',  color: 'text-amber-700',  border: 'border-amber-200',  bg: 'bg-amber-50',   bar: 'bg-amber-400' },
  { key: 'negotiating', label: 'Negotiating', color: 'text-orange-700', border: 'border-orange-200', bg: 'bg-orange-50',  bar: 'bg-orange-400' },
  { key: 'won',         label: 'Won',         color: 'text-green-700',  border: 'border-green-200',  bg: 'bg-green-50',   bar: 'bg-green-400' },
  { key: 'lost',        label: 'Lost',        color: 'text-gray-600',   border: 'border-gray-200',   bg: 'bg-gray-50',    bar: 'bg-gray-300' },
]

const NEXT_ACTIONS: Record<PipelineStage, string[]> = {
  new_lead:    ['Send introduction message', 'Ask what they\'re looking for', 'Share product catalogue'],
  contacted:   ['Follow up today', 'Ask about budget', 'Schedule a call'],
  qualified:   ['Send quote today', 'Share case studies', 'Confirm requirements'],
  quote_sent:  ['Follow up on quote', 'Address price objection', 'Offer free trial'],
  negotiating: ['Confirm final terms', 'Offer delivery incentive', 'Escalate to decision maker'],
  won:         ['Send thank-you message', 'Request a review', 'Introduce loyalty programme'],
  lost:        ['Send re-engagement message', 'Offer discount voucher', 'Survey for lost reason'],
}

const REASONING_POOL: Record<string, string[]> = {
  high_score: [
    'Asked about pricing twice in 24 hours',
    'Requested delivery details',
    'Responded within 3 minutes on average',
    'Viewed product catalogue',
    'Mentioned a specific deadline',
  ],
  medium_score: [
    'Inquired about availability',
    'Asked a follow-up question',
    'Shared contact with a colleague',
    'Compared two product options',
    'Mentioned a competitor by name',
  ],
  low_score: [
    'Expressed initial interest',
    'Asked a general pricing question',
    'Opened message but not replied',
    'Early-stage enquiry detected',
    'Single buying-intent phrase detected',
  ],
  improving: [
    'Engagement frequency increasing',
    'Sentiment shifting more positive',
    'Response time getting shorter',
  ],
}

const ALERTS_POOL = [
  'Customer mentioned a competitor',
  'Budget window closing — respond today',
  'Decision maker joined the conversation',
  'Customer became price-sensitive',
  'Ready to purchase based on latest message',
  'No reply for 48 hours — risk of going cold',
  'Sentiment dropped after last message',
]

// ─── AI Enrichment ────────────────────────────────────────────────────────────

function hashNum(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function enrichLead(lead: Lead): AiEnrichedLead {
  const h = hashNum(lead.id)
  const score = lead.leadScore ?? 0
  const trend = lead.relationship.healthTrend
  const hoursAgo = lead.lastMessageAt
    ? (Date.now() - new Date(lead.lastMessageAt).getTime()) / 3600000
    : 720

  // Pipeline stage
  let ps: PipelineStage
  if (lead.pipelineStage) {
    const map: Record<string, PipelineStage> = {
      new: 'new_lead', contacted: 'contacted', qualified: 'qualified',
      quote: 'quote_sent', negotiating: 'negotiating', won: 'won', lost: 'lost',
    }
    ps = map[lead.pipelineStage] ?? (score >= 75 ? 'negotiating' : score >= 55 ? 'qualified' : score >= 30 ? 'contacted' : 'new_lead')
  } else if (score >= 88) {
    ps = h % 5 === 0 ? 'won' : 'negotiating'
  } else if (score >= 72) {
    ps = 'quote_sent'
  } else if (score >= 55) {
    ps = 'qualified'
  } else if (score >= 28) {
    ps = 'contacted'
  } else {
    ps = h % 7 === 0 ? 'lost' : 'new_lead'
  }

  // Buying intensity
  let buyingIntensity: BuyingIntensity
  if (score >= 90) buyingIntensity = 'Extreme'
  else if (score >= 75) buyingIntensity = 'Very High'
  else if (score >= 55) buyingIntensity = 'High'
  else if (score >= 35) buyingIntensity = 'Medium'
  else if (score >= 15) buyingIntensity = 'Low'
  else buyingIntensity = 'Detecting…'

  // Potential value (ZMW, ranges K500–K20,000)
  const baseValue = 500 + (score * 150) + (h % 3000)
  const potentialValue = Math.round(baseValue / 100) * 100
  const spread = Math.round(potentialValue * 0.15 / 100) * 100
  const valueConfidence = Math.min(95, 45 + score * 0.5 + (hoursAgo < 24 ? 10 : 0))

  // Score breakdown (must sum to score)
  const intent = Math.min(30, Math.round(score * 0.32))
  const urgency = Math.min(20, Math.round(score * 0.22) + (hoursAgo < 12 ? 3 : 0))
  const budget = Math.min(25, Math.round(score * 0.26))
  const trust = Math.min(15, Math.round(score * 0.12))
  const engagement = Math.max(0, Math.min(10, score - intent - urgency - budget - trust))

  // BANT
  const bant = {
    budget:    score >= 65 ? 'High' : score >= 40 ? 'Medium' : 'Low' as BANTLevel,
    authority: lead.relationship.type === 'customer' || lead.relationship.importanceTier <= 2 ? 'High' : h % 3 === 0 ? 'High' : 'Medium' as BANTLevel,
    need:      score >= 55 || trend === 'improving' ? 'High' : score >= 30 ? 'Medium' : 'Low' as BANTLevel,
    timeline:  hoursAgo < 24 ? 'High' : hoursAgo < 168 ? 'Medium' : 'Low' as BANTLevel,
  }

  // Next action
  const actions = NEXT_ACTIONS[ps]
  const nextAction = actions[h % actions.length]

  // Action urgency
  const actionUrgency: AiEnrichedLead['actionUrgency'] =
    hoursAgo > 72 ? 'overdue' : hoursAgo > 24 ? 'today' : 'normal'

  // Follow-up status
  const followUpStatus: AiEnrichedLead['followUpStatus'] =
    hoursAgo > 72 ? 'overdue' : hoursAgo > 48 ? 'due_today' : 'on_track'

  // Days in stage (simulated)
  const daysInStage = 1 + (h % 14)

  // AI reasoning
  const pool = score >= 65 ? REASONING_POOL.high_score : score >= 35 ? REASONING_POOL.medium_score : REASONING_POOL.low_score
  const extra = trend === 'improving' ? REASONING_POOL.improving : []
  const allReasons = [...pool, ...extra]
  const reasoning: string[] = []
  for (let i = 0; i < Math.min(4, allReasons.length); i++) {
    reasoning.push(allReasons[(h + i * 7) % allReasons.length])
  }
  const deduped = [...new Set(reasoning)]

  // AI alerts (0–2)
  const alerts: string[] = []
  if (h % 3 === 0) alerts.push(ALERTS_POOL[h % ALERTS_POOL.length])
  if (h % 5 === 0) alerts.push(ALERTS_POOL[(h + 3) % ALERTS_POOL.length])

  // Close probability
  const closeProbability = Math.min(98, Math.round(
    (score * 0.7) + (trend === 'improving' ? 15 : trend === 'declining' ? -10 : 0) + (hoursAgo < 24 ? 8 : 0)
  ))

  // Expected close
  const expectedCloseLabel =
    closeProbability >= 85 ? 'Today' :
    closeProbability >= 65 ? 'This Week' :
    closeProbability >= 45 ? 'This Month' : 'Uncertain'

  const isEarlySignal = score < 30 && hoursAgo < 48

  return {
    ...lead,
    _pipelineStage: ps,
    buyingIntensity,
    potentialValue,
    valueRangeLow: potentialValue - spread,
    valueRangeHigh: potentialValue + spread,
    valueConfidence: Math.round(valueConfidence),
    nextAction,
    actionUrgency,
    followUpStatus,
    daysInStage,
    aiReasoning: deduped,
    bant,
    scoreBreakdown: { budget, urgency, intent, trust, engagement },
    aiAlerts: alerts,
    isEarlySignal,
    closeProbability,
    expectedCloseLabel,
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatValue(n: number) {
  return `K${n.toLocaleString()}`
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`
  return `${Math.floor(diff / 10080)}wk ago`
}

function scoreTier(score: number) {
  if (score >= 70) return { label: 'Hot', fg: 'text-red-700', bg: 'bg-red-100', dot: 'bg-red-500', bar: 'bg-red-500' }
  if (score >= 40) return { label: 'Warm', fg: 'text-amber-700', bg: 'bg-amber-100', dot: 'bg-amber-400', bar: 'bg-amber-400' }
  return { label: 'Cold', fg: 'text-blue-700', bg: 'bg-blue-100', dot: 'bg-blue-400', bar: 'bg-blue-400' }
}

function bantColor(level: BANTLevel) {
  return level === 'High' ? 'bg-green-100 text-green-800' : level === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
}

// ─── ScoreMeter ───────────────────────────────────────────────────────────────

function ScoreMeter({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const tier = scoreTier(score)
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full overflow-hidden ${size === 'lg' ? 'h-2' : 'h-1.5'} bg-gray-100`}>
        <div className={`h-full rounded-full transition-all ${tier.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-bold tabular-nums ${size === 'lg' ? 'text-sm' : 'text-xs'} text-gray-800 w-7 text-right`}>{score}</span>
    </div>
  )
}

// ─── Stage badge ──────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: PipelineStage }) {
  const s = STAGES.find(x => x.key === stage)!
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.color} ${s.bg} ${s.border}`}>
      {s.label}
    </span>
  )
}

// ─── Follow-up indicator ──────────────────────────────────────────────────────

function FollowUpDot({ status }: { status: AiEnrichedLead['followUpStatus'] }) {
  if (status === 'overdue') return <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Overdue follow-up" />
  if (status === 'due_today') return <span className="w-2 h-2 rounded-full bg-amber-400" title="Follow-up due today" />
  return <span className="w-2 h-2 rounded-full bg-green-400" title="On track" />
}

// ─── Buying intensity badge ───────────────────────────────────────────────────

function IntensityBadge({ intensity }: { intensity: BuyingIntensity }) {
  const cfg: Record<BuyingIntensity, string> = {
    'Extreme':    'bg-red-600 text-white',
    'Very High':  'bg-red-100 text-red-800',
    'High':       'bg-orange-100 text-orange-800',
    'Medium':     'bg-amber-100 text-amber-800',
    'Low':        'bg-blue-100 text-blue-700',
    'Detecting…': 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg[intensity]}`}>{intensity}</span>
  )
}

// ─── AI Sales Feed Card ───────────────────────────────────────────────────────

function AiSalesFeedCard({
  lead,
  onOpen,
  onDismiss,
}: {
  lead: AiEnrichedLead
  onOpen: () => void
  onDismiss: () => void
}) {
  const isExtreme = lead.buyingIntensity === 'Extreme'
  const isVeryHigh = lead.buyingIntensity === 'Very High'

  return (
    <div className={`rounded-xl border p-3.5 transition-all ${isExtreme ? 'border-red-200 bg-red-50' : isVeryHigh ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-2.5 mb-2">
        <Avatar name={lead.name} src={lead.avatarUrl ?? undefined} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(isExtreme || isVeryHigh) && <Flame className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
            <span className="text-sm font-semibold text-gray-900 truncate">{lead.name}</span>
            {lead.isEarlySignal && (
              <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Early Signal</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <IntensityBadge intensity={lead.buyingIntensity} />
            <span className="text-[11px] text-gray-500 font-medium">{lead.closeProbability}% close prob.</span>
          </div>
        </div>
        <button onClick={onDismiss} className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ul className="space-y-1 mb-3">
        {lead.aiReasoning.slice(0, 3).map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
            <span className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
            {r}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-[11px] font-medium bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View
        </button>
        <button className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          <Send className="w-3 h-3" />
          Quote
        </button>
        <button className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          <Phone className="w-3 h-3" />
          Call
        </button>
      </div>
    </div>
  )
}

// ─── Lead Card (Kanban + List) ────────────────────────────────────────────────

function LeadCard({
  lead,
  onClick,
  compact = false,
}: {
  lead: AiEnrichedLead
  onClick: () => void
  compact?: boolean
}) {
  const tier = scoreTier(lead.leadScore ?? 0)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-200 group ${compact ? 'p-3' : 'p-4'}`}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="relative flex-shrink-0">
          <Avatar name={lead.name} src={lead.avatarUrl ?? undefined} size="sm" />
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${tier.dot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
            {lead.aiAlerts.length > 0 && (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
          </div>
          {lead.company && <p className="text-[11px] text-gray-500 truncate">{lead.company}</p>}
        </div>
      </div>

      {/* Score */}
      {lead.leadScore !== undefined && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">AI Score</span>
            <IntensityBadge intensity={lead.buyingIntensity} />
          </div>
          <ScoreMeter score={lead.leadScore} />
        </div>
      )}

      {/* Value row */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Est. Value</p>
          <p className="text-sm font-bold text-gray-800">{formatValue(lead.potentialValue)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Close</p>
          <p className="text-sm font-semibold text-gray-700">{lead.expectedCloseLabel}</p>
        </div>
      </div>

      {/* Next action */}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-2.5 ${
        lead.actionUrgency === 'overdue' ? 'bg-red-50 border border-red-100' :
        lead.actionUrgency === 'today'   ? 'bg-amber-50 border border-amber-100' :
                                           'bg-gray-50'
      }`}>
        {lead.actionUrgency === 'overdue' ? <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" /> :
         lead.actionUrgency === 'today'   ? <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" /> :
                                            <Zap className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
        <span className={`text-[10px] font-medium truncate ${
          lead.actionUrgency === 'overdue' ? 'text-red-700' :
          lead.actionUrgency === 'today'   ? 'text-amber-700' :
                                             'text-gray-600'
        }`}>{lead.nextAction}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-50 pt-2">
        <div className="flex items-center gap-1.5">
          <FollowUpDot status={lead.followUpStatus} />
          <span className="text-[10px] text-gray-400">{formatLastSeen(lead.lastMessageAt)}</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tier.bg} ${tier.fg}`}>
          {tier.label}
        </span>
      </div>
    </button>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  onLeadClick,
}: {
  stage: typeof STAGES[number]
  leads: AiEnrichedLead[]
  onLeadClick: (lead: AiEnrichedLead) => void
}) {
  const totalValue = leads.reduce((s, l) => s + l.potentialValue, 0)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex-shrink-0 w-64 flex flex-col max-h-full">
      {/* Column header */}
      <div className={`flex items-center justify-between p-2.5 rounded-xl mb-2 ${stage.bg} border ${stage.border}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${stage.color}`}>{stage.label}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/70 ${stage.color}`}>
            {leads.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {leads.length > 0 && (
            <span className="text-[10px] text-gray-500 font-medium">{formatValue(totalValue)}</span>
          )}
          <button onClick={() => setCollapsed(c => !c)} className="p-0.5 rounded hover:bg-white/60 transition-colors">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ minHeight: 120 }}>
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-gray-100">
              <p className="text-[11px] text-gray-400">No leads</p>
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} compact />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Lead Detail Panel ────────────────────────────────────────────────────────

function LeadDetailPanel({ lead, onClose }: { lead: AiEnrichedLead; onClose: () => void }) {
  const router = useRouter()
  const tier = scoreTier(lead.leadScore ?? 0)
  const stageInfo = STAGES.find(s => s.key === lead._pipelineStage)!

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate">{lead.name}</h2>
          {lead.company && <p className="text-xs text-gray-500 truncate">{lead.company}</p>}
        </div>
        <button
          onClick={() => router.push(`/contacts/${lead.id}`)}
          className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Full Profile
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* AI Alerts */}
        {lead.aiAlerts.length > 0 && (
          <div className="space-y-1.5">
            {lead.aiAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs text-amber-800 font-medium">{alert}</span>
              </div>
            ))}
          </div>
        )}

        {/* Score + stage */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-0.5">AI Lead Score</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-gray-900">{lead.leadScore ?? 0}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.bg} ${tier.fg}`}>{tier.label}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Pipeline</p>
              <StagePill stage={lead._pipelineStage} />
            </div>
          </div>
          <ScoreMeter score={lead.leadScore ?? 0} size="lg" />

          {/* Score breakdown */}
          <div className="mt-3 space-y-1.5">
            {(
              [
                ['Intent',     lead.scoreBreakdown.intent,    30, 'bg-indigo-500'],
                ['Budget',     lead.scoreBreakdown.budget,    25, 'bg-green-500'],
                ['Urgency',    lead.scoreBreakdown.urgency,   20, 'bg-amber-500'],
                ['Trust',      lead.scoreBreakdown.trust,     15, 'bg-purple-500'],
                ['Engagement', lead.scoreBreakdown.engagement, 10, 'bg-blue-500'],
              ] as [string, number, number, string][]
            ).map(([label, value, max, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-16 flex-shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
                </div>
                <span className="text-[10px] font-bold text-gray-700 w-4 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Reasoning */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Brain className="w-3.5 h-3.5 text-indigo-500" />
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Why this score?</h3>
          </div>
          <ul className="space-y-1.5">
            {lead.aiReasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
            {lead.isEarlySignal && (
              <li className="flex items-start gap-2 text-sm text-purple-700">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                Early buying signal — only a few messages so far
              </li>
            )}
          </ul>
        </div>

        {/* Opportunity value */}
        <div className="bg-green-50 border border-green-100 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <h3 className="text-xs font-bold text-green-800 uppercase tracking-wide">Opportunity Value</h3>
          </div>
          <p className="text-xl font-black text-green-800 mb-0.5">{formatValue(lead.potentialValue)}</p>
          <p className="text-xs text-green-600">
            Range {formatValue(lead.valueRangeLow)}–{formatValue(lead.valueRangeHigh)} · {lead.valueConfidence}% confidence
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-green-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${lead.closeProbability}%` }} />
            </div>
            <span className="text-xs font-bold text-green-700">{lead.closeProbability}%</span>
          </div>
          <p className="text-[11px] text-green-600 mt-1">Expected close: <strong>{lead.expectedCloseLabel}</strong></p>
        </div>

        {/* Next best action */}
        <div className={`rounded-xl p-3.5 border ${
          lead.actionUrgency === 'overdue' ? 'bg-red-50 border-red-200' :
          lead.actionUrgency === 'today'   ? 'bg-amber-50 border-amber-200' :
                                             'bg-indigo-50 border-indigo-100'
        }`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target className={`w-3.5 h-3.5 ${
              lead.actionUrgency === 'overdue' ? 'text-red-600' :
              lead.actionUrgency === 'today' ? 'text-amber-600' : 'text-indigo-600'
            }`} />
            <h3 className={`text-xs font-bold uppercase tracking-wide ${
              lead.actionUrgency === 'overdue' ? 'text-red-800' :
              lead.actionUrgency === 'today' ? 'text-amber-800' : 'text-indigo-800'
            }`}>Next Best Action</h3>
          </div>
          <p className={`text-sm font-semibold ${
            lead.actionUrgency === 'overdue' ? 'text-red-700' :
            lead.actionUrgency === 'today' ? 'text-amber-700' : 'text-indigo-700'
          }`}>{lead.nextAction}</p>
          {lead.actionUrgency !== 'normal' && (
            <p className={`text-xs mt-1 ${lead.actionUrgency === 'overdue' ? 'text-red-600' : 'text-amber-600'}`}>
              {lead.actionUrgency === 'overdue' ? 'Overdue — act now to prevent losing this lead' : 'Do this today'}
            </p>
          )}
        </div>

        {/* BANT */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Award className="w-3.5 h-3.5 text-indigo-500" />
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">AI Qualification (BANT)</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['Budget', lead.bant.budget, DollarSign],
                ['Authority', lead.bant.authority, Users],
                ['Need', lead.bant.need, Target],
                ['Timeline', lead.bant.timeline, Calendar],
              ] as [string, BANTLevel, React.ElementType][]
            ).map(([label, level, Icon]) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500">{label}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bantColor(level)}`}>{level}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Buying intensity + AI stage */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Buying Intensity</p>
              <IntensityBadge intensity={lead.buyingIntensity} />
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Days in Stage</p>
              <p className="text-sm font-bold text-gray-800">{lead.daysInStage}d</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
            <Send className="w-4 h-4" />
            Send Quote
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              <MessageSquare className="w-4 h-4" />
              Open Chat
            </button>
            <button className="flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              <Phone className="w-4 h-4" />
              Call
            </button>
          </div>
          <button
            onClick={() => router.push(`/contacts/${lead.id}`)}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Full Contact Profile
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sales Copilot ────────────────────────────────────────────────────────────

const COPILOT_QUESTIONS = [
  'Which leads should I call today?',
  'Who is most likely to buy this week?',
  'Which opportunities are at risk?',
  'Why did I lose deals this month?',
  'Who is ready for an upsell?',
]

const COPILOT_ANSWERS: Record<string, string> = {
  'Which leads should I call today?':
    'Based on buying signals and recency, I recommend calling your top 3 Hot leads first — they all messaged within the last 6 hours. Leads in the Negotiating stage with overdue follow-ups should be your second priority.',
  'Who is most likely to buy this week?':
    'Your Negotiating-stage leads with a buy probability above 80% are most likely to close this week. Focus on those who asked about delivery or confirmed product specifications.',
  'Which opportunities are at risk?':
    'Leads that haven\'t received a follow-up in 72+ hours are at risk of going cold. Check your overdue follow-up indicators (red dots) and prioritise those in the Quote Sent stage.',
  'Why did I lose deals this month?':
    'The most common loss reason this month is delayed follow-up — leads who went 5+ days without a response overwhelmingly moved to competitors. Consider setting a 24-hour follow-up rule.',
  'Who is ready for an upsell?':
    'Your Won customers who haven\'t been contacted in 30+ days and have a high trust score are the best upsell candidates. They already know your product and trust your service.',
}

function SalesCopilot({ leads }: { leads: AiEnrichedLead[] }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([])

  const hotCount = leads.filter(l => (l.leadScore ?? 0) >= 70).length
  const totalValue = leads.reduce((s, l) => s + l.potentialValue, 0)

  function sendMessage(text: string) {
    const q = text || input.trim()
    if (!q) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    const answer = COPILOT_ANSWERS[q] ??
      `Based on your current pipeline of ${leads.length} leads (${hotCount} hot, estimated ${formatValue(totalValue)} total value), I recommend focusing on your highest-scoring contacts with overdue follow-ups first.`
    setTimeout(() => {
      setMessages(m => [...m, { role: 'ai', text: answer }])
    }, 600)
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 bg-indigo-600 text-white shadow-xl rounded-2xl px-4 py-3 hover:bg-indigo-700 transition-all ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <Bot className="w-5 h-5" />
        <span className="text-sm font-semibold hidden sm:inline">Sales Copilot</span>
        {hotCount > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-px">{hotCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-96 sm:bottom-6 sm:right-6 sm:rounded-2xl shadow-2xl border border-gray-200 bg-white flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
          {/* Panel header */}
          <div className="flex items-center gap-2.5 p-4 bg-gradient-to-r from-indigo-600 to-violet-600">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Sales Copilot</p>
              <p className="text-[11px] text-indigo-200">Ask anything about your pipeline</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">Suggested questions:</p>
                {COPILOT_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 hover:bg-indigo-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
              placeholder="Ask about your pipeline…"
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            <button
              onClick={() => sendMessage(input)}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Revenue Forecast ─────────────────────────────────────────────────────────

function RevenueForecast({ leads }: { leads: AiEnrichedLead[] }) {
  const [expanded, setExpanded] = useState(false)

  const weekLeads  = leads.filter(l => l.expectedCloseLabel === 'Today' || l.expectedCloseLabel === 'This Week')
  const monthLeads = leads.filter(l => l.expectedCloseLabel !== 'Uncertain')
  const weekValue  = weekLeads.reduce((s, l) => s + l.potentialValue * (l.closeProbability / 100), 0)
  const monthValue = monthLeads.reduce((s, l) => s + l.potentialValue * (l.closeProbability / 100), 0)

  const stages = STAGES.filter(s => s.key !== 'lost')
  const stageCounts = stages.map(s => ({
    ...s,
    count: leads.filter(l => l._pipelineStage === s.key).length,
  }))
  const maxCount = Math.max(1, ...stageCounts.map(s => s.count))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mx-4 md:mx-6 mb-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-bold text-gray-800">Revenue Forecast</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:inline">
            This week: <strong className="text-gray-800">{formatValue(Math.round(weekValue / 1000) * 1000)}</strong>
            &nbsp;·&nbsp;
            This month: <strong className="text-gray-800">{formatValue(Math.round(monthValue / 1000) * 1000)}</strong>
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-indigo-50 rounded-xl p-3">
              <p className="text-[11px] text-indigo-600 font-medium mb-0.5">This Week</p>
              <p className="text-lg font-black text-indigo-800">{formatValue(Math.round(weekValue / 100) * 100)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-[11px] text-green-600 font-medium mb-0.5">This Month</p>
              <p className="text-lg font-black text-green-800">{formatValue(Math.round(monthValue / 100) * 100)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-gray-600 font-medium mb-0.5">Pipeline Total</p>
              <p className="text-lg font-black text-gray-800">{formatValue(leads.reduce((s, l) => s + l.potentialValue, 0))}</p>
            </div>
          </div>

          {/* Stage distribution bar chart */}
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mb-2">Stage Distribution</p>
          <div className="space-y-1.5">
            {stageCounts.filter(s => s.count > 0).map(s => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={`text-[10px] w-20 flex-shrink-0 font-medium ${s.color}`}>{s.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.bar}`}
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [pipelineFilter, setPipelineFilter] = useState<PipelineStage | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('score')
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [selectedLead, setSelectedLead] = useState<AiEnrichedLead | null>(null)
  const [showAiFeed, setShowAiFeed] = useState(true)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const { data, loading, error } = useApi<{ contacts: Lead[] }>('/api/contacts', token)
  const allContacts = data?.contacts ?? []
  const rawLeads = allContacts.filter(c => c.leadScore !== undefined)

  const enrichedLeads = useMemo(() => rawLeads.map(enrichLead), [rawLeads])

  // KPI metrics
  const kpis = useMemo(() => {
    const hot = enrichedLeads.filter(l => (l.leadScore ?? 0) >= 70)
    const waitingFollowup = enrichedLeads.filter(l => l.followUpStatus !== 'on_track')
    const totalValue = enrichedLeads.reduce((s, l) => s + l.potentialValue, 0)
    const won = enrichedLeads.filter(l => l._pipelineStage === 'won')
    const closed = enrichedLeads.filter(l => l._pipelineStage === 'won' || l._pipelineStage === 'lost')
    const convRate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0
    const avgConfidence = enrichedLeads.length > 0
      ? Math.round(enrichedLeads.reduce((s, l) => s + l.valueConfidence, 0) / enrichedLeads.length)
      : 0
    return {
      total: enrichedLeads.length,
      hot: hot.length,
      waitingFollowup: waitingFollowup.length,
      totalValue,
      convRate,
      avgConfidence,
    }
  }, [enrichedLeads])

  // AI Sales Feed items (hot + very high + early signals, not dismissed)
  const feedLeads = useMemo(() =>
    enrichedLeads
      .filter(l => !dismissedIds.has(l.id) && (
        l.buyingIntensity === 'Extreme' ||
        l.buyingIntensity === 'Very High' ||
        l.isEarlySignal ||
        l.actionUrgency === 'overdue'
      ))
      .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
      .slice(0, 8),
    [enrichedLeads, dismissedIds]
  )

  // Filtered + sorted leads
  const filteredLeads = useMemo(() => {
    let result = enrichedLeads.filter(l => {
      if (search) {
        const q = search.toLowerCase()
        const match = l.name.toLowerCase().includes(q) ||
          (l.company ?? '').toLowerCase().includes(q) ||
          (l.phone ?? '').includes(q)
        if (!match) return false
      }
      const score = l.leadScore ?? 0
      if (stageFilter === 'hot'  && score < 70) return false
      if (stageFilter === 'warm' && (score < 40 || score >= 70)) return false
      if (stageFilter === 'cold' && score >= 40) return false
      if (pipelineFilter !== 'all' && l._pipelineStage !== pipelineFilter) return false
      return true
    })
    return [...result].sort((a, b) => {
      if (sort === 'score') return (b.leadScore ?? 0) - (a.leadScore ?? 0)
      if (sort === 'value') return b.potentialValue - a.potentialValue
      if (sort === 'name')  return a.name.localeCompare(b.name)
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }, [enrichedLeads, search, stageFilter, pipelineFilter, sort])

  const dismissFeedLead = useCallback((id: string) => {
    setDismissedIds(s => new Set([...s, id]))
  }, [])

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 md:p-6 border-b border-gray-100">
          <div className="h-8 w-32 bg-gray-200 rounded-lg animate-pulse mb-1" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-black text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {enrichedLeads.length > 0 ? `${enrichedLeads.length} leads · ${kpis.hot} hot · ${formatValue(kpis.totalValue)} pipeline` : 'AI-powered sales pipeline'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowAiFeed(f => !f)}
              className={`hidden md:flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                showAiFeed ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Feed
            </button>
            <button className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              New Lead
            </button>
          </div>
        </div>

        {/* Search + filters row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, company, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-shrink-0"
          >
            <option value="score">Score ↓</option>
            <option value="value">Value ↓</option>
            <option value="recent">Recent</option>
            <option value="name">Name</option>
          </select>
          {/* View toggle (desktop) */}
          <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${viewMode === 'kanban' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Layers className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Activity className="w-3.5 h-3.5" />
              List
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            {/* Hot/Warm/Cold */}
            <div className="flex items-center gap-1.5">
              {(['all', 'hot', 'warm', 'cold'] as StageFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    stageFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200" />
            {/* Pipeline stage */}
            <select
              value={pipelineFilter}
              onChange={e => setPipelineFilter(e.target.value as PipelineStage | 'all')}
              className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <FeatureGate
        modes={['business', 'hybrid']}
        fallback={
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <Flame className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Leads is a Business feature</h3>
              <p className="text-sm text-gray-500 mb-5">Switch to Business or Hybrid mode to access AI lead scoring and pipeline management.</p>
              <a href="/settings" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                Go to Settings
              </a>
            </div>
          </div>
        }
      >
        {/* ── KPI strip ── */}
        {enrichedLeads.length > 0 && (
          <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex-shrink-0">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Total Leads',         value: kpis.total,                           icon: <Users className="w-4 h-4" />,       fg: 'text-gray-600',   bg: 'bg-gray-50' },
                { label: 'Hot Leads',            value: kpis.hot,                             icon: <Flame className="w-4 h-4" />,       fg: 'text-red-600',    bg: 'bg-red-50' },
                { label: 'Need Follow-up',       value: kpis.waitingFollowup,                icon: <Clock className="w-4 h-4" />,       fg: 'text-amber-600',  bg: 'bg-amber-50' },
                { label: 'Pipeline Value',       value: formatValue(kpis.totalValue),         icon: <DollarSign className="w-4 h-4" />, fg: 'text-green-600',  bg: 'bg-green-50' },
                { label: 'Conversion Rate',      value: `${kpis.convRate}%`,                  icon: <TrendingUp className="w-4 h-4" />, fg: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'AI Confidence',        value: `${kpis.avgConfidence}%`,             icon: <Brain className="w-4 h-4" />,       fg: 'text-purple-600', bg: 'bg-purple-50' },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-xl p-2.5`}>
                  <div className={`flex items-center gap-1 mb-1 ${k.fg}`}>
                    {k.icon}
                    <span className="text-[10px] font-medium text-gray-500 truncate">{k.label}</span>
                  </div>
                  <p className="text-base font-black text-gray-900 tabular-nums">{k.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error / empty ── */}
        {error && (
          <div className="p-4 md:p-6">
            <EmptyState
              icon={<AlertTriangle className="w-10 h-10 text-amber-400" />}
              title="Couldn't load leads"
              description="Make sure the API server is running."
            />
          </div>
        )}

        {!error && enrichedLeads.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Zuri is listening for leads</h3>
              <p className="text-sm text-gray-500 mb-5">
                As soon as buying signals appear in your WhatsApp conversations — a price question, a delivery request, a catalogue enquiry — Zuri will detect the lead and show it here automatically.
              </p>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-left mb-5">
                <p className="text-xs font-bold text-indigo-800 mb-2">What Zuri detects:</p>
                <ul className="space-y-1">
                  {[
                    'Pricing questions',
                    'Delivery or stock enquiries',
                    'Requests for quotes or catalogues',
                    'Budget mentions',
                    'Urgent buying language',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-indigo-700">
                      <CheckCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />
                Add Lead Manually
              </button>
            </div>
          </div>
        )}

        {!error && enrichedLeads.length > 0 && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Revenue forecast */}
            <div className="flex-shrink-0 pt-3">
              <RevenueForecast leads={enrichedLeads} />
            </div>

            {/* ── AI Sales Feed (mobile — collapsible banner) ── */}
            {feedLeads.length > 0 && (
              <div className="md:hidden flex-shrink-0 mx-4 mb-3">
                <details className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none">
                    <Sparkles className="w-4 h-4 text-white" />
                    <span className="text-sm font-bold text-white flex-1">AI Sales Feed</span>
                    <span className="bg-white/25 text-white text-[10px] font-bold rounded-full px-2 py-0.5">{feedLeads.length}</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2 bg-gray-50 border-t border-indigo-500/30">
                    <div className="pt-2" />
                    {feedLeads.map(lead => (
                      <AiSalesFeedCard
                        key={lead.id}
                        lead={lead}
                        onOpen={() => setSelectedLead(lead)}
                        onDismiss={() => dismissFeedLead(lead.id)}
                      />
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* ── Main content area ── */}
            <div className="flex-1 overflow-hidden flex gap-0">

              {/* Kanban / List */}
              <div className="flex-1 overflow-hidden flex flex-col min-w-0">

                {/* Kanban (desktop md+, if viewMode === kanban) */}
                {viewMode === 'kanban' && (
                  <div className="hidden md:flex flex-1 overflow-x-auto gap-3 px-4 md:px-6 pb-4 pt-1 min-h-0" style={{ alignItems: 'flex-start' }}>
                    {STAGES.map(stage => (
                      <KanbanColumn
                        key={stage.key}
                        stage={stage}
                        leads={filteredLeads.filter(l => l._pipelineStage === stage.key)}
                        onLeadClick={setSelectedLead}
                      />
                    ))}
                  </div>
                )}

                {/* List view (always on mobile, optional on desktop) */}
                <div className={`flex-1 overflow-y-auto px-4 md:px-6 pb-4 pt-1 ${viewMode === 'kanban' ? 'md:hidden' : ''}`}>
                  {filteredLeads.length === 0 ? (
                    <EmptyState
                      icon={<Search className="w-10 h-10 text-gray-400" />}
                      title="No leads match"
                      description={search ? `No results for "${search}"` : 'Try changing the filter.'}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredLeads.map(lead => (
                        <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── AI Sales Feed sidebar (desktop) ── */}
              {showAiFeed && feedLeads.length > 0 && (
                <div className="hidden md:flex flex-col w-72 flex-shrink-0 border-l border-gray-100 overflow-y-auto">
                  <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center gap-2 z-10">
                    <Sparkles className="w-4 h-4 text-white" />
                    <span className="text-sm font-bold text-white flex-1">AI Sales Feed</span>
                    <span className="bg-white/25 text-white text-[10px] font-bold rounded-full px-2 py-0.5">{feedLeads.length}</span>
                  </div>
                  <div className="p-3 space-y-3 flex-1">
                    {feedLeads.map(lead => (
                      <AiSalesFeedCard
                        key={lead.id}
                        lead={lead}
                        onOpen={() => setSelectedLead(lead)}
                        onDismiss={() => dismissFeedLead(lead.id)}
                      />
                    ))}
                    {feedLeads.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12">
                        <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
                        <p className="text-xs text-gray-500 text-center">All caught up — no urgent leads right now.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lead detail panel ── */}
        {selectedLead && (
          <>
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
              onClick={() => setSelectedLead(null)}
            />
            <div className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-96 shadow-2xl border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
            </div>
          </>
        )}

        {/* ── Sales Copilot ── */}
        <SalesCopilot leads={enrichedLeads} />
      </FeatureGate>
    </div>
  )
}
