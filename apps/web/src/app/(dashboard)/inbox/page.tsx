'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, ChevronLeft, ChevronDown, ChevronUp, Zap, RefreshCw, X, MessageSquare,
  AlertCircle, Send, Paperclip, Smile, Archive, StickyNote,
  ExternalLink, ChevronRight, TrendingUp, Clock, Flame, Star,
  AlertTriangle, Calendar, DollarSign, CheckCircle, XCircle,
  Sparkles, Brain, Bell, Tag, Edit3, Copy, UserPlus, CreditCard,
  UserCheck, FileText, WifiOff, Lightbulb, Activity,
  ShoppingCart, MessageCircle, MapPin, Download, Film,
  Image, Phone, Mic, Target, Hash, BarChart2, Bot, BookOpen,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, EmptyState, SkeletonListItem } from '@/components/ui'

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

interface ContactDetail {
  id: string
  name: string
  relationship: { type: string; healthScore: number; healthTrend: string }
  profile: {
    personalitySummary?: string
    moodBaseline?: string
    communicationStyle?: string
    goals?: string
    painPoints?: string
    buyingBehaviour?: string
    relationshipStage?: string
    preferences?: string
  } | null
  insights: Array<{ key: string; value: string; confidence: number; supportingText?: string }>
  healthHistory: Array<{ score: number; previousScore?: number; changeReason?: string; factors?: string[]; recordedAt: string }>
  proactiveSuggestions: Array<{ id: string; suggestionType: string; title: string; body: string; draftMessage?: string; priority?: string }>
  upcomingEvents: Array<{ id: string; eventType: string; title: string; eventDate: string; isRecurring?: boolean; confidence?: number }>
  stats?: { totalMessages: number; sent: number; received: number }
}

interface ContactDocument {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  storageUrl: string
  docCategory: string
  notes?: string
  uploadedAt: string
}

interface AgentInfo {
  id: string
  name: string
  roleTitle: string
  avatarEmoji: string
  trustLevel: string
  isActive: boolean
  agentType: string
  assignmentCount?: number
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

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'unread',      label: 'Unread' },
  { id: 'needs_reply', label: 'Needs Reply' },
  { id: 'hot_leads',   label: 'Hot Leads' },
  { id: 'vip',         label: 'VIP' },
  { id: 'waiting',     label: 'Waiting' },
  { id: 'at_risk',     label: 'At Risk' },
] as const

const PROACTIVE_ICONS: Record<string, string> = {
  follow_up: '🔔', meeting: '📅', offer: '💰', document: '📄',
  birthday: '🎂', anniversary: '🎉', health: '💙', check_in: '👋',
  re_engagement: '✨', milestone: '🏆', life_event: '🌟',
}

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const sw = size < 60 ? 5 : 6
  const r = (size - sw * 2) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const color = score >= 70 ? '#4F46E5' : score >= 40 ? '#B7791F' : '#B91C4A'
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#EDEBE8" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size < 60 ? 14 : 16, color: '#1C1B1F' }}>{score}</span>
        <span className="font-bold leading-none mt-0.5" style={{ fontSize: 9, color }}>{grade}</span>
      </div>
    </div>
  )
}

// ─── InlineAICard ─────────────────────────────────────────────────────────────

function InlineAICard({ insight }: { insight: AIInsight }) {
  const cfg = {
    opportunity: { icon: TrendingUp, bg: '#EAF7EE', border: '#C6E8CF', text: '#15803D', label: 'Opportunity' },
    alert:       { icon: AlertTriangle, bg: '#FBF3E3', border: '#F0DDB0', text: '#B7791F', label: 'Alert' },
    entity:      { icon: Sparkles, bg: '#EEEDFD', border: '#D4D1FB', text: '#4F46E5', label: 'AI Insight' },
  }[insight.type]
  const Icon = cfg.icon
  return (
    <div className="mx-auto w-fit max-w-xs rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon size={11} className="mt-0.5 flex-shrink-0" style={{ color: cfg.text }} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: cfg.text }}>{cfg.label}</p>
        <p className="text-xs leading-relaxed" style={{ color: '#1C1B1F' }}>{insight.text}</p>
      </div>
    </div>
  )
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#9A97A0' }}>
      {children}
    </p>
  )
}

// ─── SuggestionChip ───────────────────────────────────────────────────────────

function SuggestionChip({
  suggestion,
  onApprove,
  onDismiss,
  onRegenerate,
  regenerating,
  actionLoading,
}: {
  suggestion: Suggestion
  onApprove: (id: string, text?: string) => void
  onDismiss: (id: string) => void
  onRegenerate: () => void
  regenerating: boolean
  actionLoading: string | null
}) {
  const [showReasoning, setShowReasoning] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(suggestion.text)

  const isLoading = actionLoading === suggestion.id

  return (
    <div
      className="flex-shrink-0 w-[258px] rounded-[11px] transition-all"
      style={{ background: '#F6F5FE', border: '1px solid #E1DEFB', padding: '11px 12px 10px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase" style={{ color: '#4F46E5' }}>
          ⚡ {(suggestion.tone ?? 'reply').toUpperCase()}
        </span>
        <div className="flex items-center gap-1.5">
          {suggestion.confidence != null && (
            <span className="font-mono text-[10px]" style={{ color: '#9A97A0' }}>{suggestion.confidence}%</span>
          )}
          {suggestion.reasoning && (
            <button
              onClick={() => setShowReasoning(v => !v)}
              className="rounded p-0.5 transition-colors hover:bg-white/60"
              title="Show AI reasoning"
              style={{ color: showReasoning ? '#4F46E5' : '#9A97A0' }}
            >
              {showReasoning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
      </div>

      {/* Reasoning */}
      {showReasoning && suggestion.reasoning && (
        <div className="mb-2 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E1DEFB' }}>
          <p className="text-[11px] leading-relaxed italic" style={{ color: '#6B6870' }}>{suggestion.reasoning}</p>
        </div>
      )}

      {/* Text or edit textarea */}
      {editing ? (
        <textarea
          autoFocus
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-2.5 py-2 text-[12.5px] resize-none focus:outline-none leading-relaxed mb-2"
          style={{ background: 'white', border: '1px solid #C7C4F7', color: '#1C1B1F', fontSize: 12.5 }}
        />
      ) : (
        <p className="text-[12.5px] leading-[1.65] mb-2.5 line-clamp-3" style={{ color: '#1C1B1F' }}>
          {suggestion.text}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onApprove(suggestion.id, editing ? editText : undefined)}
          disabled={isLoading}
          className="flex-1 rounded-lg text-[11px] font-bold py-1.5 text-white transition-colors disabled:opacity-50"
          style={{ background: '#4F46E5' }}
          onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#3730A3' }}
          onMouseLeave={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#4F46E5' }}
        >
          {isLoading ? '…' : editing ? 'Send edited' : 'Send'}
        </button>
        <button
          onClick={() => { setEditing(v => !v); if (!editing) setEditText(suggestion.text) }}
          className="rounded-lg px-2.5 py-1.5 transition-colors"
          style={{ background: 'white', border: '1px solid #E1DEFB', color: '#4F46E5' }}
          title={editing ? 'Cancel edit' : 'Edit text'}
        >
          {editing ? <X size={11} /> : <Edit3 size={11} />}
        </button>
        <button
          onClick={() => onDismiss(suggestion.id)}
          disabled={isLoading}
          className="rounded-lg px-2 py-1.5 transition-opacity disabled:opacity-40"
          style={{ color: '#9A97A0' }}
          title="Dismiss"
        >
          <X size={11} />
        </button>
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
        active ? 'border-indigo-500' : 'hover:bg-white/70 border-transparent'
      }`}
      style={{ background: active ? '#EEEDFD' : undefined }}
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
          <span className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {conv.contact.name}
          </span>
          <span className="text-[10px] flex-shrink-0 tabular-nums font-mono" style={{ color: '#9A97A0' }}>{formatTime(conv.lastMessageAt)}</span>
        </div>
        <p className={`text-[12px] truncate mb-1.5 ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
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
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border" style={{ color: '#4F46E5', background: '#EEEDFD', borderColor: '#C7C4F7' }}>
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

// ─── Intel Panel ──────────────────────────────────────────────────────────────

type AITab = 'overview' | 'memory' | 'activity' | 'files'

interface IntelPanelProps {
  contact: Contact | null
  contactDetail: ContactDetail | null
  selectedConv: Conversation | null
  contextData: ConvContext | null
  contextLoading: boolean
  mode: string
  notes: InternalNote[]
  newNote: string
  aiTab: AITab
  documents: ContactDocument[]
  documentsLoading: boolean
  contactAgents: AgentInfo[]
  onTabChange: (t: AITab) => void
  onAddNote: () => void
  onNoteChange: (v: string) => void
  onClose: () => void
}

function IntelPanel({
  contact, contactDetail, selectedConv, contextData, contextLoading,
  mode, notes, newNote, aiTab, documents, documentsLoading, contactAgents,
  onTabChange, onAddNote, onNoteChange, onClose,
}: IntelPanelProps) {
  const TABS: { id: AITab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'memory',   label: 'Memory' },
    { id: 'activity', label: 'Activity' },
    { id: 'files',    label: 'Files' },
  ]

  const healthScore = contactDetail?.relationship?.healthScore ?? selectedConv?.healthScore ?? 0
  const leadScore = contact?.leadScore ?? selectedConv?.leadScore ?? 0

  // Build extracted entity list from context
  const extractedEntities: Array<{ icon: string; type: string; value: string }> = []
  if (contextData?.buyingSignals?.length) {
    contextData.buyingSignals.slice(0, 2).forEach(s =>
      extractedEntities.push({ icon: '💰', type: 'Signal', value: s })
    )
  }
  if (contextData?.intents?.length) {
    extractedEntities.push({ icon: '🎯', type: 'Intent', value: contextData.intents.slice(0, 2).map(i => i.replace(/_/g, ' ')).join(', ') })
  }
  if (contextData?.topTopics?.length) {
    extractedEntities.push({ icon: '💬', type: 'Topics', value: contextData.topTopics.slice(0, 3).join(', ') })
  }
  if (contextData?.nextAction) {
    extractedEntities.push({ icon: '✅', type: 'Next action', value: contextData.nextAction })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#FFFFFF' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #E8E6E3' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#EEEDFD' }}>
            <Brain size={13} style={{ color: '#4F46E5' }} />
          </div>
          <p className="text-[13px] font-semibold" style={{ color: '#1C1B1F' }}>
            {contact?.name ? contact.name.split(' ')[0] : 'Intelligence'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-gray-100" style={{ color: '#9A97A0' }}>
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 px-1" style={{ borderBottom: '1px solid #E8E6E3' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex-1 py-2.5 text-[11px] font-semibold transition-colors"
            style={{
              color: aiTab === tab.id ? '#4F46E5' : '#9A97A0',
              borderBottom: aiTab === tab.id ? '2px solid #4F46E5' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
        {aiTab === 'overview' && (
          <div style={{ borderColor: '#E8E6E3' }} className="divide-y divide-[#E8E6E3]">

            {/* AI Summary */}
            {contextData?.summary && (
              <section className="px-4 py-3.5">
                <SectionTitle>AI Summary</SectionTitle>
                <div className="rounded-xl p-3.5 text-[13px] leading-[1.65]"
                  style={{ background: '#F6F5FE', border: '1px solid #E1DEFB', color: '#1C1B1F' }}>
                  {contextData.summary}
                </div>
              </section>
            )}

            {/* Context loading */}
            {contextLoading && (
              <section className="px-4 py-3.5 space-y-2">
                {[1,2].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: '#F4F3F1' }} />)}
              </section>
            )}

            {/* Conversation Score */}
            {contact && (
              <section className="px-4 py-3.5">
                <SectionTitle>Conversation Score</SectionTitle>
                <div className="flex items-center gap-3.5">
                  <ScoreRing score={healthScore} size={52} />
                  <div className="space-y-1.5">
                    {healthScore >= 70 && (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#1C1B1F' }}>
                        <CheckCircle size={11} style={{ color: '#15803D' }} /> Fast response time
                      </div>
                    )}
                    {!contextData?.requiresResponse && (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#1C1B1F' }}>
                        <CheckCircle size={11} style={{ color: '#15803D' }} /> No pending questions
                      </div>
                    )}
                    {contextData?.buyingSignals?.length ? (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#1C1B1F' }}>
                        <CheckCircle size={11} style={{ color: '#15803D' }} /> Buying signals detected
                      </div>
                    ) : null}
                    {contextData?.requiresResponse && (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#B91C4A' }}>
                        <AlertCircle size={11} style={{ color: '#B91C4A' }} /> Awaiting your reply
                      </div>
                    )}
                  </div>
                </div>
                {/* Lead score bar (business mode) */}
                {mode !== 'personal' && leadScore > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-medium" style={{ color: '#9A97A0' }}>Lead score</span>
                      <span className="text-[10px] font-mono font-bold" style={{ color: leadScore > 70 ? '#4F46E5' : leadScore > 40 ? '#B7791F' : '#B91C4A' }}>
                        {leadScore}/100
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#EDEBE8' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${leadScore}%`,
                        background: leadScore > 70 ? '#4F46E5' : leadScore > 40 ? '#B7791F' : '#B91C4A',
                      }} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Profile */}
            {contactDetail?.profile && (
              <section className="px-4 py-3.5">
                <SectionTitle>Profile</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Communication', value: contactDetail.profile.communicationStyle },
                    { label: 'Mood baseline', value: contactDetail.profile.moodBaseline },
                    { label: 'Stage', value: contactDetail.profile.relationshipStage?.replace(/_/g, ' ') },
                    { label: 'Pipeline', value: contact?.pipelineStage?.replace(/_/g, ' ') },
                    { label: 'Goals', value: contactDetail.profile.goals },
                    { label: 'Pain points', value: contactDetail.profile.painPoints },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="rounded-lg p-2.5" style={{ background: '#F4F3F1' }}>
                      <p className="text-[10px] mb-0.5 capitalize" style={{ color: '#9A97A0' }}>{f.label}</p>
                      <p className="text-[12px] font-medium truncate capitalize" style={{ color: '#1C1B1F' }}>{f.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Live Insights */}
            {(contactDetail?.insights?.length ?? 0) > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>Live Insights</SectionTitle>
                <div className="space-y-3">
                  {contactDetail!.insights.slice(0, 5).map((ins, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: '#4F46E5' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-[1.6]" style={{ color: '#1C1B1F' }}>{ins.value}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: '#EDEBE8' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.round(ins.confidence * 100)}%`, background: '#4F46E5' }} />
                          </div>
                          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#9A97A0' }}>
                            {Math.round(ins.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Extracted Entities */}
            {extractedEntities.length > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>Extracted Entities</SectionTitle>
                <div className="space-y-2">
                  {extractedEntities.map((entity, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1">
                      <span className="text-base leading-none flex-shrink-0">{entity.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide mr-1.5" style={{ color: '#9A97A0' }}>
                          {entity.type}
                        </span>
                        <span className="text-[12.5px]" style={{ color: '#1C1B1F' }}>{entity.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Suggested Next Actions */}
            {(contactDetail?.proactiveSuggestions?.length ?? 0) > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>Suggested Next Actions</SectionTitle>
                <div className="space-y-2.5">
                  {contactDetail!.proactiveSuggestions.slice(0, 4).map(s => (
                    <div key={s.id} className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base" style={{ background: '#F4F3F1' }}>
                        {PROACTIVE_ICONS[s.suggestionType] ?? '✨'}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-[12.5px] font-semibold leading-tight" style={{ color: '#1C1B1F' }}>{s.title}</p>
                        <p className="text-[11.5px] mt-0.5 leading-relaxed line-clamp-2" style={{ color: '#6B6870' }}>{s.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Automation */}
            {contactAgents.length > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>Automation</SectionTitle>
                <div className="space-y-2">
                  {contactAgents.slice(0, 3).map(agent => (
                    <div key={agent.id} className="rounded-xl p-3" style={{ background: '#F4F3F1' }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: agent.isActive ? '#15803D' : '#9A97A0' }} />
                        <span className="text-[12.5px] font-semibold" style={{ color: '#1C1B1F' }}>
                          {agent.avatarEmoji} {agent.name}
                        </span>
                        <span className="ml-auto text-[10px] font-medium" style={{ color: agent.isActive ? '#15803D' : '#9A97A0' }}>
                          {agent.isActive ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-[11px] pl-4" style={{ color: '#6B6870' }}>{agent.roleTitle}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Knowledge Used */}
            {contextData && (
              <section className="px-4 py-3.5">
                <SectionTitle>Knowledge Used</SectionTitle>
                <div className="space-y-1.5">
                  {contextData.topTopics.slice(0, 3).map((topic, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]" style={{ color: '#1C1B1F' }}>
                      <CheckCircle size={11} style={{ color: '#15803D' }} className="flex-shrink-0" />
                      <span className="capitalize">{topic.replace(/_/g, ' ')} context</span>
                    </div>
                  ))}
                  {contextData.topTopics.length === 0 && (
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: '#1C1B1F' }}>
                      <CheckCircle size={11} style={{ color: '#15803D' }} className="flex-shrink-0" />
                      Conversation history analysed
                    </div>
                  )}
                  {contextData.analysedAt && (
                    <p className="text-[10px] mt-1 font-mono" style={{ color: '#9A97A0' }}>
                      Analysed {formatTime(contextData.analysedAt)}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Empty state */}
            {!contact && !contextLoading && (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <Brain size={28} className="mb-3" style={{ color: '#EDEBE8' }} />
                <p className="text-[13px] font-medium" style={{ color: '#6B6870' }}>Select a conversation</p>
                <p className="text-[12px] mt-1" style={{ color: '#9A97A0' }}>Intelligence builds as you engage</p>
              </div>
            )}
          </div>
        )}

        {/* ── MEMORY ──────────────────────────────────────────────────────── */}
        {aiTab === 'memory' && (
          <div className="divide-y" style={{ borderColor: '#E8E6E3' }}>

            {/* Personality */}
            {(contextData?.personalitySummary || contactDetail?.profile?.personalitySummary) && (
              <section className="px-4 py-3.5">
                <SectionTitle>Personality</SectionTitle>
                <p className="text-[13px] leading-[1.65]" style={{ color: '#1C1B1F' }}>
                  {contextData?.personalitySummary ?? contactDetail?.profile?.personalitySummary}
                </p>
                {(contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle) && (
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <MessageCircle size={11} style={{ color: '#9A97A0' }} />
                    <p className="text-[12px]" style={{ color: '#6B6870' }}>
                      {contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Intents + topics */}
            {contextData && (contextData.topTopics.length > 0 || contextData.intents.length > 0) && (
              <section className="px-4 py-3.5">
                {contextData.intents.length > 0 && (
                  <div className="mb-3.5">
                    <SectionTitle>Intent Signals</SectionTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {contextData.intents.map(intent => (
                        <span key={intent} className="px-2 py-0.5 text-[11px] font-medium rounded-full border capitalize"
                          style={{ background: '#EEEDFD', color: '#4F46E5', borderColor: '#C7C4F7' }}>
                          {intent.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {contextData.topTopics.length > 0 && (
                  <div>
                    <SectionTitle>Key Topics</SectionTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {contextData.topTopics.map(topic => (
                        <span key={topic} className="px-2 py-0.5 text-[11px] font-medium rounded-full capitalize"
                          style={{ background: '#F4F3F1', color: '#6B6870' }}>
                          {topic.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* AI Memory / insights */}
            {(contextData?.insights?.length ?? 0) > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>AI Memory</SectionTitle>
                <div className="space-y-2.5">
                  {contextData!.insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8B85F7' }} />
                      <div>
                        <p className="text-[13px] leading-relaxed" style={{ color: '#1C1B1F' }}>{ins.value}</p>
                        <p className="text-[10px] mt-0.5 capitalize" style={{ color: '#9A97A0' }}>{ins.key?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Private notes */}
            <section className="px-4 py-3.5 space-y-3">
              <SectionTitle>Private Notes</SectionTitle>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E8E6E3' }}>
                <textarea
                  value={newNote}
                  onChange={e => onNoteChange(e.target.value)}
                  placeholder="Add a private note — only your team sees this…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-[12px] resize-none focus:outline-none placeholder-gray-400"
                  style={{ borderBottom: '1px solid #F4F3F1', color: '#1C1B1F', background: 'white' }}
                />
                <div className="flex justify-end px-3 py-2" style={{ background: '#F4F3F1' }}>
                  <button
                    onClick={onAddNote}
                    disabled={!newNote.trim()}
                    className="text-xs font-semibold px-3 py-1.5 text-white rounded-lg disabled:opacity-40 transition-colors"
                    style={{ background: '#4F46E5' }}
                  >
                    Save
                  </button>
                </div>
              </div>
              {notes.length === 0 ? (
                <div className="text-center py-4">
                  <StickyNote size={20} className="mx-auto mb-1.5" style={{ color: '#EDEBE8' }} />
                  <p className="text-[12px]" style={{ color: '#9A97A0' }}>No notes yet</p>
                </div>
              ) : notes.map(n => (
                <div key={n.id} className="rounded-xl p-3" style={{ background: '#FBF3E3', border: '1px solid #F0DDB0' }}>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#1C1B1F' }}>{n.text}</p>
                  <p className="text-[10px] mt-1.5" style={{ color: '#B7791F' }}>{n.author} · {formatTime(n.createdAt)}</p>
                </div>
              ))}
            </section>

            {!contextData && !contextLoading && (
              <div className="px-4 py-10 text-center">
                <Brain size={24} className="mx-auto mb-2" style={{ color: '#EDEBE8' }} />
                <p className="text-[13px] font-medium" style={{ color: '#6B6870' }}>No memory yet</p>
                <p className="text-[12px] mt-1" style={{ color: '#9A97A0' }}>AI context builds as conversations progress.</p>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ────────────────────────────────────────────────────── */}
        {aiTab === 'activity' && (
          <div className="divide-y" style={{ borderColor: '#E8E6E3' }}>

            {/* Stats */}
            {contactDetail?.stats && (
              <section className="px-4 py-3.5">
                <SectionTitle>Message Stats</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Total', value: contactDetail.stats.totalMessages },
                    { label: 'Sent', value: contactDetail.stats.sent },
                    { label: 'Received', value: contactDetail.stats.received },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: '#F4F3F1' }}>
                      <p className="text-[18px] font-bold leading-none" style={{ color: '#1C1B1F' }}>{s.value}</p>
                      <p className="text-[10px] mt-1" style={{ color: '#9A97A0' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming events */}
            {(contactDetail?.upcomingEvents?.length ?? 0) > 0 && (
              <section className="px-4 py-3.5">
                <SectionTitle>Upcoming Events</SectionTitle>
                <div className="space-y-2">
                  {contactDetail!.upcomingEvents.slice(0, 4).map(ev => (
                    <div key={ev.id} className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base" style={{ background: '#F4F3F1' }}>
                        {ev.eventType === 'birthday' ? '🎂' : ev.eventType === 'anniversary' ? '🎉' : ev.eventType === 'meeting' ? '📅' : '📌'}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-[12.5px] font-semibold" style={{ color: '#1C1B1F' }}>{ev.title}</p>
                        <p className="text-[11px] font-mono mt-0.5" style={{ color: '#9A97A0' }}>
                          {new Date(ev.eventDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Relationship health timeline */}
            {(contactDetail?.healthHistory?.length ?? 0) > 0 ? (
              <section className="px-4 py-3.5">
                <SectionTitle>Relationship Timeline</SectionTitle>
                <div className="relative">
                  <div className="absolute left-[11px] top-3 bottom-3 w-px" style={{ background: '#E8E6E3' }} />
                  <div className="space-y-4">
                    {contactDetail!.healthHistory.slice(0, 8).map((h, i) => {
                      const improved = h.previousScore != null && h.score > h.previousScore
                      const declined = h.previousScore != null && h.score < h.previousScore
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-white border-2 flex items-center justify-center flex-shrink-0 z-10"
                            style={{ borderColor: improved ? '#15803D' : declined ? '#B91C4A' : '#E8E6E3' }}>
                            <Activity size={9} style={{ color: improved ? '#15803D' : declined ? '#B91C4A' : '#9A97A0' }} />
                          </div>
                          <div className="pt-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[12.5px] font-semibold" style={{ color: '#1C1B1F' }}>Health: {h.score}</p>
                              {h.previousScore != null && (
                                <span className="text-[10px] font-mono"
                                  style={{ color: h.score > h.previousScore ? '#15803D' : '#B91C4A' }}>
                                  {h.score > h.previousScore ? '↑' : '↓'}{Math.abs(h.score - h.previousScore)}
                                </span>
                              )}
                            </div>
                            {h.changeReason && (
                              <p className="text-[11.5px] mt-0.5 leading-relaxed" style={{ color: '#6B6870' }}>{h.changeReason}</p>
                            )}
                            <p className="text-[10px] mt-0.5 font-mono" style={{ color: '#9A97A0' }}>{formatTime(h.recordedAt)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            ) : (
              <div className="px-4 py-10 text-center">
                <Activity size={24} className="mx-auto mb-2" style={{ color: '#EDEBE8' }} />
                <p className="text-[13px] font-medium" style={{ color: '#6B6870' }}>No history yet</p>
                <p className="text-[12px] mt-1" style={{ color: '#9A97A0' }}>Timeline builds as the relationship evolves.</p>
              </div>
            )}
          </div>
        )}

        {/* ── FILES ───────────────────────────────────────────────────────── */}
        {aiTab === 'files' && (
          <div className="p-4">
            <SectionTitle>Shared Files</SectionTitle>
            {documentsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#F4F3F1' }} />)}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-10">
                <FileText size={24} className="mx-auto mb-2" style={{ color: '#EDEBE8' }} />
                <p className="text-[13px]" style={{ color: '#9A97A0' }}>No files shared yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors group cursor-pointer"
                    style={{ background: '#F4F3F1', border: '1px solid transparent' }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = '#EDEBE8'}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = '#F4F3F1'}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'white', border: '1px solid #E8E6E3' }}>
                      <FileText size={15} style={{ color: '#4F46E5' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold truncate" style={{ color: '#1C1B1F' }}>{doc.fileName}</p>
                      <p className="text-[11px]" style={{ color: '#9A97A0' }}>
                        {formatFileSize(doc.fileSize)} · {formatTime(doc.uploadedAt)}
                      </p>
                    </div>
                    <Download size={13} className="flex-shrink-0 transition-colors" style={{ color: '#9A97A0' }} />
                  </a>
                ))}
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
  const [documents, setDocuments] = useState<ContactDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [contactAgents, setContactAgents] = useState<AgentInfo[]>([])
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
  const [isOnline, setIsOnline] = useState(true)

  const selectedIdRef = useRef<string | null>(null)
  const selectedMsgIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)

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

  // Load agents once on mount
  useEffect(() => {
    if (!token) return
    apiClient<{ agents: AgentInfo[] }>('/api/agents', { token })
      .then(d => setContactAgents((d.agents ?? []).filter((a: AgentInfo) => a.isActive)))
      .catch(() => {})
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
    setDraft(''); setAiTab('overview'); setContextData(null)
    setDocuments([]); setDocumentsLoading(false)
    if (!token) return
    const data = await apiClient<{ messages: Message[]; contact: Contact }>(
      `/api/conversations/${convId}/messages`, { token }
    )
    setMessages(data.messages); setContact(data.contact); setLoadingMsgs(false)
    if (data.contact?.id) {
      // Load full contact detail
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${data.contact.id}`, { token })
        .then(d => setContactDetail(d.contact)).catch(() => {})
      // Load documents
      setDocumentsLoading(true)
      apiClient<{ documents: ContactDocument[] }>(`/api/contacts/${data.contact.id}/documents`, { token })
        .then(d => setDocuments(d.documents ?? []))
        .catch(() => setDocuments([]))
        .finally(() => setDocumentsLoading(false))
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
    setActionLoading(null)
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

  const intelPanelProps: IntelPanelProps = {
    contact, contactDetail, selectedConv, contextData, contextLoading: loadingContext,
    mode, notes, newNote, aiTab, documents, documentsLoading, contactAgents,
    onTabChange: setAiTab, onAddNote: addNote, onNoteChange: setNewNote,
    onClose: () => setShowAIPanel(false),
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#FAFAF9' }}>

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs font-medium text-center py-2 flex items-center justify-center gap-2">
          <WifiOff size={13} />
          You are offline — messages will be queued when you reconnect.
        </div>
      )}

      {/* ── Left: Conversation list ──────────────────────────────────────────── */}
      <div className={`${mobileView !== 'list' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[272px] border-r flex-shrink-0`}
        style={{ background: '#FFFFFF', borderColor: '#E8E6E3' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #E8E6E3' }}>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold" style={{ color: '#1C1B1F' }}>Inbox</h1>
            {totalUnread > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(v => !v)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: showSearch ? '#4F46E5' : '#9A97A0', background: showSearch ? '#EEEDFD' : 'transparent' }}
            >
              <Search size={15} />
            </button>
            <a
              href="/inbox/queue"
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: '#4F46E5', background: '#EEEDFD' }}
            >
              <Zap size={12} />
              Queue
            </a>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #F4F3F1' }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9A97A0' }} />
              <input
                autoFocus type="search" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                style={{ background: '#F4F3F1', border: '1px solid #E8E6E3', color: '#1C1B1F' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: '#9A97A0' }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0 no-scrollbar" style={{ borderBottom: '1px solid #F4F3F1' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={filter === f.id
                ? { background: '#4F46E5', color: 'white' }
                : { background: '#F4F3F1', color: '#6B6870' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {!loading && conversations.length > 0 && (
          <div className="flex items-center divide-x flex-shrink-0 px-3 py-2" style={{ borderBottom: '1px solid #E8E6E3', borderColor: '#E8E6E3' }}>
            <div className="flex items-center gap-1.5 flex-1 pr-3">
              <MessageSquare size={11} style={{ color: '#8B85F7' }} />
              <div>
                <p className="text-[9px] leading-none" style={{ color: '#9A97A0' }}>Unread</p>
                <p className="text-xs font-bold leading-none mt-0.5" style={{ color: '#1C1B1F' }}>{totalUnread}</p>
              </div>
            </div>
            {mode !== 'personal' && (
              <div className="flex items-center gap-1.5 flex-1 px-3">
                <Flame size={11} style={{ color: '#B91C4A' }} />
                <div>
                  <p className="text-[9px] leading-none" style={{ color: '#9A97A0' }}>Hot leads</p>
                  <p className="text-xs font-bold leading-none mt-0.5" style={{ color: '#1C1B1F' }}>{hotLeads}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-1 pl-3">
              <Activity size={11} style={{ color: '#15803D' }} />
              <div>
                <p className="text-[9px] leading-none" style={{ color: '#9A97A0' }}>Avg health</p>
                <p className="text-xs font-bold leading-none mt-0.5" style={{ color: '#1C1B1F' }}>{avgHealth}%</p>
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
            <div className="divide-y" style={{ borderColor: '#F4F3F1' }}>
              {filtered.map(conv => (
                <ConvRow key={conv.id} conv={conv} active={selectedId === conv.id} onClick={() => selectConversation(conv.id)} mode={mode} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Chat ─────────────────────────────────────────────────────── */}
      <div className={`${mobileView === 'list' ? 'hidden md:flex' : mobileView === 'intel' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {selectedId && contact ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 shadow-sm"
              style={{ background: '#FFFFFF', borderBottom: '1px solid #E8E6E3' }}>
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden p-2 -ml-2 rounded-lg transition-colors"
                style={{ color: '#9A97A0' }}
              >
                <ChevronLeft size={20} />
              </button>
              <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#1C1B1F' }}>{contact.name}</p>
                  {currentPriority && CurrentPIcon && (
                    <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${currentPriority.color}`}>
                      <CurrentPIcon size={9} />
                      {currentPriority.label}
                    </span>
                  )}
                </div>
                <p className="text-[12px] truncate" style={{ color: '#9A97A0' }}>
                  {contact.phone ?? contactDetail?.relationship?.type?.replace(/_/g, ' ') ?? 'WhatsApp'}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button className="p-2 rounded-lg transition-colors hover:bg-gray-100" title="Add note"
                  style={{ color: '#9A97A0' }}
                  onClick={() => { setShowAIPanel(true); setAiTab('memory') }}>
                  <StickyNote size={16} />
                </button>
                <a href={`/contacts/${contact.id}`} className="p-2 rounded-lg transition-colors hover:bg-gray-100" title="Open CRM"
                  style={{ color: '#9A97A0' }}>
                  <ExternalLink size={16} />
                </a>
                <button className="p-2 rounded-lg transition-colors hover:bg-gray-100" title="Archive"
                  style={{ color: '#9A97A0' }}>
                  <Archive size={16} />
                </button>
                {/* Mobile intel button */}
                <button
                  onClick={() => setMobileView('intel')}
                  className="md:hidden flex items-center gap-1.5 ml-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg"
                  style={{ background: '#EEEDFD', color: '#4F46E5' }}
                >
                  <Brain size={12} />
                  Intel
                </button>
                {/* Desktop intel toggle */}
                <button
                  onClick={() => setShowAIPanel(v => !v)}
                  className="hidden md:flex p-2 rounded-lg transition-colors"
                  style={{ color: showAIPanel ? '#4F46E5' : '#9A97A0', background: showAIPanel ? '#EEEDFD' : 'transparent' }}
                  title="AI Intelligence Panel"
                >
                  <Brain size={16} />
                </button>
              </div>
            </div>

            {/* Messages + intel row */}
            <div className="flex flex-1 min-h-0">
              {/* Message area */}
              <div className="flex flex-col flex-1 min-w-0" style={{ background: '#FAFAF9' }}>

                {/* Message stream */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {loadingMsgs ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <div className={`h-10 rounded-2xl animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-36'}`} style={{ background: '#EDEBE8' }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => {
                        const isUser = msg.senderType === 'user'
                        const isApproved = msg.approvalMode === 'approved'
                        const isAuto = msg.approvalMode === 'autonomous'
                        const showInsight = !isUser && timelineInsights.length > 0 && idx === messages.length - 2

                        return (
                          <div key={msg.id}>
                            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                              <div
                                onClick={() => msg.pendingSuggestions > 0 && selectMessage(msg.id)}
                                className={`max-w-[75%] md:max-w-sm ${msg.pendingSuggestions > 0 ? 'cursor-pointer' : ''}`}
                              >
                                <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm relative ${
                                  isAuto
                                    ? 'rounded-br-sm'
                                    : isApproved
                                    ? 'rounded-br-sm border-l-4'
                                    : isUser
                                    ? 'rounded-br-sm'
                                    : 'rounded-bl-sm'
                                } ${msg.pendingSuggestions > 0 && selectedMsgId !== msg.id ? 'ring-2 ring-amber-300' : ''}
                                  ${selectedMsgId === msg.id ? 'ring-2 ring-indigo-400' : ''}`}
                                  style={
                                    isAuto
                                      ? { background: 'linear-gradient(135deg, #322F8A, #3D38A8)', color: 'white', borderColor: '#4F46E5' }
                                      : isApproved
                                      ? { background: '#1C1B1F', color: 'white', borderLeftColor: '#4F46E5' }
                                      : isUser
                                      ? { background: '#4F46E5', color: 'white' }
                                      : { background: '#FFFFFF', color: '#1C1B1F', border: '1px solid #E8E6E3' }
                                  }
                                >
                                  {isAuto && (
                                    <span className="absolute -top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
                                      style={{ background: '#4F46E5' }}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      AUTO-SENT
                                    </span>
                                  )}
                                  <MessageContent msg={msg} token={token} isUser={isUser} />
                                  <div className="flex items-center justify-between gap-2 mt-0.5">
                                    <span className="text-[10px]" style={{ color: isUser ? 'rgba(255,255,255,0.6)' : '#9A97A0' }}>
                                      {formatTime(msg.timestamp)}
                                    </span>
                                    {isUser && msg.deliveryStatus === 'read' && (
                                      <span className="text-[10px] font-medium" style={{ color: isAuto ? '#8B85F7' : '#8B85F7' }}>✓✓</span>
                                    )}
                                  </div>
                                </div>
                                {msg.pendingSuggestions > 0 && (
                                  <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
                                    !isUser ? 'justify-start' : 'justify-end'
                                  }`} style={{ color: selectedMsgId === msg.id ? '#4F46E5' : '#B7791F' }}>
                                    <Zap size={10} />
                                    {selectedMsgId === msg.id ? 'Suggestions ready ↓' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Inline AI insight */}
                            {showInsight && timelineInsights[0] && (
                              <div className="py-2">
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
                <div className="flex-shrink-0" style={{ background: '#FFFFFF', borderTop: '1px solid #E8E6E3' }}>

                  {/* AI Suggestion chips */}
                  {(suggestions.length > 0 || regenerating) && (
                    <div className="px-3 pt-3 pb-0">
                      {regenerating ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                          <p className="text-xs" style={{ color: '#9A97A0' }}>Generating suggestions…</p>
                        </div>
                      ) : (
                        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
                          {suggestions.map(s => (
                            <SuggestionChip
                              key={s.id}
                              suggestion={s}
                              onApprove={approveSuggestion}
                              onDismiss={dismissSuggestion}
                              onRegenerate={regenerate}
                              regenerating={regenerating}
                              actionLoading={actionLoading}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Composer */}
                  <div className="px-3 py-3">
                    <div className="flex items-end gap-2">
                      <button className="p-2 rounded-lg transition-colors flex-shrink-0" style={{ color: '#9A97A0' }}>
                        <Paperclip size={17} />
                      </button>
                      <div className="flex-1">
                        <textarea
                          ref={draftRef}
                          rows={1}
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendDraft() }
                          }}
                          placeholder={`Message ${contact.name.split(' ')[0]}, or type / for commands…`}
                          className="w-full resize-none px-4 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all leading-relaxed"
                          style={{ background: '#F4F3F1', border: '1px solid #E8E6E3', color: '#1C1B1F', minHeight: 42, maxHeight: 128 }}
                        />
                      </div>
                      <button className="p-2 rounded-lg transition-colors flex-shrink-0" style={{ color: '#9A97A0' }}>
                        <Smile size={17} />
                      </button>
                      <button
                        onClick={sendDraft}
                        disabled={!draft.trim()}
                        className="p-2.5 rounded-[9px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
                        style={{ background: '#4F46E5', color: 'white' }}
                      >
                        <Send size={15} />
                      </button>
                    </div>
                    {selectedMsgId && (
                      <div className="flex items-center justify-between mt-1.5">
                        <button
                          onClick={regenerate}
                          disabled={regenerating}
                          className="flex items-center gap-1 text-xs font-medium disabled:opacity-50 transition-colors"
                          style={{ color: '#4F46E5' }}
                        >
                          <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} />
                          {regenerating ? 'Generating…' : 'Regenerate AI reply'}
                        </button>
                        <div className="flex items-center gap-2 text-[10px]" style={{ color: '#9A97A0' }}>
                          <span className="font-mono">R</span>
                          <span>·</span>
                          <span className="font-mono">⌘↵</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Command hints */}
                  <div className="flex items-center gap-4 px-4 pb-2.5 text-[11px]" style={{ color: '#9A97A0' }}>
                    <span><span className="font-semibold" style={{ color: '#6B6870' }}>/summarize</span> conversation</span>
                    <span><span className="font-semibold" style={{ color: '#6B6870' }}>/log</span> CRM note</span>
                    <span><span className="font-semibold" style={{ color: '#6B6870' }}>/research</span> ask Zuri</span>
                  </div>
                </div>
              </div>

              {/* ── Right: Intelligence panel (desktop) ─────────────────────── */}
              {showAIPanel && (
                <div className="hidden md:flex w-[320px] xl:w-[340px] flex-col flex-shrink-0 overflow-hidden"
                  style={{ borderLeft: '1px solid #E8E6E3' }}>
                  <IntelPanel {...intelPanelProps} onClose={() => setShowAIPanel(false)} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ background: '#FAFAF9' }}>
            <div className="w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mb-4"
              style={{ background: '#FFFFFF', border: '1px solid #E8E6E3' }}>
              <MessageSquare size={28} style={{ color: '#9A97A0' }} />
            </div>
            <p className="text-[13px] font-semibold mb-1" style={{ color: '#1C1B1F' }}>Select a conversation</p>
            <p className="text-[12px] mb-6" style={{ color: '#9A97A0' }}>Choose from the list on the left.</p>
            <div className="flex items-center gap-5 text-[12px]" style={{ color: '#9A97A0' }}>
              {[['⌘K', 'Search'], ['R', 'Regenerate'], ['⌘↵', 'Send']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono shadow-sm"
                    style={{ background: '#FFFFFF', border: '1px solid #E8E6E3' }}>{key}</kbd>
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
          <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0"
            style={{ background: '#FFFFFF', borderBottom: '1px solid #E8E6E3' }}>
            <button onClick={() => setMobileView('thread')} className="p-2 -ml-2 rounded-lg" style={{ color: '#9A97A0' }}>
              <ChevronLeft size={20} />
            </button>
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: '#1C1B1F' }}>{contact.name}</p>
              <p className="text-[12px] font-medium" style={{ color: '#4F46E5' }}>AI Intelligence</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <IntelPanel
              {...intelPanelProps}
              onClose={() => setMobileView('thread')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
