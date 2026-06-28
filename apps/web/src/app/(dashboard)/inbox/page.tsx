'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, ChevronLeft, Zap, RefreshCw, X, MessageSquare,
  AlertCircle, Send, Paperclip, Smile, Archive, StickyNote,
  ExternalLink, ChevronRight, TrendingUp, Clock, Flame, Star,
  AlertTriangle, Calendar, DollarSign, CheckCircle, XCircle,
  Sparkles, Brain, Bell, Tag, Edit3, Copy, UserPlus, CreditCard,
  UserCheck, FileText, WifiOff, Info, Lightbulb, Activity,
  ShoppingCart, MessageCircle,
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

interface ContactDetail {
  id: string
  name: string
  relationship: { type: string; healthScore: number; healthTrend: string }
  profile: {
    personalitySummary: string
    moodBaseline: string
    communicationStyle?: string
    topInterests?: string[]
  } | null
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
  body: string | null
  timestamp: string
  pendingSuggestions: number
  deliveryStatus?: 'sent' | 'delivered' | 'read'
}

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
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

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_PRIORITY: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  hot_lead:       { label: 'Hot Lead',          color: 'bg-red-50 text-red-700 border-red-100',       icon: Flame },
  ready_to_buy:   { label: 'Ready to Buy',      color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: DollarSign },
  needs_followup: { label: 'Needs Follow-up',   color: 'bg-amber-50 text-amber-700 border-amber-100', icon: AlertTriangle },
  loyal:          { label: 'Loyal Customer',    color: 'bg-purple-50 text-purple-700 border-purple-100', icon: Star },
  dissatisfied:   { label: 'Dissatisfied',      color: 'bg-rose-50 text-rose-700 border-rose-100',    icon: XCircle },
  appointment:    { label: 'Appointment Today', color: 'bg-blue-50 text-blue-700 border-blue-100',    icon: Calendar },
  waiting:        { label: 'Waiting on You',    color: 'bg-gray-50 text-gray-600 border-gray-200',    icon: Clock },
}

const SENTIMENT_DOT: Record<string, string> = {
  happy: 'bg-emerald-400', neutral: 'bg-gray-300',
  frustrated: 'bg-amber-400', angry: 'bg-red-400',
}

const SENTIMENT_STYLE: Record<string, { badge: string; label: string }> = {
  positive: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Positive' },
  happy:    { badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Happy' },
  neutral:  { badge: 'bg-gray-50 text-gray-600 border-gray-200',          label: 'Neutral' },
  negative: { badge: 'bg-rose-50 text-rose-700 border-rose-100',          label: 'Negative' },
  frustrated:{ badge: 'bg-amber-50 text-amber-700 border-amber-100',      label: 'Frustrated' },
  angry:    { badge: 'bg-red-50 text-red-700 border-red-100',             label: 'Angry' },
}

const TONE_STYLE: Record<string, string> = {
  friendly:     'bg-emerald-50 text-emerald-800 border-emerald-100',
  professional: 'bg-blue-50 text-blue-800 border-blue-100',
  empathetic:   'bg-purple-50 text-purple-800 border-purple-100',
  casual:       'bg-gray-50 text-gray-700 border-gray-200',
  urgent:       'bg-amber-50 text-amber-800 border-amber-100',
  sales:        'bg-orange-50 text-orange-800 border-orange-100',
  firm:         'bg-slate-50 text-slate-700 border-slate-200',
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
  { label: 'Follow up tomorrow',  icon: Bell },
  { label: 'Offer 10% discount',  icon: Tag },
  { label: 'Send catalogue',       icon: FileText },
  { label: 'Book appointment',     icon: Calendar },
  { label: 'Create invoice',       icon: CreditCard },
]

const MOCK_TIMELINE: TimelineEvent[] = [
  { id: '1', type: 'message',   label: 'First contacted',         date: '3 months ago' },
  { id: '2', type: 'purchase',  label: 'Order placed — K2,400',   date: '2 months ago' },
  { id: '3', type: 'invoice',   label: 'Invoice sent',            date: '2 months ago' },
  { id: '4', type: 'followup',  label: 'Follow-up sent',          date: '3 weeks ago' },
  { id: '5', type: 'message',   label: 'Re-engaged conversation', date: '2 days ago' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function DailyBriefing({ name, items, loading, onDismiss }: { name: string; items: string[]; loading: boolean; onDismiss: () => void }) {
  return (
    <div className="mx-3 mt-3 mb-1 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 relative shadow-md">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-indigo-300 hover:text-white transition-colors">
        <X size={14} />
      </button>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={12} className="text-indigo-300" />
        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">AI Daily Briefing</p>
      </div>
      <p className="text-sm font-semibold text-white mb-2">{getGreeting()}, {name}.</p>
      {loading ? (
        <div className="space-y-1.5">
          {[1,2,3].map(i => <div key={i} className="h-3 bg-white/20 rounded animate-pulse" />)}
        </div>
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

function ConvRow({
  conv, active, onClick, mode,
}: {
  conv: Conversation; active: boolean; onClick: () => void; mode: string
}) {
  const priority = conv.aiPriority ? AI_PRIORITY[conv.aiPriority] : null
  const PIcon = priority?.icon

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-all border-l-2 ${
        active ? 'bg-indigo-50 border-indigo-500' : 'hover:bg-gray-50/80 border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar name={conv.contact.name} src={conv.contact.avatarUrl ?? undefined} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-indigo-600 border-2 border-white rounded-full flex items-center justify-center">
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
        <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
          {conv.lastMessagePreview || 'No messages yet'}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-500">
              <TrendingUp size={9} />
              {conv.leadScore}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Context Panel ────────────────────────────────────────────────────────────

function ContextPanel({
  data, loading, contactName, onClose,
}: {
  data: ConvContext | null; loading: boolean; contactName: string; onClose: () => void
}) {
  const sentimentStyle = data ? (SENTIMENT_STYLE[data.dominantSentiment] ?? SENTIMENT_STYLE.neutral) : SENTIMENT_STYLE.neutral

  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-50 rounded-md flex items-center justify-center">
            <Brain size={13} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">AI Context</p>
            <p className="text-[10px] text-gray-400">{contactName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-14 bg-gray-50 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : data ? (
          <div className="divide-y divide-gray-50">

            {/* Next Action — hero recommendation */}
            <div className="p-4">
              <div className={`rounded-xl p-3.5 flex items-start gap-3 ${data.urgency === 'high' ? 'bg-amber-50 border border-amber-100' : 'bg-indigo-50 border border-indigo-100'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${data.urgency === 'high' ? 'bg-amber-100' : 'bg-indigo-100'}`}>
                  <Lightbulb size={14} className={data.urgency === 'high' ? 'text-amber-600' : 'text-indigo-600'} />
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${data.urgency === 'high' ? 'text-amber-500' : 'text-indigo-400'}`}>
                    Recommended Action
                  </p>
                  <p className={`text-sm font-semibold ${data.urgency === 'high' ? 'text-amber-900' : 'text-indigo-900'}`}>
                    {data.nextAction}
                  </p>
                </div>
              </div>
            </div>

            {/* Sentiment */}
            <div className="p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Conversation Mood</p>
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sentimentStyle.badge}`}>
                  <Activity size={11} />
                  {sentimentStyle.label}
                </span>
                {data.requiresResponse && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100">
                    <AlertCircle size={10} />
                    Needs reply
                  </span>
                )}
              </div>
            </div>

            {/* Summary */}
            {data.summary && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Relationship Summary</p>
                <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>
              </div>
            )}

            {/* Buying Signals */}
            {data.buyingSignals.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Buying Signals</p>
                <div className="space-y-1.5">
                  {data.buyingSignals.map((signal, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ShoppingCart size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-700 leading-relaxed">{signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Intents & Topics */}
            {(data.intents.length > 0 || data.topTopics.length > 0) && (
              <div className="p-4">
                {data.intents.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Intent Signals</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {data.intents.map(intent => (
                        <span key={intent} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full border border-blue-100 capitalize">
                          {intent.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {data.topTopics.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topTopics.map(topic => (
                        <span key={topic} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded-full capitalize">
                          {topic.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Contact Profile */}
            {(data.personalitySummary || data.communicationStyle || data.moodBaseline) && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Contact Profile</p>
                <div className="space-y-2.5">
                  {data.personalitySummary && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Personality</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{data.personalitySummary}</p>
                    </div>
                  )}
                  {data.communicationStyle && (
                    <div className="flex items-center gap-2">
                      <MessageCircle size={11} className="text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-600">{data.communicationStyle}</p>
                    </div>
                  )}
                  {data.moodBaseline && (
                    <div className="flex items-center gap-2">
                      <Activity size={11} className="text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-600">Baseline mood: {data.moodBaseline}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Insights */}
            {data.insights.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">AI Memory</p>
                <div className="space-y-2">
                  {data.insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-700 leading-relaxed">{insight.value}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{insight.key?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Analysed timestamp */}
            {data.analysedAt && (
              <div className="px-4 py-3">
                <p className="text-[10px] text-gray-300 text-center">
                  Context analysed {formatTime(data.analysedAt)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
            <Brain size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-600 mb-1">No context yet</p>
            <p className="text-xs text-gray-400">AI context builds as the conversation progresses.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type MobilePane = 'list' | 'thread'
type AITab = 'overview' | 'notes' | 'timeline'
type FilterId = typeof FILTERS[number]['id']

export default function InboxPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const userName = (session.data?.user?.email ?? '').split('@')[0] || 'there'

  // Data
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

  // Context panel
  const [showContextPanel, setShowContextPanel] = useState(false)
  const [contextData, setContextData] = useState<ConvContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)

  // UI
  const [mobilePane, setMobilePane] = useState<MobilePane>('list')
  const [showAIPanel, setShowAIPanel] = useState(true)
  const [showMobileAI, setShowMobileAI] = useState(false)
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

  const selectedIdRef = useRef<string | null>(null)
  const selectedMsgIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  // ── Data loading ──────────────────────────────────────────────────────────

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(v => !v) }
      if (e.key === 'Escape') { setShowSearch(false); setShowMobileAI(false); setShowContextPanel(false) }
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

  // ── Actions ───────────────────────────────────────────────────────────────

  const selectConversation = async (convId: string) => {
    setSelectedId(convId); setSelectedMsgId(null); setSuggestions([])
    setContactDetail(null); setLoadingMsgs(true); setMobilePane('thread')
    setShowMobileAI(false); setDraft(''); setAiTab('overview')
    setShowContextPanel(false); setContextData(null)
    if (!token) return
    const data = await apiClient<{ messages: Message[]; contact: Contact }>(
      `/api/conversations/${convId}/messages`, { token }
    )
    setMessages(data.messages); setContact(data.contact); setLoadingMsgs(false)
    if (data.contact?.id) {
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${data.contact.id}`, { token })
        .then(d => setContactDetail(d.contact)).catch(() => {})
    }
    const last = [...data.messages].reverse().find(m => m.pendingSuggestions > 0)
    if (last) {
      setSelectedMsgId(last.id)
      apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${last.id}/suggestions`, { token })
        .then(d => setSuggestions(d.suggestions)).catch(() => {})
    }
  }

  const openContext = async (convId: string) => {
    if (!token) return
    setShowContextPanel(true)
    setLoadingContext(true)
    setContextData(null)
    try {
      const data = await apiClient<{ context: ConvContext }>(`/api/conversations/${convId}/context`, { token })
      setContextData(data.context)
    } catch {} finally {
      setLoadingContext(false)
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
    setActionLoading(null); setEditingSuggId(null); setShowMobileAI(false)
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

  // ── Filtering ─────────────────────────────────────────────────────────────

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
  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const currentPriority = selectedConv?.aiPriority ? AI_PRIORITY[selectedConv.aiPriority] : null
  const CurrentPriorityIcon = currentPriority?.icon ?? null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-white">

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs font-medium text-center py-2 flex items-center justify-center gap-2">
          <WifiOff size={13} />
          You are offline — messages will be queued and sent when you reconnect.
        </div>
      )}

      {/* ── Conversation list ─────────────────────────────────────────────── */}
      <div className={`${mobilePane === 'thread' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[280px] border-r border-gray-100 flex-shrink-0`}>

        {/* List header */}
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
                placeholder="Search name, message, tag…"
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

        {/* Smart filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-50 overflow-x-auto flex-shrink-0">
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

        {/* Daily briefing */}
        {!briefingDismissed && mode !== 'personal' && (
          <DailyBriefing
            name={userName}
            items={briefingItems}
            loading={briefingLoading}
            onDismiss={() => setBriefingDismissed(true)}
          />
        )}

        {/* Conversation rows */}
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

      {/* ── Chat + AI panel ───────────────────────────────────────────────── */}
      <div className={`${mobilePane === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {selectedId && contact ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-white flex-shrink-0 shadow-sm">
              <button
                onClick={() => { setMobilePane('list'); setSelectedId(null) }}
                className="md:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
                  {currentPriority && CurrentPriorityIcon && (
                    <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${currentPriority.color}`}>
                      <CurrentPriorityIcon size={9} />
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
                  onClick={() => selectedId && openContext(selectedId)}
                  className={`p-2 rounded-lg transition-colors ${showContextPanel ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  title="AI Context"
                >
                  <Info size={16} />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Add note" onClick={() => { setShowAIPanel(true); setAiTab('notes') }}>
                  <StickyNote size={16} />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Open CRM">
                  <ExternalLink size={16} />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Archive">
                  <Archive size={16} />
                </button>
                {suggestions.length > 0 && (
                  <button
                    onClick={() => setShowMobileAI(true)}
                    className="md:hidden flex items-center gap-1.5 ml-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                  >
                    <Zap size={12} /> {suggestions.length}
                  </button>
                )}
                <button
                  onClick={() => setShowAIPanel(v => !v)}
                  className={`hidden md:flex p-2 rounded-lg transition-colors ${showAIPanel ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  title="AI Intelligence Panel"
                >
                  <Brain size={16} />
                </button>
              </div>
            </div>

            {/* Messages + AI panel row */}
            <div className="flex flex-1 min-h-0">

              {/* Messages */}
              <div className="flex flex-col flex-1 min-w-0 bg-gray-50 relative">

                {/* AI Context Panel overlay */}
                {showContextPanel && (
                  <ContextPanel
                    data={contextData}
                    loading={loadingContext}
                    contactName={contact.name}
                    onClose={() => setShowContextPanel(false)}
                  />
                )}

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
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
                      {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.senderType === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            onClick={() => msg.pendingSuggestions > 0 && selectMessage(msg.id)}
                            className={`max-w-[75%] md:max-w-sm ${msg.pendingSuggestions > 0 ? 'cursor-pointer' : ''}`}
                          >
                            <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                              msg.senderType === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                            } ${msg.pendingSuggestions > 0 && selectedMsgId !== msg.id ? 'ring-2 ring-amber-300' : ''}
                              ${selectedMsgId === msg.id ? 'ring-2 ring-indigo-400' : ''}`}
                            >
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.body || '(media)'}</p>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <span className={`text-[10px] ${msg.senderType === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                                  {formatTime(msg.timestamp)}
                                </span>
                                {msg.senderType === 'user' && msg.deliveryStatus === 'read' && (
                                  <span className="text-[10px] text-indigo-300 font-medium">✓✓</span>
                                )}
                              </div>
                            </div>
                            {msg.pendingSuggestions > 0 && (
                              <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
                                msg.senderType === 'contact' ? 'text-amber-600 justify-start' : 'text-indigo-400 justify-end'
                              }`}>
                                <Zap size={10} />
                                {selectedMsgId === msg.id ? 'Suggestions ready — see panel' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* AI suggestion chips above composer (when AI panel is closed) */}
                {!showAIPanel && suggestions.length > 0 && (
                  <div className="px-3 pt-2 flex gap-2 overflow-x-auto">
                    {suggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setDraft(s.text); draftRef.current?.focus() }}
                        className={`flex-shrink-0 max-w-[200px] text-xs px-3 py-2 rounded-xl border text-left transition-colors hover:shadow-sm ${TONE_STYLE[s.tone] ?? 'bg-gray-50 text-gray-700 border-gray-100'}`}
                      >
                        <span className="font-bold capitalize block mb-0.5 text-[10px]">{s.tone}</span>
                        <span className="line-clamp-2 leading-relaxed">{s.text}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Composer */}
                <div className="border-t border-gray-200 bg-white px-3 py-3 flex-shrink-0">
                  <div className="flex items-end gap-2">
                    <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors flex-shrink-0">
                      <Paperclip size={18} />
                    </button>
                    <div className="flex-1 relative">
                      <textarea
                        ref={draftRef}
                        rows={1}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendDraft() }
                        }}
                        placeholder="Type a message… (⌘↵ to send)"
                        className="w-full resize-none px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all leading-relaxed"
                        style={{ minHeight: '42px', maxHeight: '128px' }}
                      />
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors flex-shrink-0">
                      <Smile size={18} />
                    </button>
                    <button
                      onClick={sendDraft}
                      disabled={!draft.trim()}
                      className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  {selectedMsgId && (
                    <div className="flex items-center justify-between mt-1.5">
                      <button
                        onClick={regenerate}
                        disabled={regenerating}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                      >
                        <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} />
                        {regenerating ? 'Generating…' : 'Regenerate AI reply'}
                      </button>
                      <span className="text-[10px] text-gray-400">R · ⌘↵</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── AI Intelligence Panel (desktop) ──────────────────────── */}
              {showAIPanel && (
                <div className="hidden md:flex w-[320px] xl:w-[340px] border-l border-gray-200 bg-white flex-col flex-shrink-0 overflow-hidden">
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-indigo-50 rounded-md flex items-center justify-center">
                        <Brain size={13} className="text-indigo-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900">AI Intelligence</p>
                    </div>
                    <button onClick={() => setShowAIPanel(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-gray-100 flex-shrink-0">
                    {(['overview', 'notes', 'timeline'] as AITab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setAiTab(tab)}
                        className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                          aiTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-gray-50">

                    {/* ── Overview ──────────────────────────────────────────── */}
                    {aiTab === 'overview' && (
                      <>
                        {/* AI Suggestions */}
                        {(suggestions.length > 0 || regenerating) && (
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AI Suggestions</p>
                              <button onClick={regenerate} disabled={regenerating} className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold disabled:opacity-50">
                                <RefreshCw size={10} className={regenerating ? 'animate-spin' : ''} /> Regenerate
                              </button>
                            </div>
                            {regenerating ? (
                              <div className="flex flex-col items-center py-6 gap-2">
                                <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                <p className="text-xs text-gray-400">Generating suggestions…</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {suggestions.map(s => (
                                  <div key={s.id} className={`rounded-xl p-3 border ${TONE_STYLE[s.tone] ?? 'bg-gray-50 border-gray-100'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[10px] font-bold uppercase tracking-wide">{s.tone}</span>
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => { setEditingSuggId(s.id); setEditedText(s.text) }} className="p-1 opacity-50 hover:opacity-100 transition-opacity" title="Edit">
                                          <Edit3 size={10} />
                                        </button>
                                        <button onClick={() => navigator.clipboard.writeText(s.text)} className="p-1 opacity-50 hover:opacity-100 transition-opacity" title="Copy">
                                          <Copy size={10} />
                                        </button>
                                      </div>
                                    </div>
                                    {editingSuggId === s.id ? (
                                      <textarea
                                        autoFocus rows={3}
                                        value={editedText}
                                        onChange={e => setEditedText(e.target.value)}
                                        className="w-full text-xs leading-relaxed bg-white/60 border border-current/20 rounded-lg p-2 resize-none focus:outline-none mb-2"
                                      />
                                    ) : (
                                      <p className="text-xs leading-relaxed mb-1">{s.text}</p>
                                    )}
                                    {!editingSuggId && s.reasoning && (
                                      <p className="text-[10px] opacity-50 leading-relaxed mb-2">{s.reasoning}</p>
                                    )}
                                    <div className="flex gap-1.5 mt-2">
                                      <button
                                        onClick={() => approveSuggestion(s.id, editingSuggId === s.id ? editedText : undefined)}
                                        disabled={actionLoading === s.id}
                                        className="flex-1 text-[11px] font-bold py-1.5 bg-current/10 hover:bg-current/20 rounded-lg disabled:opacity-50 transition-colors"
                                      >
                                        {editingSuggId === s.id ? 'Send edited' : 'Send'}
                                      </button>
                                      {editingSuggId !== s.id && (
                                        <button
                                          onClick={() => { setDraft(s.text); draftRef.current?.focus() }}
                                          className="flex-1 text-[11px] font-semibold py-1.5 bg-white/50 hover:bg-white/80 border border-current/10 rounded-lg transition-colors"
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {editingSuggId === s.id && (
                                        <button onClick={() => setEditingSuggId(null)} className="px-3 text-[11px] py-1.5 bg-white/30 border border-current/10 rounded-lg">
                                          Cancel
                                        </button>
                                      )}
                                      <button
                                        onClick={() => dismissSuggestion(s.id)}
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

                        {/* Customer summary */}
                        {contactDetail && (
                          <div className="p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Customer</p>
                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                              {[
                                { label: 'Since', value: contact.customerSince },
                                { label: 'Lifetime', value: contact.lifetimeValue != null ? `K${contact.lifetimeValue.toLocaleString()}` : undefined },
                                { label: 'Avg order', value: contact.avgOrderValue != null ? `K${contact.avgOrderValue.toLocaleString()}` : undefined },
                                { label: 'Stage', value: contact.pipelineStage?.replace(/_/g, ' ') },
                              ].filter(r => r.value).map(r => (
                                <div key={r.label} className="bg-gray-50 rounded-lg p-2">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase">{r.label}</p>
                                  <p className="text-xs font-semibold text-gray-700 capitalize truncate">{r.value}</p>
                                </div>
                              ))}
                            </div>
                            {contactDetail.profile?.personalitySummary && (
                              <p className="text-xs text-gray-600 leading-relaxed">{contactDetail.profile.personalitySummary}</p>
                            )}
                            {contactDetail.relationship && (
                              <div className="mt-2">
                                <HealthBar score={contactDetail.relationship.healthScore} size="sm" className="w-full mt-1" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Lead score */}
                        {mode !== 'personal' && (contact.leadScore ?? selectedConv?.leadScore) != null && (
                          <div className="p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Lead Score</p>
                            <div className="flex items-center gap-3">
                              {(() => {
                                const score = contact.leadScore ?? selectedConv?.leadScore ?? 0
                                const color = score > 70 ? '#4f46e5' : score > 40 ? '#f59e0b' : '#ef4444'
                                const circumference = 2 * Math.PI * 22
                                return (
                                  <div className="relative w-14 h-14 flex-shrink-0">
                                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                                      <circle cx="28" cy="28" r="22" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                                      <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="5"
                                        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">{score}</span>
                                  </div>
                                )
                              })()}
                              <ul className="space-y-0.5">
                                <li className="text-[10px] text-gray-500 flex items-center gap-1"><CheckCircle size={9} className="text-emerald-500 flex-shrink-0" />Recently asked for pricing</li>
                                <li className="text-[10px] text-gray-500 flex items-center gap-1"><CheckCircle size={9} className="text-emerald-500 flex-shrink-0" />Responds quickly</li>
                                <li className="text-[10px] text-gray-500 flex items-center gap-1"><CheckCircle size={9} className="text-emerald-500 flex-shrink-0" />Purchased twice before</li>
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Suggested actions */}
                        {mode !== 'personal' && (
                          <div className="p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Suggested Actions</p>
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

                        {/* CRM quick actions */}
                        {mode !== 'personal' && (
                          <div className="p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">CRM</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { label: 'Convert customer', icon: UserCheck },
                                { label: 'Create invoice',   icon: CreditCard },
                                { label: 'Schedule call',    icon: Calendar },
                                { label: 'Assign to team',   icon: UserPlus },
                              ].map(({ label, icon: Icon }) => (
                                <button key={label} className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left">
                                  <Icon size={11} className="text-gray-400 flex-shrink-0" />
                                  <span className="truncate">{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Context panel shortcut */}
                        <div className="p-4">
                          <button
                            onClick={() => selectedId && openContext(selectedId)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-left group border border-indigo-100"
                          >
                            <Info size={12} className="text-indigo-500 flex-shrink-0" />
                            View full AI context for this conversation
                            <ChevronRight size={11} className="ml-auto text-indigo-300" />
                          </button>
                        </div>
                      </>
                    )}

                    {/* ── Notes ──────────────────────────────────────────────── */}
                    {aiTab === 'notes' && (
                      <div className="p-4 space-y-3">
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <textarea
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                            placeholder="Private note — only your team can see this…"
                            rows={3}
                            className="w-full px-3 py-2.5 text-xs text-gray-700 resize-none focus:outline-none border-b border-gray-100 placeholder-gray-400"
                          />
                          <div className="flex justify-end px-3 py-2 bg-gray-50">
                            <button
                              onClick={addNote} disabled={!newNote.trim()}
                              className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                            >
                              Add Note
                            </button>
                          </div>
                        </div>
                        {notes.length === 0 ? (
                          <div className="text-center py-8">
                            <StickyNote size={26} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-xs text-gray-400">No notes yet</p>
                          </div>
                        ) : notes.map(n => (
                          <div key={n.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                            <p className="text-xs text-gray-800 leading-relaxed">{n.text}</p>
                            <p className="text-[10px] text-amber-600 mt-1.5">{n.author} · {formatTime(n.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Timeline ───────────────────────────────────────────── */}
                    {aiTab === 'timeline' && (
                      <div className="p-4">
                        <div className="relative">
                          <div className="absolute left-[18px] top-3 bottom-3 w-px bg-gray-100" />
                          <div className="space-y-4">
                            {MOCK_TIMELINE.map(ev => {
                              const ICONS: Record<TimelineEvent['type'], React.ElementType> = {
                                message: MessageSquare, purchase: DollarSign, invoice: CreditCard,
                                note: StickyNote, followup: Bell, complaint: AlertTriangle, appointment: Calendar,
                              }
                              const Icon = ICONS[ev.type]
                              return (
                                <div key={ev.id} className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0 z-10">
                                    <Icon size={10} className="text-gray-400" />
                                  </div>
                                  <div className="pt-0.5">
                                    <p className="text-xs font-semibold text-gray-700">{ev.label}</p>
                                    <p className="text-[10px] text-gray-400">{ev.date}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Select a conversation</p>
            <p className="text-xs text-gray-500 mb-6">Choose from the list on the left to open a thread.</p>
            <div className="flex items-center gap-5 text-xs text-gray-400">
              {[['⌘K', 'Search'], ['R', 'Regenerate reply'], ['⌘↵', 'Send message']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono shadow-sm">{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile AI bottom sheet ─────────────────────────────────────────── */}
      {showMobileAI && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileAI(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Brain size={14} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">AI Suggestions</p>
                  <p className="text-xs text-gray-400">{suggestions.length} option{suggestions.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={regenerate} disabled={regenerating} className="flex items-center gap-1 text-xs text-indigo-600 font-semibold disabled:opacity-50">
                  <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} /> Regenerate
                </button>
                <button onClick={() => setShowMobileAI(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {regenerating ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : suggestions.map(s => (
                <div key={s.id} className={`rounded-xl p-4 border ${TONE_STYLE[s.tone] ?? 'bg-gray-50 border-gray-100'}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide capitalize block mb-2">{s.tone}</span>
                  <p className="text-sm leading-relaxed mb-3">{s.text}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveSuggestion(s.id)}
                      disabled={actionLoading === s.id}
                      className="flex-1 text-sm font-bold py-2.5 bg-current/10 hover:bg-current/20 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => { setDraft(s.text); setShowMobileAI(false); draftRef.current?.focus() }}
                      className="flex-1 text-sm font-semibold py-2.5 bg-white/60 border border-current/10 rounded-xl transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => dismissSuggestion(s.id)}
                      disabled={actionLoading === s.id}
                      className="px-4 text-sm py-2.5 bg-white/30 border border-current/10 rounded-xl transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
