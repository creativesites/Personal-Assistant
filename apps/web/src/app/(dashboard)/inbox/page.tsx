'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, ChevronLeft, Zap, RefreshCw, X, MessageSquare,
  AlertCircle, Send, Paperclip, Smile, Archive, StickyNote,
  ExternalLink, ChevronRight, TrendingUp, Clock, Flame, Star,
  AlertTriangle, Calendar, DollarSign, CheckCircle, XCircle,
  Sparkles, Brain, Bell, Tag, Edit3, Copy, UserPlus, CreditCard,
  UserCheck, FileText, WifiOff, Lightbulb, Activity,
  ShoppingCart, MessageCircle, MapPin, Download, Film,
  Image, Phone, Mic, Target, Hash, BarChart2,
  ChevronDown, Heart, TrendingDown, Wand2,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, EmptyState, HealthBar, SkeletonListItem } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  name: string
  phone?: string
  avatarUrl: string | null
  tags?: string[]
  leadScore?: number
  lifetimeValue?: number
  pipelineStage?: string
  customerSince?: string
  lastPurchase?: string
  avgOrderValue?: number
  preferredProducts?: string[]
  communicationStyle?: string
  location?: string
}

interface ContactInsight {
  key: string
  value: string
  confidence: number
  supportingText: string | null
  createdAt: string
}

interface HealthHistoryEntry {
  score: number
  previousScore: number | null
  changeReason: string | null
  factors: unknown
  recordedAt: string
}

interface ProactiveSuggestion {
  id: string
  suggestionType: string
  title: string
  body: string
  draftMessage: string | null
  priority: number
}

interface UpcomingEvent {
  id: string
  eventType: string
  title: string
  eventDate: string
  isRecurring: boolean
  confidence: number
}

interface ContactPromise {
  text: string
  detectedAt: string
  messageAt: string
}

interface ContactDetail {
  id: string
  name: string
  email: string | null
  company: string | null
  jobTitle: string | null
  industry: string | null
  website: string | null
  notes: string | null
  customerStatus: string | null
  pipelineStage: string | null
  leadScore: number | null
  tags: string[]
  relationship: {
    type: string
    importanceTier: number
    healthScore: number
    healthTrend: string
    lastInteractionAt: string | null
    notes: string | null
  }
  profile: {
    personalitySummary: string | null
    communicationStyle: string | null
    emotionalPatterns: string | null
    knownTriggers: string | null
    currentLifeContext: string | null
    moodBaseline: string | null
    preferences: string | null
    goals: string | null
    painPoints: string | null
    buyingBehaviour: string | null
    relationshipStage: string | null
  } | null
  insights: ContactInsight[]
  healthHistory: HealthHistoryEntry[]
  proactiveSuggestions: ProactiveSuggestion[]
  upcomingEvents: UpcomingEvent[]
  stats: { totalMessages: number; sent: number; received: number }
}

interface Conversation {
  id: string
  contact: Contact
  relationshipType: string
  healthScore: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  aiPriority?: 'hot_lead' | 'ready_to_buy' | 'needs_followup' | 'loyal' | 'dissatisfied' | 'appointment' | 'waiting' | null
  sentiment?: 'happy' | 'neutral' | 'frustrated' | 'angry' | null
  slaMinutes?: number | null
  leadScore?: number
}

interface Message {
  id: string
  senderType: 'user' | 'contact'
  messageType?: string
  body: string | null
  timestamp: string
  pendingSuggestions: number
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
  quotedMessageId?: string | null
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  approvalMode?: 'manual' | 'approved' | 'autonomous'
}

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
  confidence?: number
}

interface InternalNote {
  id: string
  text: string
  author: string
  createdAt: string
}

interface TimelineEvent {
  id: string
  type: 'message' | 'purchase' | 'invoice' | 'note' | 'followup' | 'complaint' | 'appointment'
  label: string
  date: string
}

interface BriefingData {
  waitingCount: number
  highIntentCount: number
  slaBreachCount: number
  vipCount: number
  items: string[]
}

interface ConvContext {
  contactName: string | null
  summary: string | null
  dominantSentiment: string
  intents: string[]
  topTopics: string[]
  buyingSignals: string[]
  nextAction: string
  requiresResponse: boolean
  urgency: 'high' | 'normal'
  moodBaseline: string | null
  communicationStyle: string | null
  personalitySummary: string | null
  insights: Array<{ key: string; value: string; confidence: number }>
  analysedAt: string | null
}

interface AIInsight {
  type: 'opportunity' | 'alert' | 'entity'
  text: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_PRIORITY: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  hot_lead:       { label: 'Hot Lead',     color: 'bg-red-50 text-red-700 border-red-200',             icon: Flame },
  ready_to_buy:   { label: 'Ready to Buy', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: DollarSign },
  needs_followup: { label: 'Follow-up',    color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertTriangle },
  loyal:          { label: 'VIP',          color: 'bg-purple-50 text-purple-700 border-purple-200',    icon: Star },
  dissatisfied:   { label: 'At Risk',      color: 'bg-rose-50 text-rose-700 border-rose-200',          icon: XCircle },
  appointment:    { label: 'Appt Today',   color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Calendar },
  waiting:        { label: 'Waiting',      color: 'bg-gray-100 text-gray-600 border-gray-200',         icon: Clock },
}

const SENTIMENT_DOT: Record<string, string> = {
  happy: 'bg-emerald-400', neutral: 'bg-gray-300',
  frustrated: 'bg-amber-400', angry: 'bg-red-500',
}

const TONE_STYLE: Record<string, string> = {
  friendly:     'bg-emerald-50 text-emerald-900 border-emerald-200',
  professional: 'bg-blue-50 text-blue-900 border-blue-200',
  empathetic:   'bg-purple-50 text-purple-900 border-purple-200',
  casual:       'bg-gray-50 text-gray-800 border-gray-200',
  urgent:       'bg-amber-50 text-amber-900 border-amber-200',
  sales:        'bg-orange-50 text-orange-900 border-orange-200',
  direct:       'bg-slate-50 text-slate-800 border-slate-200',
  firm:         'bg-slate-50 text-slate-800 border-slate-200',
}

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'unread',      label: 'Unread' },
  { id: 'needs_reply', label: 'Needs Reply' },
  { id: 'hot_leads',   label: 'Hot Leads' },
  { id: 'vip',         label: 'VIP' },
  { id: 'waiting',     label: 'Waiting' },
  { id: 'at_risk',     label: 'At Risk' },
] as const

const MOCK_ACTIONS = [
  { label: 'Follow up tomorrow', icon: Bell },
  { label: 'Offer 10% discount', icon: Tag },
  { label: 'Send catalogue',     icon: FileText },
  { label: 'Book appointment',   icon: Calendar },
  { label: 'Create invoice',     icon: CreditCard },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function mediaHref(path: string, token?: string | null): string {
  const base = `${API_BASE}${path}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

function formatTime(ts: string | null) {
  if (!ts) return ''
  const d = new Date(ts)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffDays = Math.floor(diffMin / 1440)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatSLA(min: number) {
  if (min < 60) return `${min}m`
  if (min < 1440) return `${Math.round(min / 60)}h`
  return `${Math.round(min / 1440)}d`
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── MessageContent ───────────────────────────────────────────────────────────

function MessageContent({ msg, token, isUser }: { msg: Message; token?: string | null; isUser: boolean }) {
  const mType = msg.messageType ?? 'text'
  const textClass = `leading-relaxed whitespace-pre-wrap text-sm ${isUser ? 'text-white' : 'text-gray-900'}`

  if (mType === 'deleted') {
    return (
      <p className={`italic opacity-60 text-sm ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}>
        This message was deleted
      </p>
    )
  }

  if (mType === 'location' && msg.body) {
    try {
      const loc = JSON.parse(msg.body) as { lat: number; lng: number; name?: string; address?: string }
      const mapsUrl = `https://maps.google.com/?q=${loc.lat},${loc.lng}`
      return (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className={`flex items-center gap-2 text-sm underline-offset-2 hover:underline ${isUser ? 'text-indigo-100' : 'text-indigo-600'}`}>
          <MapPin size={14} className="flex-shrink-0" />
          <span>{loc.name ?? loc.address ?? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}</span>
          <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
        </a>
      )
    } catch {
      return <p className={textClass}>{msg.body}</p>
    }
  }

  if (mType === 'contact_card') {
    return (
      <div className={`flex items-center gap-2 text-sm ${isUser ? 'text-indigo-100' : 'text-gray-700'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-indigo-500' : 'bg-gray-100'}`}>
          <Phone size={13} className={isUser ? 'text-white' : 'text-gray-500'} />
        </div>
        <span>{msg.body ?? 'Contact card'}</span>
      </div>
    )
  }

  if (mType === 'image' || mType === 'sticker') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={msg.body ?? 'Image'} className="max-w-[220px] rounded-lg object-cover" style={{ maxHeight: 220 }} />
          {msg.body && <p className={textClass}>{msg.body}</p>}
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-2 text-sm ${isUser ? 'text-indigo-100' : 'text-gray-500'}`}>
        <Image size={14} />
        <span>{msg.body ?? (mType === 'sticker' ? 'Sticker' : 'Photo')}</span>
      </div>
    )
  }

  if (mType === 'video') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1">
          <video src={href} controls className="max-w-[220px] rounded-lg" style={{ maxHeight: 180 }} />
          {msg.body && <p className={textClass}>{msg.body}</p>}
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-2 text-sm ${isUser ? 'text-indigo-100' : 'text-gray-500'}`}>
        <Film size={14} />
        <span>{msg.body ?? 'Video'}</span>
      </div>
    )
  }

  if (mType === 'audio') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1.5">
          <audio controls src={href} className="max-w-full h-9" style={{ minWidth: 180 }} />
          {msg.transcription && (
            <p className={`text-xs italic ${isUser ? 'text-indigo-200' : 'text-gray-500'}`}>
              "{msg.transcription}"
            </p>
          )}
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-2 text-sm ${isUser ? 'text-indigo-100' : 'text-gray-500'}`}>
        <Mic size={14} />
        <span>Voice message</span>
      </div>
    )
  }

  if (mType === 'document') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    const fileName = msg.body ?? msg.mediaMimeType?.split('/')[1] ?? 'Document'
    if (href) {
      return (
        <a href={href} download target="_blank" rel="noopener noreferrer"
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
            isUser ? 'bg-indigo-500 border-indigo-400 text-white hover:bg-indigo-400' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}>
          <FileText size={14} className="flex-shrink-0" />
          <span className="truncate max-w-[160px]">{fileName}</span>
          <Download size={12} className="flex-shrink-0 ml-auto opacity-70" />
        </a>
      )
    }
    return (
      <div className={`flex items-center gap-2 text-sm ${isUser ? 'text-indigo-100' : 'text-gray-500'}`}>
        <FileText size={14} />
        <span>{fileName}</span>
      </div>
    )
  }

  return <p className={textClass}>{msg.body ?? ''}</p>
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const sw = 6
  const r = (size - sw * 2) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const color = score >= 70 ? '#4f46e5' : score >= 40 ? '#f59e0b' : '#ef4444'
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-gray-900 leading-none">{score}</span>
        <span className="text-[9px] font-bold leading-none mt-0.5" style={{ color }}>{grade}</span>
      </div>
    </div>
  )
}

// ─── InlineAICard ─────────────────────────────────────────────────────────────

function InlineAICard({ insight }: { insight: AIInsight }) {
  const cfg = {
    opportunity: { icon: TrendingUp, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Opportunity Detected' },
    alert:       { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'AI Alert' },
    entity:      { icon: Sparkles, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', label: 'AI Insight' },
  }[insight.type]
  const Icon = cfg.icon
  return (
    <div className={`mx-auto w-fit max-w-xs rounded-xl px-3.5 py-2.5 border ${cfg.bg} ${cfg.border} flex items-start gap-2.5`}>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon size={11} className={cfg.text} />
      </div>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${cfg.text}`}>{cfg.label}</p>
        <p className="text-xs text-gray-700 leading-relaxed">{insight.text}</p>
      </div>
    </div>
  )
}

// ─── ConvRow ──────────────────────────────────────────────────────────────────

function ConvRow({ conv, active, onClick, mode }: { conv: Conversation; active: boolean; onClick: () => void; mode: string }) {
  const priority = conv.aiPriority ? AI_PRIORITY[conv.aiPriority] : null
  const PIcon = priority?.icon
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-all border-l-[3px] ${
        active ? 'bg-indigo-50/80 border-indigo-500' : 'hover:bg-white/70 border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar name={conv.contact.name} src={conv.contact.avatarUrl ?? undefined} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-indigo-600 border-2 border-white rounded-full flex items-center justify-center">
            <span className="text-[8px] font-bold text-white px-0.5 leading-none">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          </span>
        )}
        {conv.sentiment && SENTIMENT_DOT[conv.sentiment] && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${SENTIMENT_DOT[conv.sentiment]}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {conv.contact.name}
          </span>
          <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <p className={`text-xs truncate mb-1.5 ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
          {conv.lastMessagePreview || 'No messages yet'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {priority && PIcon && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${priority.color}`}>
              <PIcon size={9} />
              {priority.label}
            </span>
          )}
          {conv.slaMinutes != null && conv.slaMinutes > 60 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${conv.slaMinutes > 480 ? 'text-red-500' : 'text-amber-500'}`}>
              <Clock size={9} />
              {formatSLA(conv.slaMinutes)}
            </span>
          )}
          {mode !== 'personal' && (conv.leadScore ?? 0) > 70 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
              <TrendingUp size={9} />
              {conv.leadScore}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── DailyBriefing ────────────────────────────────────────────────────────────

function DailyBriefing({ name, items, loading, onDismiss }: { name: string; items: string[]; loading: boolean; onDismiss: () => void }) {
  return (
    <div className="mx-3 mt-3 mb-1 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 relative shadow-md">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-indigo-300 hover:text-white transition-colors">
        <X size={13} />
      </button>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={11} className="text-indigo-300" />
        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">AI Daily Briefing</p>
      </div>
      <p className="text-sm font-semibold text-white mb-2">{getGreeting()}, {name}.</p>
      {loading ? (
        <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-3 bg-white/20 rounded animate-pulse" />)}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-indigo-100 leading-relaxed">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-300 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Proactive Card ───────────────────────────────────────────────────────────

function ProactiveCard({
  suggestion, onSend, onSnooze,
}: {
  suggestion: ProactiveSuggestion
  onSend: (draft: string | null) => void
  onSnooze: () => void
}) {
  const isUrgent = suggestion.priority <= 2
  const ICONS: Record<string, React.ElementType> = {
    birthday: Calendar, dormant: Bell, follow_up: Bell,
    promise: CheckCircle, milestone: Star, check_in: Bell,
  }
  const Icon = ICONS[suggestion.suggestionType] ?? Bell

  return (
    <div className={`rounded-xl p-3.5 border ${isUrgent ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-100'}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isUrgent ? 'bg-amber-100' : 'bg-indigo-100'}`}>
          <Icon size={13} className={isUrgent ? 'text-amber-600' : 'text-indigo-600'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-tight ${isUrgent ? 'text-amber-900' : 'text-indigo-900'}`}>{suggestion.title}</p>
          {suggestion.body && (
            <p className={`text-[11px] mt-0.5 leading-relaxed ${isUrgent ? 'text-amber-700' : 'text-indigo-700'}`}>{suggestion.body}</p>
          )}
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => onSend(suggestion.draftMessage)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${isUrgent ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              <Wand2 size={10} />
              Send Now
            </button>
            <button
              onClick={onSnooze}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${isUrgent ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-100'}`}
            >
              Snooze
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Intel Panel ──────────────────────────────────────────────────────────────

type AITab = 'overview' | 'memory' | 'activity' | 'files'

interface IntelPanelProps {
  contact: Contact | null
  contactDetail: ContactDetail | null
  selectedConv: Conversation | null
  contextData: ConvContext | null
  contextLoading: boolean
  suggestions: Suggestion[]
  regenerating: boolean
  actionLoading: string | null
  mode: string
  notes: InternalNote[]
  newNote: string
  editingSuggId: string | null
  editedText: string
  aiTab: AITab
  messages: Message[]
  noteRef: React.RefObject<HTMLTextAreaElement | null>
  onTabChange: (t: AITab) => void
  onApprove: (id: string, custom?: string) => void
  onDismiss: (id: string) => void
  onRegenerate: () => void
  onSetDraft: (text: string) => void
  onAddNote: () => void
  onNoteChange: (v: string) => void
  onEditSugg: (id: string | null) => void
  onEditedTextChange: (v: string) => void
  onClose: () => void
  draftFocus: () => void
  promises: ContactPromise[]
  onApproveProactive: (id: string) => void
  onSnoozeProactive: (id: string) => void
}

function IntelPanel({
  contact, contactDetail, selectedConv, contextData, contextLoading,
  suggestions, regenerating, actionLoading, mode, notes, newNote,
  editingSuggId, editedText, aiTab, messages, noteRef, onTabChange,
  onApprove, onDismiss, onRegenerate, onSetDraft,
  onAddNote, onNoteChange, onEditSugg, onEditedTextChange, onClose, draftFocus,
  promises, onApproveProactive, onSnoozeProactive,
}: IntelPanelProps) {
  const TABS: { id: AITab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'memory',   label: 'Memory' },
    { id: 'activity', label: 'Activity' },
    { id: 'files',    label: 'Files' },
  ]

  const healthScore = contactDetail?.relationship?.healthScore ?? selectedConv?.healthScore ?? 0

  // Derive AI insights from context for display in overview
  const insights: AIInsight[] = []
  if (contextData?.buyingSignals?.length) {
    insights.push({ type: 'opportunity', text: contextData.buyingSignals[0] })
  }
  if (contextData?.dominantSentiment === 'frustrated' || contextData?.dominantSentiment === 'angry') {
    insights.push({ type: 'alert', text: `Sentiment is ${contextData.dominantSentiment} — consider an empathetic response` })
  }
  if (contextData?.intents?.length) {
    insights.push({ type: 'entity', text: `Detected intent: ${contextData.intents.slice(0,2).join(', ').replace(/_/g, ' ')}` })
  }

  // Files derived from messages (document type) — placeholder
  const mockFiles = [
    { name: 'Invoice_March.pdf', size: '142 KB', date: '2 months ago' },
    { name: 'Product_Catalogue.pdf', size: '3.2 MB', date: '3 weeks ago' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-50 rounded-md flex items-center justify-center">
            <Brain size={13} className="text-indigo-600" />
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {contact?.name ? contact.name.split(' ')[0] : 'Intelligence'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0 px-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
              aiTab === tab.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview ────────────────────────────────────────────────────── */}
        {aiTab === 'overview' && (
          <div className="divide-y divide-gray-50">

            {/* === Proactive Reminders === */}
            {contact && (() => {
              const proactives = contactDetail?.proactiveSuggestions ?? []
              const birthday = contactDetail?.upcomingEvents?.find(e => e.eventType === 'birthday')
              const isDormant = healthScore < 35
              const hasPromises = promises.length > 0
              if (proactives.length === 0 && !birthday && !isDormant && !hasPromises) return null
              return (
                <div className="p-4 space-y-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reminders</p>

                  {proactives.map(s => (
                    <ProactiveCard
                      key={s.id}
                      suggestion={s}
                      onSend={(draft) => { if (draft) { onSetDraft(draft); draftFocus() } onApproveProactive(s.id) }}
                      onSnooze={() => onSnoozeProactive(s.id)}
                    />
                  ))}

                  {birthday && (
                    <div className="rounded-xl p-3.5 bg-pink-50 border border-pink-100 flex items-start gap-2.5">
                      <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Calendar size={13} className="text-pink-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-pink-900">{birthday.title}</p>
                        <p className="text-[11px] text-pink-600 mt-0.5">{birthday.eventDate}</p>
                      </div>
                    </div>
                  )}

                  {isDormant && proactives.length === 0 && (
                    <div className="rounded-xl p-3.5 bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                      <TrendingDown size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-900 mb-0.5">Relationship needs attention</p>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          Health score is low ({healthScore}/100) — a warm follow-up could help.
                        </p>
                      </div>
                    </div>
                  )}

                  {hasPromises && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Promises to Keep</p>
                      {promises.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                          <CheckCircle size={12} className="text-rose-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-rose-900 leading-relaxed">{p.text}</p>
                            <p className="text-[10px] text-rose-400 mt-0.5">{formatTime(p.messageAt)}</p>
                          </div>
                          <button
                            onClick={() => { onSetDraft(p.text); draftFocus() }}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-1 rounded-lg flex-shrink-0 transition-colors whitespace-nowrap"
                          >
                            Send Now
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* === Health Score === */}
            {contact && (
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <ScoreRing score={healthScore} size={64} />
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Relationship Health</p>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {healthScore >= 70 ? 'Strong relationship with consistent engagement.' :
                       healthScore >= 40 ? 'Moderate — attention may improve retention.' :
                       'Needs nurturing — high churn risk.'}
                    </p>
                    {contextData?.requiresResponse && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
                        <AlertCircle size={9} />
                        Needs reply
                      </span>
                    )}
                  </div>
                </div>
                {insights.length > 0 && (
                  <div className="space-y-2">
                    {insights.map((ins, i) => <InlineAICard key={i} insight={ins} />)}
                  </div>
                )}
              </div>
            )}

            {/* Context loading */}
            {contextLoading && (
              <div className="p-4 space-y-2">
                {[1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            )}

            {/* === Recommended Action === */}
            {contextData?.nextAction && (
              <div className="p-4">
                <div className={`rounded-xl p-3.5 flex items-start gap-3 ${contextData.urgency === 'high' ? 'bg-amber-50 border border-amber-100' : 'bg-indigo-50 border border-indigo-100'}`}>
                  <Lightbulb size={14} className={`flex-shrink-0 mt-0.5 ${contextData.urgency === 'high' ? 'text-amber-600' : 'text-indigo-600'}`} />
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${contextData.urgency === 'high' ? 'text-amber-500' : 'text-indigo-400'}`}>
                      Recommended Action
                    </p>
                    <p className={`text-sm font-semibold ${contextData.urgency === 'high' ? 'text-amber-900' : 'text-indigo-900'}`}>
                      {contextData.nextAction}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* === Contact Intelligence Card === */}
            {contact && contactDetail && (
              <>
                {/* Business Context */}
                {mode !== 'personal' && (contactDetail.company || contactDetail.jobTitle || contactDetail.pipelineStage || contactDetail.leadScore != null) && (
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Business Context</p>
                    <div className="space-y-2">
                      {contactDetail.company && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
                            <BarChart2 size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Company</p>
                            <p className="text-xs font-semibold text-gray-800">{contactDetail.company}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.jobTitle && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
                            <UserCheck size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Role</p>
                            <p className="text-xs font-semibold text-gray-800">{contactDetail.jobTitle}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.pipelineStage && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
                            <Target size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Deal Stage</p>
                            <p className="text-xs font-semibold text-gray-800 capitalize">{contactDetail.pipelineStage.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.leadScore != null && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-gray-400">Lead Score</p>
                            <span className={`text-xs font-bold tabular-nums ${contactDetail.leadScore > 70 ? 'text-indigo-600' : contactDetail.leadScore > 40 ? 'text-amber-600' : 'text-red-500'}`}>{contactDetail.leadScore}/100</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${contactDetail.leadScore > 70 ? 'bg-indigo-500' : contactDetail.leadScore > 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${contactDetail.leadScore}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Personal Context */}
                {(contactDetail.profile?.communicationStyle || contactDetail.profile?.moodBaseline || contactDetail.profile?.currentLifeContext || contactDetail.notes) && (
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Personal Context</p>
                    <div className="space-y-2">
                      {(contextData?.communicationStyle ?? contactDetail.profile?.communicationStyle) && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 flex items-start gap-2.5">
                          <MessageCircle size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">Comm. Style</p>
                            <p className="text-xs font-semibold text-blue-900 capitalize leading-snug mt-0.5">
                              {contextData?.communicationStyle ?? contactDetail.profile?.communicationStyle}
                            </p>
                          </div>
                        </div>
                      )}
                      {contactDetail.profile?.moodBaseline && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Activity size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Mood Baseline</p>
                            <p className="text-xs font-medium text-gray-800 capitalize">{contactDetail.profile.moodBaseline}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.profile?.currentLifeContext && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                            <MapPin size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Life Context</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{contactDetail.profile.currentLifeContext}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.notes && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                            <StickyNote size={11} className="text-gray-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Notes</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{contactDetail.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* === AI Insights (Interests & Life Events from contact_insights) === */}
            {contactDetail && (() => {
              const INTEREST_KEYS = ['interest', 'hobby', 'passion', 'like', 'enjoy', 'favorite', 'favourite', 'sport', 'music', 'food', 'travel', 'fan', 'activity']
              const LIFE_EVENT_KEYS = ['job', 'career', 'work', 'moved', 'relocat', 'promotion', 'study', 'graduat', 'married', 'birth', 'family', 'health', 'launch', 'start', 'bought', 'sold']
              const interests = contactDetail.insights.filter(i => INTEREST_KEYS.some(k => i.key.toLowerCase().includes(k)))
              const lifeEvents = contactDetail.insights.filter(i => LIFE_EVENT_KEYS.some(k => i.key.toLowerCase().includes(k)))
              if (interests.length === 0 && lifeEvents.length === 0) return null
              return (
                <div className="p-4 space-y-3">
                  {interests.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Interests & Passions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {interests.map((ins, i) => (
                          <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-medium rounded-full border border-purple-100 capitalize">
                            <Heart size={9} className="flex-shrink-0" />
                            {ins.value.length > 30 ? ins.value.slice(0, 30) + '…' : ins.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {lifeEvents.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Life Events</p>
                      <div className="space-y-1.5">
                        {lifeEvents.map((ins, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <p className="text-xs text-gray-700 leading-relaxed">{ins.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* === Buying Signals === */}
            {mode !== 'personal' && contextData?.buyingSignals && contextData.buyingSignals.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Buying Signals</p>
                <div className="space-y-1.5">
                  {contextData.buyingSignals.map((signal, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <TrendingUp size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-700 leading-relaxed">{signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mode !== 'personal' && contactDetail?.profile?.buyingBehaviour && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Buying Behaviour</p>
                <p className="text-xs text-gray-700 leading-relaxed">{contactDetail.profile.buyingBehaviour}</p>
              </div>
            )}

          </div>
        )}

        {/* ── Memory ──────────────────────────────────────────────────────── */}
        {aiTab === 'memory' && (
          <div className="divide-y divide-gray-50">
            {/* Context summary */}
            {contextData?.summary && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Conversation Summary</p>
                <p className="text-xs text-gray-700 leading-relaxed">{contextData.summary}</p>
                {contextData.analysedAt && (
                  <p className="text-[10px] text-gray-300 mt-2">Analysed {formatTime(contextData.analysedAt)}</p>
                )}
              </div>
            )}

            {/* Personality */}
            {(contextData?.personalitySummary || contactDetail?.profile?.personalitySummary) && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Personality</p>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {contextData?.personalitySummary ?? contactDetail?.profile?.personalitySummary}
                </p>
                {(contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <MessageCircle size={11} className="text-gray-400" />
                    <p className="text-xs text-gray-500">{contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle}</p>
                  </div>
                )}
              </div>
            )}

            {/* Smart tags / topics */}
            {contextData && (contextData.topTopics.length > 0 || contextData.intents.length > 0) && (
              <div className="p-4">
                {contextData.intents.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Intent Signals</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {contextData.intents.map(intent => (
                        <span key={intent} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full border border-blue-100 capitalize">
                          {intent.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {contextData.topTopics.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {contextData.topTopics.map(topic => (
                        <span key={topic} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded-full capitalize">
                          {topic.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* AI insights / memory */}
            {contextData?.insights && contextData.insights.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">AI Memory</p>
                <div className="space-y-2">
                  {contextData.insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-700 leading-relaxed">{ins.value}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{ins.key?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Private Notes</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <textarea
                  ref={noteRef}
                  value={newNote}
                  onChange={e => onNoteChange(e.target.value)}
                  placeholder="Add a private note — only your team sees this…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-xs text-gray-700 resize-none focus:outline-none border-b border-gray-100 placeholder-gray-400"
                />
                <div className="flex justify-end px-3 py-2 bg-gray-50">
                  <button
                    onClick={onAddNote}
                    disabled={!newNote.trim()}
                    className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
              {notes.length === 0 ? (
                <div className="text-center py-4">
                  <StickyNote size={22} className="text-gray-300 mx-auto mb-1.5" />
                  <p className="text-xs text-gray-400">No notes yet</p>
                </div>
              ) : notes.map(n => (
                <div key={n.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs text-gray-800 leading-relaxed">{n.text}</p>
                  <p className="text-[10px] text-amber-600 mt-1.5">{n.author} · {formatTime(n.createdAt)}</p>
                </div>
              ))}
            </div>

            {!contextData && !contextLoading && (
              <div className="px-4 py-8 text-center">
                <Brain size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-600 mb-1">No memory yet</p>
                <p className="text-xs text-gray-400">AI context builds as conversation progresses.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Activity ────────────────────────────────────────────────────── */}
        {aiTab === 'activity' && (
          <div className="divide-y divide-gray-50">
            {/* Suggestions */}
            {(suggestions.length > 0 || regenerating) && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI Reply Suggestions</p>
                  <button onClick={onRegenerate} disabled={regenerating} className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold disabled:opacity-50">
                    <RefreshCw size={10} className={regenerating ? 'animate-spin' : ''} /> Regenerate
                  </button>
                </div>
                {regenerating ? (
                  <div className="flex flex-col items-center py-6 gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-xs text-gray-400">Generating…</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map(s => (
                      <div key={s.id} className={`rounded-xl p-3 border ${TONE_STYLE[s.tone] ?? 'bg-gray-50 border-gray-100 text-gray-800'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide">{s.tone}</span>
                          <div className="flex items-center gap-1">
                            {s.confidence != null && (
                              <span className="text-[10px] font-semibold opacity-60">{s.confidence}%</span>
                            )}
                            <button onClick={() => { onEditSugg(s.id); onEditedTextChange(s.text) }} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
                              <Edit3 size={10} />
                            </button>
                            <button onClick={() => navigator.clipboard.writeText(s.text)} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
                              <Copy size={10} />
                            </button>
                          </div>
                        </div>
                        {editingSuggId === s.id ? (
                          <textarea
                            autoFocus rows={3}
                            value={editedText}
                            onChange={e => onEditedTextChange(e.target.value)}
                            className="w-full text-xs leading-relaxed bg-white/60 border border-current/20 rounded-lg p-2 resize-none focus:outline-none mb-2"
                          />
                        ) : (
                          <p className="text-xs leading-relaxed mb-1">{s.text}</p>
                        )}
                        {editingSuggId !== s.id && s.reasoning && (
                          <p className="text-[10px] opacity-50 leading-relaxed mb-2">{s.reasoning}</p>
                        )}
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => onApprove(s.id, editingSuggId === s.id ? editedText : undefined)}
                            disabled={actionLoading === s.id}
                            className="flex-1 text-[11px] font-bold py-1.5 bg-current/10 hover:bg-current/20 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {editingSuggId === s.id ? 'Send edited' : 'Send'}
                          </button>
                          {editingSuggId !== s.id && (
                            <button
                              onClick={() => { onSetDraft(s.text); draftFocus() }}
                              className="flex-1 text-[11px] font-semibold py-1.5 bg-white/50 hover:bg-white/80 border border-current/10 rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          {editingSuggId === s.id && (
                            <button onClick={() => onEditSugg(null)} className="px-3 text-[11px] py-1.5 bg-white/30 border border-current/10 rounded-lg">
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => onDismiss(s.id)}
                            disabled={actionLoading === s.id}
                            className="px-2 text-[11px] py-1.5 opacity-40 hover:opacity-70 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Suggested actions */}
            {mode !== 'personal' && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Suggested Actions</p>
                <div className="space-y-1">
                  {MOCK_ACTIONS.map(a => {
                    const Icon = a.icon
                    return (
                      <button key={a.label} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors text-left group">
                        <Icon size={12} className="text-gray-400 group-hover:text-indigo-500 flex-shrink-0" />
                        {a.label}
                        <ChevronRight size={11} className="ml-auto text-gray-300 group-hover:text-indigo-400" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Relationship timeline */}
            <div className="p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Timeline</p>
              {contactDetail ? (
                (() => {
                  const hasUpcoming = (contactDetail.upcomingEvents?.length ?? 0) > 0
                  const hasHistory = (contactDetail.healthHistory?.length ?? 0) > 0
                  if (!hasUpcoming && !hasHistory) {
                    return (
                      <div className="text-center py-6">
                        <Calendar size={22} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">No timeline events yet</p>
                      </div>
                    )
                  }
                  return (
                    <div className="relative">
                      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100" />
                      <div className="space-y-4">
                        {contactDetail.upcomingEvents?.map(ev => {
                          const EICONS: Record<string, React.ElementType> = {
                            birthday: Calendar, anniversary: Heart, meeting: Calendar,
                            deadline: AlertTriangle, appointment: Calendar,
                          }
                          const EIcon = EICONS[ev.eventType] ?? Calendar
                          return (
                            <div key={ev.id} className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center flex-shrink-0 z-10">
                                <EIcon size={10} className="text-indigo-500" />
                              </div>
                              <div className="pt-0.5">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-semibold text-gray-700">{ev.title}</p>
                                  {ev.isRecurring && <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded-full">recurring</span>}
                                </div>
                                <p className="text-[10px] text-indigo-500">{ev.eventDate}</p>
                              </div>
                            </div>
                          )
                        })}
                        {contactDetail.healthHistory?.map((h, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${
                              h.previousScore != null && h.score > h.previousScore ? 'bg-emerald-50 border-emerald-200' :
                              h.previousScore != null && h.score < h.previousScore ? 'bg-red-50 border-red-200' :
                              'bg-white border-gray-200'
                            }`}>
                              {h.previousScore != null && h.score > h.previousScore ? (
                                <TrendingUp size={10} className="text-emerald-500" />
                              ) : h.previousScore != null && h.score < h.previousScore ? (
                                <TrendingDown size={10} className="text-red-400" />
                              ) : (
                                <Activity size={10} className="text-gray-400" />
                              )}
                            </div>
                            <div className="pt-0.5">
                              <p className="text-xs font-semibold text-gray-700">
                                Health: {h.score}/100
                                {h.previousScore != null && h.previousScore !== h.score && (
                                  <span className={`ml-1 text-[10px] ${h.score > h.previousScore ? 'text-emerald-500' : 'text-red-400'}`}>
                                    {h.score > h.previousScore ? `+${h.score - h.previousScore}` : `${h.score - h.previousScore}`}
                                  </span>
                                )}
                              </p>
                              {h.changeReason && <p className="text-[10px] text-gray-500 leading-relaxed">{h.changeReason}</p>}
                              <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(h.recordedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="relative">
                  <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100" />
                  <div className="space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                        <div className="flex-1 pt-1">
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mb-1" />
                          <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Conversation stats */}
            {messages.length > 0 && (() => {
              const sentCount = messages.filter(m => m.senderType === 'user').length
              const recvCount = messages.filter(m => m.senderType === 'contact').length
              const total = messages.length
              const sentPct = Math.round((sentCount / total) * 100)
              const recvPct = 100 - sentPct

              // Rough avg response time: time between contact msg → next user msg
              let totalGapMs = 0; let gapCount = 0
              for (let i = 1; i < messages.length; i++) {
                if (messages[i].senderType === 'user' && messages[i - 1].senderType === 'contact') {
                  totalGapMs += new Date(messages[i].timestamp).getTime() - new Date(messages[i - 1].timestamp).getTime()
                  gapCount++
                }
              }
              const avgResponseMin = gapCount > 0 ? Math.round(totalGapMs / gapCount / 60000) : null

              return (
                <div className="p-4 border-t border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Conversation Stats</p>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-500">You sent</span>
                        <span className="font-semibold text-gray-700">{sentCount} msg ({sentPct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${sentPct}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-500">They sent</span>
                        <span className="font-semibold text-gray-700">{recvCount} msg ({recvPct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${recvPct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-400">{total} messages total</span>
                      {avgResponseMin !== null && (
                        <span className="text-[10px] text-gray-400">
                          Avg reply <span className="font-semibold text-gray-600">
                            {avgResponseMin < 60 ? `${avgResponseMin}m` : `${Math.round(avgResponseMin / 60)}h`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Files ───────────────────────────────────────────────────────── */}
        {aiTab === 'files' && (
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Shared Files</p>
            {mockFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{f.size} · {f.date}</p>
                </div>
                <Download size={13} className="text-gray-400 flex-shrink-0" />
              </div>
            ))}
            {mockFiles.length === 0 && (
              <div className="text-center py-10">
                <FileText size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No files shared yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type MobileView = 'list' | 'thread' | 'intel'
type FilterId = typeof FILTERS[number]['id']

export default function InboxPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const userName = (session.data?.user?.email ?? '').split('@')[0] || 'there'

  // Data state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(false)

  // Briefing
  const [briefingItems, setBriefingItems] = useState<string[]>([])
  const [briefingLoading, setBriefingLoading] = useState(false)

  // Context
  const [contextData, setContextData] = useState<ConvContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)

  // UI
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [showAIPanel, setShowAIPanel] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filter, setFilter] = useState<FilterId>('all')
  const [aiTab, setAiTab] = useState<AITab>('overview')
  const [briefingDismissed, setBriefingDismissed] = useState(false)
  const [draft, setDraft] = useState('')
  const [newNote, setNewNote] = useState('')
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [promises, setPromises] = useState<ContactPromise[]>([])

  // AI Actions state
  const [showAIActions, setShowAIActions] = useState(false)
  const [aiActionLoading, setAIActionLoading] = useState<string | null>(null)
  const [aiActionResult, setAIActionResult] = useState<{ label: string; text: string } | null>(null)
  const [aiAskInput, setAIAskInput] = useState('')

  const selectedIdRef = useRef<string | null>(null)
  const selectedMsgIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ conversations: Conversation[] }>('/api/conversations', { token })
      setConversations(data.conversations)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadBriefing = useCallback(async () => {
    if (!token) return
    setBriefingLoading(true)
    try {
      const data = await apiClient<BriefingData>('/api/inbox/briefing', { token })
      setBriefingItems(data.items)
    } catch {} finally {
      setBriefingLoading(false)
    }
  }, [token])

  const loadContext = useCallback(async (convId: string) => {
    if (!token) return
    setLoadingContext(true)
    setContextData(null)
    try {
      const data = await apiClient<{ context: ConvContext }>(`/api/conversations/${convId}/context`, { token })
      setContextData(data.context)
    } catch {} finally {
      setLoadingContext(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    loadConversations()
    loadBriefing()
    const socket = getSocket(token)
    socket.on('message:new', loadConversations)
    socket.on('suggestion:ready', (payload: string) => {
      try {
        const data = JSON.parse(payload)
        if (selectedIdRef.current && token) {
          apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${data.messageId}/suggestions`, { token })
            .then(d => { setSuggestions(d.suggestions); setSelectedMsgId(data.messageId) })
        }
        loadConversations()
      } catch {}
    })
    return () => { socket.off('message:new', loadConversations); socket.off('suggestion:ready') }
  }, [token, loadConversations, loadBriefing])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(v => !v) }
      if (e.key === 'Escape') { setShowSearch(false) }
      if (e.key === 'r' && !inField && !e.metaKey && !e.ctrlKey) {
        if (selectedIdRef.current && selectedMsgIdRef.current && token) {
          setRegenerating(true); setSuggestions([])
          apiClient(`/api/messages/${selectedMsgIdRef.current}/regenerate`, { method: 'POST', token })
            .finally(() => setRegenerating(false))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [token])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { selectedMsgIdRef.current = selectedMsgId }, [selectedMsgId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const selectConversation = async (convId: string) => {
    setSelectedId(convId); setSelectedMsgId(null); setSuggestions([])
    setContactDetail(null); setLoadingMsgs(true); setMobileView('thread')
    setDraft(''); setAiTab('overview'); setContextData(null); setPromises([])
    if (!token) return
    const data = await apiClient<{ messages: Message[]; contact: Contact }>(
      `/api/conversations/${convId}/messages`, { token }
    )
    setMessages(data.messages); setContact(data.contact); setLoadingMsgs(false)
    if (data.contact?.id) {
      const contactId = data.contact.id
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${contactId}`, { token })
        .then(d => setContactDetail(d.contact)).catch(() => {})
      apiClient<{ promises: ContactPromise[] }>(`/api/contacts/${contactId}/promises`, { token })
        .then(d => setPromises(d.promises ?? []))
        .catch(() => setPromises([]))
    }
    loadContext(convId)
    const last = [...data.messages].reverse().find(m => m.pendingSuggestions > 0)
    if (last) {
      setSelectedMsgId(last.id)
      apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${last.id}/suggestions`, { token })
        .then(d => setSuggestions(d.suggestions)).catch(() => {})
    }
  }

  const selectMessage = async (msgId: string) => {
    setSelectedMsgId(msgId)
    if (!token) return
    const data = await apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${msgId}/suggestions`, { token })
    setSuggestions(data.suggestions)
  }

  const approveSuggestion = async (id: string, customText?: string) => {
    if (!token) return
    setActionLoading(id)
    await apiClient(`/api/suggestions/${id}/approve`, {
      method: 'POST', token,
      ...(customText ? { body: JSON.stringify({ text: customText }) } : {}),
    })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    setActionLoading(null); setEditingSuggId(null)
  }

  const dismissSuggestion = async (id: string) => {
    if (!token) return
    setActionLoading(id)
    await apiClient(`/api/suggestions/${id}/dismiss`, { method: 'POST', token })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    setActionLoading(null)
  }

  const regenerate = async () => {
    if (!token || !selectedMsgId) return
    setRegenerating(true); setSuggestions([])
    await apiClient(`/api/messages/${selectedMsgId}/regenerate`, { method: 'POST', token })
    setRegenerating(false)
  }

  const sendDraft = async () => {
    if (!draft.trim() || !selectedId || !token) return
    const text = draft.trim(); setDraft('')
    const tempMsg: Message = { id: `temp-${Date.now()}`, senderType: 'user', body: text, timestamp: new Date().toISOString(), pendingSuggestions: 0 }
    setMessages(prev => [...prev, tempMsg])
    try {
      await apiClient(`/api/conversations/${selectedId}/messages`, { method: 'POST', token, body: JSON.stringify({ text }) })
    } catch {}
  }

  const addNote = () => {
    if (!newNote.trim()) return
    setNotes(prev => [{ id: `n-${Date.now()}`, text: newNote.trim(), author: userName, createdAt: new Date().toISOString() }, ...prev])
    setNewNote('')
  }

  const approveProactive = async (id: string) => {
    if (!token) return
    setContactDetail(prev => prev ? {
      ...prev, proactiveSuggestions: prev.proactiveSuggestions.filter(s => s.id !== id),
    } : prev)
    try {
      await apiClient(`/api/proactive/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'approved' }) })
    } catch {}
  }

  const snoozeProactive = async (id: string) => {
    if (!token) return
    setContactDetail(prev => prev ? {
      ...prev, proactiveSuggestions: prev.proactiveSuggestions.filter(s => s.id !== id),
    } : prev)
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    try {
      await apiClient(`/api/proactive/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'snoozed', snoozedUntil }) })
    } catch {}
  }

  const aiSummarize = async () => {
    if (!selectedId || !token) return
    setAIActionLoading('summarize')
    try {
      const data = await apiClient<{ summary: string }>(`/api/conversations/${selectedId}/summarize`, { method: 'POST', token })
      setAIActionResult({ label: 'AI Summary', text: data.summary })
    } catch {
      setAIActionResult({ label: 'AI Summary', text: 'Could not generate summary. Make sure the intelligence service is running.' })
    } finally {
      setAIActionLoading(null)
    }
  }

  const aiFollowup = async () => {
    if (!selectedId || !token) return
    setAIActionLoading('followup')
    try {
      const data = await apiClient<{ followup: string }>(`/api/conversations/${selectedId}/followup`, { method: 'POST', token })
      setDraft(data.followup)
      setShowAIActions(false)
      setAIActionResult(null)
      setTimeout(() => draftRef.current?.focus(), 50)
    } catch {
      setAIActionResult({ label: 'Follow-up', text: 'Could not generate follow-up.' })
    } finally {
      setAIActionLoading(null)
    }
  }

  const aiAsk = async () => {
    if (!selectedId || !token || !aiAskInput.trim()) return
    const question = aiAskInput.trim()
    setAIActionLoading('ask')
    setAIAskInput('')
    try {
      const data = await apiClient<{ answer: string }>(`/api/conversations/${selectedId}/ask`, {
        method: 'POST', token, body: JSON.stringify({ question }),
      })
      setAIActionResult({ label: `Q: ${question.slice(0, 40)}${question.length > 40 ? '…' : ''}`, text: data.answer })
    } catch {
      setAIActionResult({ label: 'Ask AI', text: 'Could not get an answer.' })
    } finally {
      setAIActionLoading(null)
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !search || c.contact.name.toLowerCase().includes(q) || (c.lastMessagePreview ?? '').toLowerCase().includes(q)
    if (!matchSearch) return false
    if (filter === 'unread')      return c.unreadCount > 0
    if (filter === 'needs_reply') return c.unreadCount > 0 || c.aiPriority === 'waiting'
    if (filter === 'hot_leads')   return c.aiPriority === 'hot_lead' || c.aiPriority === 'ready_to_buy'
    if (filter === 'vip')         return (c.leadScore ?? 0) > 80
    if (filter === 'waiting')     return c.aiPriority === 'waiting'
    if (filter === 'at_risk')     return c.sentiment === 'frustrated' || c.sentiment === 'angry' || c.aiPriority === 'dissatisfied'
    return true
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)
  const hotLeads = conversations.filter(c => c.aiPriority === 'hot_lead' || c.aiPriority === 'ready_to_buy').length
  const avgHealth = conversations.length > 0
    ? Math.round(conversations.reduce((s, c) => s + c.healthScore, 0) / conversations.length)
    : 0
  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const currentPriority = selectedConv?.aiPriority ? AI_PRIORITY[selectedConv.aiPriority] : null
  const CurrentPIcon = currentPriority?.icon ?? null

  // Derive inline AI insight cards for message timeline
  const timelineInsights: AIInsight[] = []
  if (contextData?.buyingSignals?.length) {
    timelineInsights.push({ type: 'opportunity', text: contextData.buyingSignals[0] })
  }
  if (contextData?.dominantSentiment === 'frustrated' || contextData?.dominantSentiment === 'angry') {
    timelineInsights.push({ type: 'alert', text: `Sentiment shift detected — consider a more empathetic tone` })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-stone-50">

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs font-medium text-center py-2 flex items-center justify-center gap-2">
          <WifiOff size={13} />
          You are offline — messages will be queued when you reconnect.
        </div>
      )}

      {/* ── Left: Conversation list ──────────────────────────────────────────── */}
      <div className={`${mobileView !== 'list' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[272px] border-r border-gray-200 flex-shrink-0 bg-white`}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">Inbox</h1>
            {totalUnread > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            >
              <Search size={15} />
            </button>
            <a
              href="/inbox/queue"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Zap size={12} />
              Queue
            </a>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="px-3 py-2 border-b border-gray-50 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus type="search" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-50 overflow-x-auto flex-shrink-0 no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                filter === f.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {!loading && conversations.length > 0 && (
          <div className="flex items-center divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0 px-3 py-2">
            <div className="flex items-center gap-1.5 flex-1 pr-3">
              <MessageSquare size={11} className="text-indigo-400" />
              <div>
                <p className="text-[9px] text-gray-400 leading-none">Unread</p>
                <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{totalUnread}</p>
              </div>
            </div>
            {mode !== 'personal' && (
              <div className="flex items-center gap-1.5 flex-1 px-3">
                <Flame size={11} className="text-red-400" />
                <div>
                  <p className="text-[9px] text-gray-400 leading-none">Hot leads</p>
                  <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{hotLeads}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-1 pl-3">
              <Activity size={11} className="text-emerald-400" />
              <div>
                <p className="text-[9px] text-gray-400 leading-none">Avg health</p>
                <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{avgHealth}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Daily briefing */}
        {!briefingDismissed && mode !== 'personal' && (
          <DailyBriefing name={userName} items={briefingItems} loading={briefingLoading} onDismiss={() => setBriefingDismissed(true)} />
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-1">{Array.from({ length: 7 }, (_, i) => <SkeletonListItem key={i} />)}</div>
          ) : error ? (
            <EmptyState
              icon={<AlertCircle size={30} className="text-gray-400" />}
              title="Couldn't load conversations"
              description="Check the API server."
              action={<button onClick={loadConversations} className="text-sm text-indigo-600 font-medium hover:underline">Retry</button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={28} className="text-gray-400" />}
              title={search ? 'No results' : filter !== 'all' ? 'None here' : 'No conversations yet'}
              description={search ? `No match for "${search}"` : filter !== 'all' ? 'Try a different filter.' : 'Connect WhatsApp to get started.'}
            />
          ) : (
            <div className="divide-y divide-gray-50/80">
              {filtered.map(conv => (
                <ConvRow key={conv.id} conv={conv} active={selectedId === conv.id} onClick={() => selectConversation(conv.id)} mode={mode} />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* ── Center: Chat ─────────────────────────────────────────────────────── */}
                  {/* ── Center: Chat ─────────────────────────────────────────────────────── */}
      <div className={`${mobileView === 'list' ? 'hidden md:flex' : mobileView === 'intel' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0 relative`}>
        {selectedId && contact ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200/80 bg-white/90 backdrop-blur-md flex-shrink-0 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] sticky top-0 z-20">
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900 truncate">{contact.name}</p>
                  {currentPriority && CurrentPIcon && (
                    <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${currentPriority.color}`}>
                      <CurrentPIcon size={9} />
                      {currentPriority.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {contact.phone ?? contactDetail?.relationship?.type?.replace(/_/g, ' ') ?? 'WhatsApp'}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Add note"
                  onClick={() => { setShowAIPanel(true); setAiTab('memory'); setTimeout(() => noteRef.current?.focus(), 150) }}
                >
                  <StickyNote size={16} />
                </button>
                <a
                  href={`/contacts/${contact.id}`}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="View full profile"
                >
                  <ExternalLink size={16} />
                </a>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Archive">
                  <Archive size={16} />
                </button>
                {/* Mobile intel button */}
                <button
                  onClick={() => setMobileView('intel')}
                  className="md:hidden flex items-center gap-1.5 ml-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg"
                >
                  <Brain size={12} />
                  Intel
                </button>
                {/* Desktop intel toggle */}
                <button
                  onClick={() => setShowAIPanel(v => !v)}
                  className={`hidden md:flex p-2 rounded-lg transition-colors ${showAIPanel ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  title="AI Intelligence Panel"
                >
                  <Brain size={16} />
                </button>
              </div>
            </div>

            {/* Messages + intel row */}
            <div className="flex flex-1 min-h-0 relative overflow-y-auto">
              {/* Message area */}
              <div 
  className="relative flex flex-col flex-1 min-w-0 bg-[#eae6df]"
  style={{
    backgroundImage: `url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcOOTYXA0CTvrMSr432Cm0CcRcPnrwgCDh_EyC5T05SQ&s=10')`,
    backgroundSize: '400px', /* Keeps the doodle pattern crisp and at a comfortable mobile scale */
    backgroundRepeat: 'repeat'
  }}
>
  {/* Modern High-Fidelity Overlay Tint */}
  {/* This mask dims the background pattern slightly so the text remains incredibly comfortable to read */}
  <div className="absolute inset-0 bg-[#eae6df]/85 dark:bg-[#0b141a]/95 pointer-events-none mix-blend-normal" />

                {/* Message stream */}
                <div className="flex-1 px-4 py-4 space-y-2 z-10">
                  {loadingMsgs ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <div className={`h-10 rounded-2xl animate-pulse bg-gray-200 ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                                                                  {messages.map((msg, idx) => {
                        const isUser = msg.senderType === 'user'
                        const isApproved = msg.approvalMode === 'approved'
                        const isAuto = msg.approvalMode === 'autonomous'

                        // Show inline AI insight after 2nd-to-last contact message
                        const showInsight = !isUser && timelineInsights.length > 0 && idx === messages.length - 2

                        return (
                          <div key={msg.id} className="mb-1">
                            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-2`}>
                              <div
                                onClick={() => msg.pendingSuggestions > 0 && selectMessage(msg.id)}
                                className={`max-w-[85%] md:max-w-sm ${msg.pendingSuggestions > 0 ? 'cursor-pointer' : ''}`}
                              >
                                <div className={`px-3 py-1.5 text-[15px] shadow-[0_1px_0.5px_rgba(0,0,0,0.08)] relative leading-snug ${
                                  isUser ? 'rounded-lg rounded-tr-none' : 'rounded-lg rounded-tl-none'
                                } ${
                                  isAuto
                                    ? 'bg-gradient-to-br from-[#E7FFDB] to-[#d8fbc2] text-[#111b21]'
                                    : isApproved
                                    ? 'bg-[#E7FFDB] text-[#111b21] border-l-2 border-[#34b7f1]'
                                    : isUser
                                    ? 'bg-[#E7FFDB] text-[#111b21]' // WhatsApp Light Mode Sent
                                    : 'bg-[#f0f4f9] text-[#1f1f1f]' // Cool Gemini Blue-Gray Received
                                } ${msg.pendingSuggestions > 0 && selectedMsgId !== msg.id ? 'ring-1 ring-amber-400/60' : ''}
                                  ${selectedMsgId === msg.id ? 'ring-1 ring-[#34b7f1]/60' : ''}`}
                                >
                                  {isAuto && (
                                    <span className="absolute -top-2.5 right-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f0f4f9] border border-[#d8fbc2] rounded-full text-[8px] font-bold text-[#5f6368] shadow-sm">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                                      AUTO
                                    </span>
                                  )}
                                  
                                  <MessageContent msg={msg} token={token} isUser={isUser} />
                                  
                                  <div className="flex items-center justify-end gap-1 mt-1 text-right ml-auto select-none">
                                    <span className="text-[11px] text-[#5f6368]">
                                      {formatTime(msg.timestamp)}
                                    </span>
                                    {isUser && (
                                      <span className={`text-[13px] leading-none ${msg.deliveryStatus === 'read' ? 'text-[#34b7f1]' : 'text-[#8696A0]'}`}>
                                        ✓✓
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {msg.pendingSuggestions > 0 && (
                                  <p className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${
                                    !isUser ? 'text-amber-600 justify-start' : 'text-[#34b7f1] justify-end'
                                  }`}>
                                    <Zap size={10} />
                                    {selectedMsgId === msg.id ? 'Suggestions ready ↓' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Inline AI insight card */}
                            {showInsight && timelineInsights[0] && (
                              <div className="py-2 px-2">
                                <InlineAICard insight={timelineInsights[0]} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}



                </div>

                {/* Reply dock */}
                <div className="border-t border-gray-200/60 bg-white/95 backdrop-blur-md flex-shrink-0 sticky bottom-0 z-20 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.06)]">

                  {/* AI result card */}
                  {aiActionResult && (
                    <div className="mx-3 mt-2 bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={11} className="text-indigo-500" />
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{aiActionResult.label}</p>
                        </div>
                        <button onClick={() => setAIActionResult(null)} className="p-0.5 text-indigo-300 hover:text-indigo-500 transition-colors">
                          <X size={11} />
                        </button>
                      </div>
                      <p className="px-3 pb-2.5 text-xs text-gray-700 leading-relaxed">{aiActionResult.text}</p>
                      <div className="flex border-t border-indigo-100">
                        <button
                          onClick={() => { setDraft(aiActionResult.text); setAIActionResult(null); setShowAIActions(false); setTimeout(() => draftRef.current?.focus(), 50) }}
                          className="flex-1 text-[11px] font-semibold text-indigo-700 py-2 hover:bg-indigo-100 transition-colors"
                        >
                          Use as draft
                        </button>
                        <div className="w-px bg-indigo-100" />
                        <button
                          onClick={() => setAIActionResult(null)}
                          className="flex-1 text-[11px] text-gray-500 py-2 hover:bg-gray-50 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AI Actions expanded panel */}
                  {showAIActions && (
                    <div className="mx-3 mt-2 bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={aiSummarize}
                          disabled={aiActionLoading === 'summarize'}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-50 transition-colors"
                        >
                          {aiActionLoading === 'summarize' ? <RefreshCw size={10} className="animate-spin" /> : <FileText size={10} />}
                          Summarize
                        </button>
                        <button
                          onClick={aiFollowup}
                          disabled={aiActionLoading === 'followup'}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-50 transition-colors"
                        >
                          {aiActionLoading === 'followup' ? <RefreshCw size={10} className="animate-spin" /> : <ChevronRight size={10} />}
                          Follow-up draft
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={aiAskInput}
                          onChange={e => setAIAskInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiAsk() } }}
                          placeholder="Ask AI anything about this conversation…"
                          className="flex-1 text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
                        />
                        <button
                          onClick={aiAsk}
                          disabled={!aiAskInput.trim() || aiActionLoading === 'ask'}
                          className="flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                        >
                          {aiActionLoading === 'ask' ? <RefreshCw size={10} className="animate-spin" /> : <Wand2 size={10} />}
                          Ask
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggestion chips */}
{suggestions.length > 0 && (
  <div className="px-4 pt-4 pb-1 grid grid-cols-3 gap-3">
    {suggestions.slice(0, 3).map(s => (
      <button
        key={s.id}
        onClick={() => { setDraft(s.text); draftRef.current?.focus() }}
        className={`
          group relative rounded-2xl p-3 text-left transition-all duration-300 ease-out
          border border-neutral-200/60 dark:border-neutral-800/60
          bg-gradient-to-b from-white to-neutral-50/50 
          dark:from-neutral-900 dark:to-neutral-950/50
          shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]
          hover:shadow-[0_12px_20px_-8px_rgba(0,0,0,0.08)]
          hover:-translate-y-0.5 hover:border-neutral-300 dark:hover:border-neutral-700
          active:translate-y-0 active:scale-[0.98]
          focus:outline-none focus:ring-2 focus:ring-indigo-500/20
          ${TONE_STYLE[s.tone] ?? ''}
        `}
      >
        {/* Premium Animated Hover Glow Effect */}
        <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-1.5">
          {/* Tone Badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium tracking-wide uppercase text-[9px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/50 dark:group-hover:text-indigo-400 transition-colors duration-300">
            <span className="h-1 w-1 rounded-full bg-neutral-400 group-hover:bg-indigo-500 transition-colors" />
            {s.tone}
          </span>
          
          {/* Confidence Score */}
          {s.confidence != null && (
            <span className="text-[10px] font-medium font-mono text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
              {s.confidence}%
            </span>
          )}
        </div>

        {/* Suggestion Text */}
        <p className="line-clamp-2 leading-relaxed text-[11px] font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors duration-300">
          {s.text}
        </p>
      </button>
    ))}
  </div>
)}
{/* Composer */}
<div className="px-4 pb-5 pt-2 bg-gradient-to-t from-white via-white to-transparent dark:from-neutral-950 dark:via-neutral-950">
  <div className="flex flex-col gap-2.5">
    {/* Main Input Capsule */}
    <div className="group/input relative flex items-end gap-2 p-1.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-md focus-within:border-neutral-300 dark:focus-within:border-neutral-700 focus-within:bg-white dark:focus-within:bg-neutral-900 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-all duration-300">
      
      {/* Attachment Button */}
      <button className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 active:scale-95 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all flex-shrink-0 mb-0.5">
        <Paperclip size={18} strokeWidth={2.2} />
      </button>
      
      {/* Dynamic Textarea */}
      <div className="flex-1 min-w-0 self-center py-1">
        <textarea
          ref={draftRef}
          rows={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendDraft() }
          }}
          placeholder="Type a message…"
          className="w-full resize-none bg-transparent px-1 text-[14px] md:text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none leading-relaxed align-middle"
          style={{ minHeight: '24px', maxHeight: '140px' }}
        />
      </div>

      {/* Emoji Picker Button */}
      <button className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 active:scale-95 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all flex-shrink-0 mb-0.5">
        <Smile size={18} strokeWidth={2.2} />
      </button>

      {/* Premium Send Button */}
      <button
        onClick={sendDraft}
        disabled={!draft.trim()}
        className={`
          p-2.5 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-300 ease-out shadow-sm
          ${draft.trim() 
            ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-indigo-500/20 active:scale-95 hover:brightness-110' 
            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed opacity-70'
          }
        `}
      >
        <Send size={15} strokeWidth={2.5} className={draft.trim() ? 'animate-pulse' : ''} />
      </button>
    </div>

    {/* Footer Meta & Actions */}
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-3">
        {selectedMsgId && (
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:opacity-80 font-semibold disabled:opacity-50 transition-opacity"
          >
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
            {regenerating ? 'Generating…' : 'Regenerate'}
          </button>
        )}
        
        {/* Smart AI Action Trigger */}
        <button
          onClick={() => { setShowAIActions(v => !v); setAIActionResult(null) }}
          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
            showAIActions 
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20' 
              : 'text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/60 hover:bg-neutral-200'
          }`}
        >
          <Sparkles size={12} className={showAIActions ? 'fill-indigo-500/20' : ''} />
          <span>AI Actions</span>
          <ChevronDown size={11} className={`transition-transform duration-300 ${showAIActions ? 'rotate-180' : ''}`} />
        </button>
      </div>
      
      {/* Desktop-only shortcut indicator (hidden on mobile) */}
      <span className="hidden sm:inline-block text-[10px] font-medium font-mono text-neutral-400 dark:text-neutral-600 tracking-wider">
        ⌘ + ↵
      </span>
    </div>
  </div>
</div>


                </div>
              </div>

  
                

              {/* ── Right: Intelligence panel (desktop) ─────────────────────── */}
              {showAIPanel && (
                <div className="hidden md:flex w-[320px] xl:w-[340px] border-l border-gray-200 flex-col flex-shrink-0 overflow-hidden">
                  <IntelPanel
                    contact={contact}
                    contactDetail={contactDetail}
                    selectedConv={selectedConv}
                    contextData={contextData}
                    contextLoading={loadingContext}
                    suggestions={suggestions}
                    regenerating={regenerating}
                    actionLoading={actionLoading}
                    mode={mode}
                    notes={notes}
                    newNote={newNote}
                    editingSuggId={editingSuggId}
                    editedText={editedText}
                    aiTab={aiTab}
                    messages={messages}
                    noteRef={noteRef}
                    onTabChange={setAiTab}
                    onApprove={approveSuggestion}
                    onDismiss={dismissSuggestion}
                    onRegenerate={regenerate}
                    onSetDraft={setDraft}
                    onAddNote={addNote}
                    onNoteChange={setNewNote}
                    onEditSugg={setEditingSuggId}
                    onEditedTextChange={setEditedText}
                    onClose={() => setShowAIPanel(false)}
                    draftFocus={() => draftRef.current?.focus()}
                    promises={promises}
                    onApproveProactive={approveProactive}
                    onSnoozeProactive={snoozeProactive}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-stone-50">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Select a conversation</p>
            <p className="text-xs text-gray-500 mb-6">Choose from the list on the left.</p>
            <div className="flex items-center gap-5 text-xs text-gray-400">
              {[['⌘K', 'Search'], ['R', 'Regenerate'], ['⌘↵', 'Send']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono shadow-sm">{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile: Intel view ───────────────────────────────────────────────── */}
      {mobileView === 'intel' && selectedId && contact && (
        <div className="md:hidden flex flex-col flex-1 min-w-0">
          {/* Mobile intel header */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-white flex-shrink-0">
            <button onClick={() => setMobileView('thread')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
              <p className="text-xs text-indigo-500 font-medium">AI Intelligence</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <IntelPanel
              contact={contact}
              contactDetail={contactDetail}
              selectedConv={selectedConv}
              contextData={contextData}
              contextLoading={loadingContext}
              suggestions={suggestions}
              regenerating={regenerating}
              actionLoading={actionLoading}
              mode={mode}
              notes={notes}
              newNote={newNote}
              editingSuggId={editingSuggId}
              editedText={editedText}
              aiTab={aiTab}
              messages={messages}
              noteRef={noteRef}
              onTabChange={setAiTab}
              onApprove={approveSuggestion}
              onDismiss={dismissSuggestion}
              onRegenerate={regenerate}
              onSetDraft={text => { setDraft(text); setMobileView('thread') }}
              onAddNote={addNote}
              onNoteChange={setNewNote}
              onEditSugg={setEditingSuggId}
              onEditedTextChange={setEditedText}
              onClose={() => setMobileView('thread')}
              draftFocus={() => { setMobileView('thread'); setTimeout(() => draftRef.current?.focus(), 100) }}
              promises={promises}
              onApproveProactive={approveProactive}
              onSnoozeProactive={snoozeProactive}
            />
          </div>
        </div>
      )}
    </div>
  )
  }
