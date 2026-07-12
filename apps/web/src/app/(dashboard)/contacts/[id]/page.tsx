'use client'

import { use, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Brain, TrendingUp, TrendingDown, Minus, MessageSquare, Phone, Mail, Globe,
  Building2, Briefcase, Star, Activity, ChevronRight, Zap, Clock, Heart, User,
  Lightbulb, ArrowUpRight, ArrowDownRight, Sparkles, Edit3, Tag, Trash2, X,
  Check, Loader2, Calendar, Gift, Briefcase as BriefcaseIcon, Plane, PartyPopper,
  Bell, CheckSquare, Square, Plus, Pin, Target, RefreshCw, ShoppingCart, MapPin,
  Download, Music, Film, Image, Mic, FileText, Send, Lock, LockOpen, Paperclip,
  CreditCard, Package, Wrench, ChevronLeft, MoreVertical,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, useToast } from '@/components/ui'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactProfile {
  personalitySummary: string | null
  communicationStyle: string | null
  emotionalPatterns: unknown
  knownTriggers: unknown
  currentLifeContext: string | null
  moodBaseline: string | null
  preferences: string | null
  goals: string | null
  painPoints: string | null
  buyingBehaviour: string | null
  relationshipStage: string | null
  lockedFields: string[]
  userEditedFields: string[]
  updatedAt: string | null
}

interface ContactDetail {
  id: string
  whatsappJid: string
  name: string
  displayName: string | null
  customName: string | null
  phoneNumber?: string
  email?: string
  company?: string
  jobTitle?: string
  industry?: string
  website?: string
  notes?: string
  customerStatus: string
  pipelineStage?: string
  leadScore: number
  source: string
  sourceProductId?: string | null
  sourceProductName?: string | null
  sourceSocialPostId?: string | null
  sourceSocialPostCaption?: string | null
  avatarUrl: string | null
  lastMessageAt: string | null
  createdAt: string
  tags: string[]
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
    lastInteractionAt: string | null
    notes: string | null
    networkValue: Record<string, unknown>
  }
  profile: ContactProfile
  insights: Array<{ key: string; value: string; confidence: number; supportingText: string | null; createdAt: string }>
  healthHistory: Array<{ score: number; previousScore: number | null; changeReason: string | null; factors: unknown; recordedAt: string }>
  stats: { totalMessages: number; sent: number; received: number }
  proactiveSuggestions: Array<{ id: string; suggestionType: string; title: string; body: string; draftMessage: string | null; priority: number }>
  upcomingEvents: Array<{ id: string; eventType: string; title: string; eventDate: string | null; isRecurring: boolean; confidence: number }>
  opportunities: Array<{ id: string; opportunityType: string; title: string; description: string | null; estimatedValueCents: number | null; confidence: number; detectedAt: string }>
  connections: Array<{ id: string; connectionType: string; confidence: number; source: string; otherContactId: string; otherContactName: string | null }>
  products: Array<{ id: string; productId: string; productName: string; relationType: string; quantity: number | null; warrantyExpiresAt: string | null; replacementPredictedAt: string | null }>
  lifeEvents: Array<{ id: string; eventType: string; title: string; eventDate: string | null; createdAt: string }>
}

interface Task {
  id: string; title: string; description: string | null; dueDate: string | null
  completedAt: string | null; createdBy: 'user' | 'ai'; createdAt: string
}

interface ContextPin { id: string; content: string; createdAt: string }

interface Message {
  id: string; senderType: 'user' | 'contact'; messageType?: string; body: string | null
  timestamp: string; mediaUrl?: string | null; mediaMimeType?: string | null
  transcription?: string | null; quotedMessageId?: string | null; pendingSuggestions: number
}

interface ContactDoc {
  id: string; fileName: string; fileType: string | null; fileSize: number | null
  storageUrl: string; docCategory: string; notes: string | null; uploadedAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

type TabId = 'profile' | 'ai' | 'activity' | 'calendar' | 'docs' | 'clocks' | 'messages'

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile',   label: 'Profile'   },
  { id: 'ai',        label: 'AI Profile' },
  { id: 'activity',  label: 'Activity'  },
  { id: 'calendar',  label: 'Calendar'  },
  { id: 'docs',      label: 'Docs'      },
  { id: 'clocks',    label: 'Clocks'    },
  { id: 'messages',  label: 'Messages'  },
]

const AI_FIELDS = [
  { key: 'personalitySummary', label: 'Personality Summary',  apiField: 'personality_summary'  },
  { key: 'communicationStyle', label: 'Communication Style',  apiField: 'communication_style'  },
  { key: 'currentLifeContext', label: 'Current Context',      apiField: 'current_life_context' },
  { key: 'preferences',        label: 'Preferences',          apiField: 'preferences'          },
  { key: 'goals',              label: 'Goals',                apiField: 'goals'                },
  { key: 'painPoints',         label: 'Pain Points',          apiField: 'pain_points'          },
  { key: 'buyingBehaviour',    label: 'Buying Behaviour',     apiField: 'buying_behaviour'     },
  { key: 'relationshipStage',  label: 'Relationship Stage',   apiField: 'relationship_stage'   },
] as const

type AIFieldKey = typeof AI_FIELDS[number]['key']

const TREND = {
  improving: { Icon: TrendingUp,   cls: 'text-green-600', bg: 'bg-green-50 border-green-100',   label: 'Improving' },
  stable:    { Icon: Minus,        cls: 'text-gray-500',  bg: 'bg-gray-50 border-gray-100',     label: 'Stable'    },
  declining: { Icon: TrendingDown, cls: 'text-red-500',   bg: 'bg-red-50 border-red-100',       label: 'Declining' },
}

const TIER_LABEL = ['', 'VIP', 'Key contact', 'Regular', 'Low priority', 'Minimal']
const TIER_ICON  = [null, Star, Zap, User, Clock, Minus]

const CUSTOMER_STATUS_OPTIONS = [
  'contact', 'lead', 'prospect', 'customer', 'vip', 'supplier', 'employee', 'partner', 'personal',
]

const PIPELINE_STAGES = ['', 'New Lead', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost']

// Opportunity types come from the opportunities table (docs/RELATIONSHIP_OS_PLAN.md
// §5.8/§6.7) — this superseded the old insight_key substring-matching convention.
const OPPORTUNITY_TYPE_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  buying_signal:    { label: 'Buying signal',   cls: 'bg-amber-50 text-amber-700 border-amber-200',   Icon: Zap          },
  expansion:        { label: 'Expansion',       cls: 'bg-green-50 text-green-700 border-green-200',   Icon: TrendingUp   },
  referral_moment:  { label: 'Referral',        cls: 'bg-blue-50 text-blue-700 border-blue-200',      Icon: ShoppingCart },
  renewal_due:      { label: 'Renewal due',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',Icon: RefreshCw    },
  life_event:       { label: 'Life event',      cls: 'bg-purple-50 text-purple-700 border-purple-200',Icon: Sparkles     },
  reconnect_window: { label: 'Reconnect',       cls: 'bg-teal-50 text-teal-700 border-teal-200',      Icon: Target       },
  churn_risk:       { label: 'Churn risk',      cls: 'bg-red-50 text-red-700 border-red-200',         Icon: Bell         },
  support_needed:   { label: 'Support needed',  cls: 'bg-red-50 text-red-700 border-red-200',         Icon: Bell         },
}

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  works_with: 'works with', introduced_by: 'introduced by', owns: 'owns', refers_to: 'refers to',
  family_of: 'family of', friend_of: 'friend of', married_to: 'married to',
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  birthday:         <Gift size={15} className="text-pink-500" />,
  anniversary:      <Heart size={15} className="text-red-500" />,
  job_change:       <BriefcaseIcon size={15} className="text-blue-500" />,
  travel:           <Plane size={15} className="text-sky-500" />,
  celebration:      <PartyPopper size={15} className="text-amber-500" />,
  appointment:      <Calendar size={15} className="text-indigo-500" />,
  deadline:         <Bell size={15} className="text-orange-500" />,
  meeting:          <Calendar size={15} className="text-indigo-500" />,
  payment:          <CreditCard size={15} className="text-green-500" />,
  delivery:         <Package size={15} className="text-amber-500" />,
  service_reminder: <Wrench size={15} className="text-gray-500" />,
  other:            <Bell size={15} className="text-gray-400" />,
}

// Major life events (docs/RELATIONSHIP_OS_PLAN.md §6.6) — distinct from
// EVENT_ICONS above, which covers routine calendar events.
const LIFE_EVENT_ICONS: Record<string, React.ReactNode> = {
  new_job:         <BriefcaseIcon size={15} className="text-blue-500" />,
  moved:           <MapPin size={15} className="text-sky-500" />,
  had_child:       <PartyPopper size={15} className="text-pink-500" />,
  got_married:     <Heart size={15} className="text-red-500" />,
  health_issue:    <Bell size={15} className="text-orange-500" />,
  loss:            <Bell size={15} className="text-gray-500" />,
  achievement:     <Sparkles size={15} className="text-amber-500" />,
  started_business:<Target size={15} className="text-teal-500" />,
}

const PRODUCT_RELATION_LABELS: Record<string, string> = {
  purchased: 'Purchased', interested: 'Interested', quoted: 'Quoted',
  recommended: 'Recommended', mentioned: 'Mentioned',
}

const CALENDAR_EVENT_TYPES = [
  { value: 'meeting',          label: 'Meeting'          },
  { value: 'payment',          label: 'Payment'          },
  { value: 'birthday',         label: 'Birthday'         },
  { value: 'delivery',         label: 'Delivery'         },
  { value: 'service_reminder', label: 'Service Reminder' },
  { value: 'appointment',      label: 'Appointment'      },
  { value: 'deadline',         label: 'Deadline'         },
  { value: 'other',            label: 'Other'            },
]

const DOC_CATEGORIES = [
  { value: 'invoice',       label: 'Invoice',       icon: '🧾' },
  { value: 'contract',      label: 'Contract',      icon: '📑' },
  { value: 'receipt',       label: 'Receipt',       icon: '🏧' },
  { value: 'image',         label: 'Image',         icon: '🖼️' },
  { value: 'pdf',           label: 'PDF',           icon: '📄' },
  { value: 'vehicle_photo', label: 'Vehicle Photo', icon: '🚗' },
  { value: 'other',         label: 'Other',         icon: '📎' },
]

const DOC_ICON: Record<string, string> = {
  invoice: '🧾', contract: '📑', receipt: '🏧', image: '🖼️',
  pdf: '📄', vehicle_photo: '🚗', other: '📎',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone
  return phone.startsWith('+') ? phone : `+${digits}`
}

function isPhoneRedundant(contact: ContactDetail): boolean {
  if (!contact.phoneNumber) return false
  const phoneDigits = contact.phoneNumber.replace(/\D/g, '')
  const nameDigits  = contact.name.replace(/\D/g, '')
  return /^\d+$/.test(contact.name.trim()) && nameDigits === phoneDigits
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return '—'
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0)  return `${Math.abs(diff)}d overdue`
  if (diff < 7)  return `In ${diff} days`
  if (diff < 30) return `In ${Math.floor(diff/7)}w`
  return formatEventDate(dateStr)
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)     return 'just now'
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000)  return `${Math.floor(diff/3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function statusBadgeVariant(status: string): 'default' | 'success' | 'info' | 'warning' | 'error' | 'purple' {
  switch (status) {
    case 'vip':      return 'purple'
    case 'customer': return 'success'
    case 'lead':
    case 'prospect': return 'warning'
    case 'partner':  return 'info'
    default:         return 'default'
  }
}

function calcCompleteness(contact: ContactDetail): number {
  const fields = [
    !!contact.phoneNumber, !!contact.email, !!contact.company,
    !!contact.jobTitle, !!contact.industry, !!contact.notes,
    contact.tags.length > 0, !!contact.profile?.personalitySummary,
  ]
  return Math.round(fields.filter(Boolean).length / fields.length * 100)
}

function mediaHref(url: string | null | undefined, token: string | undefined): string {
  if (!url) return ''
  const base = url.startsWith('http') ? url : `${API_BASE}${url}`
  return token ? `${base}?token=${token}` : base
}

function getFieldState(key: AIFieldKey, profile: ContactProfile): 'locked' | 'user' | 'ai' {
  if (profile.lockedFields?.includes(key)) return 'locked'
  if (profile.userEditedFields?.includes(key)) return 'user'
  return 'ai'
}

// ─── Small components ─────────────────────────────────────────────────────────

function StateBadge({ state }: { state: 'locked' | 'user' | 'ai' }) {
  if (state === 'locked') return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200">
      <Lock size={9} /> Locked
    </span>
  )
  if (state === 'user') return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">
      <Edit3 size={9} /> Edited
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
      <Brain size={9} /> AI
    </span>
  )
}

function HealthRing({ score }: { score: number }) {
  const r     = 28
  const circ  = 2 * Math.PI * r
  const pct   = Math.max(0, Math.min(100, score))
  const offset= circ - (pct/100) * circ
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <div className="relative w-[68px] h-[68px] flex-shrink-0 flex items-center justify-center">
      <svg width="68" height="68" className="-rotate-90 absolute inset-0">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#f3f4f6" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="relative text-center">
        <p className="text-sm font-bold text-gray-900 leading-none">{score}</p>
        <p className="text-[8px] text-gray-400 leading-none mt-0.5">health</p>
      </div>
    </div>
  )
}

const FACTOR_LABELS: Record<string, string> = {
  recency: 'Recency', frequency: 'Frequency', sentiment: 'Tone',
  responsiveness: 'Responsiveness', pipeline_velocity: 'Deal progress',
}

function FactorBreakdown({ factors }: { factors: unknown }) {
  if (!factors || typeof factors !== 'object') return null
  const weighted = (factors as { weighted?: Record<string, number> }).weighted
  if (!weighted) return null
  const entries = Object.entries(weighted).filter(([, v]) => Math.abs(v) >= 0.5)
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {entries.map(([key, value]) => (
        <span key={key}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            value > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          }`}>
          {FACTOR_LABELS[key] ?? key} {value > 0 ? '+' : ''}{value.toFixed(1)}
        </span>
      ))}
    </div>
  )
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })
}

// Network Value (business) / Connection Value (personal) — see
// docs/RELATIONSHIP_OS_PLAN.md §5.1/§6.4. Shape is decided server-side by
// whichever signals a relationship actually has, so the frontend just
// renders whichever keys are present rather than a mode flag.
function NetworkValueCard({ value }: { value: Record<string, unknown> }) {
  if (!value || Object.keys(value).length === 0) return null
  const isBusiness = 'financialValueCents' in value

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <TrendingUp size={14} className="text-indigo-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {isBusiness ? 'Network Value' : 'Connection Value'}
        </p>
        <span className="ml-auto text-sm font-bold text-gray-900">{String(value.overallScore ?? '—')}</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {isBusiness ? (
          <>
            <Stat label="Financial value" value={formatCents(Number(value.financialValueCents ?? 0))} />
            <Stat label="Referral value" value={formatCents(Number(value.referralValueCents ?? 0))} />
            <Stat label="Influence" value={`${value.influenceScore ?? '—'}/100`} />
            <Stat label="Decision authority" value={String(value.decisionAuthority ?? '—')} capitalize />
            <Stat label="Buy again" value={`${value.likelihoodToBuyAgain ?? '—'}%`} />
            <Stat label="Referral probability" value={`${value.referralProbability ?? '—'}%`} />
            <Stat label="Strategic value" value={String(value.strategicValue ?? '—').replace(/_/g, ' ')} capitalize />
          </>
        ) : (
          <>
            <Stat label="Closeness" value={`${value.closenessScore ?? '—'}/100`} />
            <Stat label="Reciprocity" value={`${value.reciprocityScore ?? '—'}/100`} />
            <Stat label="Support given" value={String(value.supportGivenCount ?? 0)} />
            <Stat label="Support received" value={String(value.supportReceivedCount ?? 0)} />
            <Stat label="Influence in your life" value={String(value.socialInfluenceInYourLife ?? '—')} capitalize />
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-gray-800 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  )
}

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 font-medium flex-shrink-0 tabular-nums">{pct}%</span>
    </div>
  )
}

// ─── MessageContent ───────────────────────────────────────────────────────────

function MessageContent({ msg, token }: { msg: Message; token?: string }) {
  const href = mediaHref(msg.mediaUrl, token)
  const mt = msg.messageType ?? 'text'
  if (mt === 'deleted') return <p className="text-xs italic text-gray-400">This message was deleted</p>
  if (mt === 'location') {
    try {
      const loc = JSON.parse(msg.body ?? '{}')
      return (
        <a href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
          <MapPin size={13} /> {loc.name ?? `${loc.lat}, ${loc.lng}`}
        </a>
      )
    } catch { return <p className="text-sm">📍 Location</p> }
  }
  if (mt === 'contact_card') return (
    <p className="flex items-center gap-1.5 text-sm"><Phone size={12} className="text-gray-400" /> {msg.body ?? 'Contact'}</p>
  )
  if (mt === 'image' || mt === 'sticker') return (
    <div className="space-y-1">
      {href ? <img src={href} alt="" className="rounded-lg max-w-[200px] max-h-[200px] object-cover" />
             : <div className="flex items-center gap-1.5 text-sm text-gray-400"><Image size={13} /> Photo</div>}
      {msg.body && <p className="text-xs text-gray-600">{msg.body}</p>}
    </div>
  )
  if (mt === 'video') return (
    <div className="space-y-1">
      {href ? <video src={href} controls className="rounded-lg max-w-[200px]" style={{ maxHeight: 160 }} />
             : <div className="flex items-center gap-1.5 text-sm text-gray-400"><Film size={13} /> Video</div>}
      {msg.body && <p className="text-xs text-gray-600">{msg.body}</p>}
    </div>
  )
  if (mt === 'audio') return (
    <div className="space-y-1">
      {href ? <audio src={href} controls className="max-w-[220px]" />
             : <div className="flex items-center gap-1.5 text-sm text-gray-400"><Mic size={13} /> Voice message</div>}
      {msg.transcription && <p className="text-xs text-gray-500 italic">"{msg.transcription}"</p>}
    </div>
  )
  if (mt === 'document') return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
      <FileText size={14} className="text-gray-400" />
      <span className="truncate max-w-[160px]">{msg.body ?? 'Document'}</span>
      <Download size={12} className="text-gray-400 flex-shrink-0" />
    </a>
  )
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body ?? ''}</p>
}

// ─── TasksPanel ───────────────────────────────────────────────────────────────

function TasksPanel({ contactId, token }: { contactId: string; token: string }) {
  const { addToast } = useToast()
  const { data, refetch } = useApi<{ tasks: Task[] }>(`/api/contacts/${contactId}/tasks`, token)
  const tasks = data?.tasks ?? []
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const addTask = async () => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      await apiClient(`/api/contacts/${contactId}/tasks`, {
        method: 'POST', token, body: JSON.stringify({ title: newTitle.trim(), dueDate: newDue || undefined }),
      })
      setNewTitle(''); setNewDue(''); setAdding(false); refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to add task' }) }
    finally { setSaving(false) }
  }

  const toggleTask = async (task: Task) => {
    try {
      await apiClient(`/api/contacts/${contactId}/tasks/${task.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ completed: !task.completedAt }),
      })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to update task' }) }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await apiClient(`/api/contacts/${contactId}/tasks/${taskId}`, { method: 'DELETE', token })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to delete task' }) }
  }

  const open = tasks.filter(t => !t.completedAt)
  const done = tasks.filter(t => t.completedAt)

  return (
    <div className="space-y-2">
      {tasks.length === 0 && !adding && (
        <p className="text-sm text-gray-400 py-1">No tasks yet.</p>
      )}
      {open.map(task => (
        <div key={task.id} className="flex items-start gap-3 group py-1.5">
          <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-indigo-500 transition-colors">
            <Square size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">{task.title}</p>
            {task.dueDate && (
              <p className={`text-[11px] mt-0.5 font-medium ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                Due {formatDate(task.dueDate)}
              </p>
            )}
          </div>
          {task.createdBy === 'ai' && <Brain size={11} className="text-indigo-300 flex-shrink-0 mt-1" />}
          <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      ))}
      {adding && (
        <div className="space-y-2 pt-1">
          <input ref={inputRef} value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Task title…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600" />
          <div className="flex items-center gap-2">
            <button onClick={addTask} disabled={!newTitle.trim() || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Add
            </button>
            <button onClick={() => { setAdding(false); setNewTitle(''); setNewDue('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {!adding && (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1">
          <Plus size={12} /> Add task
        </button>
      )}
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            {done.length} completed task{done.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-1.5">
            {done.map(task => (
              <div key={task.id} className="flex items-start gap-3 group py-1 opacity-60">
                <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0 text-indigo-400 hover:text-gray-300">
                  <CheckSquare size={16} />
                </button>
                <p className="text-sm text-gray-500 line-through flex-1">{task.title}</p>
                <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ─── ContextPinsPanel ─────────────────────────────────────────────────────────

function ContextPinsPanel({ contactId, token }: { contactId: string; token: string }) {
  const { addToast } = useToast()
  const { data, refetch } = useApi<{ pins: ContextPin[] }>(`/api/contacts/${contactId}/context`, token)
  const pins = data?.pins ?? []
  const [adding, setAdding] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (adding) textRef.current?.focus() }, [adding])

  const addPin = async () => {
    if (!newContent.trim()) return
    setSaving(true)
    try {
      await apiClient(`/api/contacts/${contactId}/context`, {
        method: 'POST', token, body: JSON.stringify({ content: newContent.trim() }),
      })
      setNewContent(''); setAdding(false); refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to save' }) }
    finally { setSaving(false) }
  }

  const deletePin = async (pinId: string) => {
    try {
      await apiClient(`/api/contacts/${contactId}/context/${pinId}`, { method: 'DELETE', token })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to delete' }) }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 leading-relaxed">
        Pinned facts injected into every AI response for this contact.
      </p>
      {pins.length === 0 && !adding && <p className="text-sm text-gray-400 py-1">No context pins yet.</p>}
      {pins.map(pin => (
        <div key={pin.id} className="flex items-start gap-2.5 group py-1.5 px-3 bg-amber-50 border border-amber-100 rounded-lg">
          <Pin size={11} className="text-amber-400 flex-shrink-0 mt-1" />
          <p className="flex-1 text-sm text-amber-900 leading-snug">{pin.content}</p>
          <button onClick={() => deletePin(pin.id)} className="opacity-0 group-hover:opacity-100 text-amber-300 hover:text-red-400">
            <X size={12} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="space-y-2 pt-1">
          <textarea ref={textRef} value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addPin() }}
            placeholder="e.g. Allergic to peanuts · Prefers morning calls"
            rows={2}
            className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-amber-50/50" />
          <div className="flex items-center gap-2">
            <button onClick={addPin} disabled={!newContent.trim() || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Pin size={11} />} Pin it
            </button>
            <button onClick={() => { setAdding(false); setNewContent('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-medium mt-1">
          <Pin size={12} /> Add context
        </button>
      )}
    </div>
  )
}

// ─── AIProfileField ───────────────────────────────────────────────────────────

function AIProfileField({
  contactId, token, fieldKey, label, value, state, onSaved,
}: {
  contactId: string; token: string; fieldKey: AIFieldKey; label: string
  value: string | null; state: 'locked' | 'user' | 'ai'
  onSaved: (key: AIFieldKey, value: string | null, lockAction: 'lock' | 'unlock' | 'none') => void
}) {
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [willLock, setWillLock] = useState(false)
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const startEdit = (unlock = false) => {
    setEditValue(value ?? '')
    setWillLock(unlock ? false : state === 'locked')
    setEditing(true)
  }

  useEffect(() => { if (editing) textRef.current?.focus() }, [editing])

  const save = async () => {
    setSaving(true)
    let lockAction: 'lock' | 'unlock' | 'none' = 'none'
    if (state === 'locked' && !willLock) lockAction = 'unlock'
    else if (willLock) lockAction = 'lock'

    try {
      await apiClient(`/api/contacts/${contactId}/profile`, {
        method: 'PATCH', token,
        body: JSON.stringify({ field: fieldKey, value: editValue || null, lockAction }),
      })
      onSaved(fieldKey, editValue || null, lockAction)
      setEditing(false)
    } catch { addToast({ variant: 'error', title: 'Failed to save' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600">{label}</span>
          <StateBadge state={state} />
        </div>
        {!editing && (
          state === 'locked' ? (
            <button onClick={() => startEdit(true)} title="Unlock to edit"
              className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-400 hover:text-orange-600">
              <LockOpen size={13} />
            </button>
          ) : (
            <button onClick={() => startEdit()} title="Edit field"
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600">
              <Edit3 size={13} />
            </button>
          )
        )}
      </div>
      <div className="px-4 py-3">
        {editing ? (
          <div className="space-y-3">
            <textarea ref={textRef} value={editValue} onChange={e => setEditValue(e.target.value)}
              rows={3}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button onClick={() => setWillLock(l => !l)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  willLock ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {willLock ? <Lock size={11} /> : <LockOpen size={11} />}
                {willLock ? 'Will be locked' : 'Lock after saving'}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                  {saving && <Loader2 size={10} className="animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : value ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            {state === 'ai' ? 'AI will fill this in as it learns more.' : 'Not set — click edit to add.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────

function CalendarPanel({
  contactId, token, events: initialEvents, onRefresh,
}: {
  contactId: string; token: string
  events: ContactDetail['upcomingEvents']; onRefresh: () => void
}) {
  const { addToast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ eventType: 'meeting', title: '', eventDate: '', isRecurring: false })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const addEvent = async () => {
    if (!form.title.trim() || !form.eventDate) return
    setAdding(true)
    try {
      await apiClient(`/api/contacts/${contactId}/events`, {
        method: 'POST', token,
        body: JSON.stringify({ eventType: form.eventType, title: form.title.trim(), eventDate: form.eventDate, isRecurring: form.isRecurring }),
      })
      setShowAdd(false)
      setForm({ eventType: 'meeting', title: '', eventDate: '', isRecurring: false })
      onRefresh()
    } catch { addToast({ variant: 'error', title: 'Failed to add event' }) }
    finally { setAdding(false) }
  }

  const deleteEvent = async (eventId: string) => {
    try {
      await apiClient(`/api/contacts/${contactId}/events/${eventId}`, { method: 'DELETE', token })
      onRefresh()
    } catch { addToast({ variant: 'error', title: 'Failed to delete event' }) }
  }

  return (
    <div className="space-y-3">
      {initialEvents.length === 0 && !showAdd && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <Calendar size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">No upcoming events</p>
          <p className="text-xs text-gray-400 mt-0.5">AI extracts events from messages, or add one manually.</p>
        </div>
      )}

      {initialEvents.map(event => (
        <div key={event.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
            {EVENT_ICONS[event.eventType] ?? EVENT_ICONS.other}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{event.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-medium ${
                event.eventDate && new Date(event.eventDate) <= new Date() ? 'text-red-500' : 'text-indigo-600'
              }`}>{daysUntil(event.eventDate)}</span>
              {event.eventDate && <span className="text-xs text-gray-400">{formatEventDate(event.eventDate)}</span>}
              {event.isRecurring && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Recurring</span>}
              {event.confidence < 0.9 && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  {Math.round(event.confidence * 100)}% conf.
                </span>
              )}
            </div>
          </div>
          <button onClick={() => deleteEvent(event.id)} className="p-1.5 text-gray-300 hover:text-red-400 flex-shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Add Event</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.eventType} onChange={set('eventType')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {CALENDAR_EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="date" value={form.eventDate} onChange={set('eventDate')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <input value={form.title} onChange={set('title')} placeholder="Event title"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={form.isRecurring}
                onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                className="rounded border-gray-300" />
              Recurring annually
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={addEvent} disabled={adding || !form.title.trim() || !form.eventDate}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {adding && <Loader2 size={10} className="animate-spin" />} Add
              </button>
            </div>
          </div>
        </div>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
          <Plus size={14} /> Add event
        </button>
      )}
    </div>
  )
}

// ─── DocumentsPanel ───────────────────────────────────────────────────────────

function DocumentsPanel({ contactId, token }: { contactId: string; token: string }) {
  const { addToast } = useToast()
  const { data, refetch } = useApi<{ documents: ContactDoc[] }>(`/api/contacts/${contactId}/documents`, token)
  const docs = data?.documents ?? []
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ fileName: '', storageUrl: '', docCategory: 'other', notes: '' })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const addDoc = async () => {
    if (!form.fileName.trim() || !form.storageUrl.trim()) return
    setAdding(true)
    try {
      await apiClient(`/api/contacts/${contactId}/documents`, {
        method: 'POST', token,
        body: JSON.stringify({ fileName: form.fileName.trim(), storageUrl: form.storageUrl.trim(), docCategory: form.docCategory, notes: form.notes || null }),
      })
      setShowAdd(false)
      setForm({ fileName: '', storageUrl: '', docCategory: 'other', notes: '' })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to attach document' }) }
    finally { setAdding(false) }
  }

  const deleteDoc = async (docId: string) => {
    try {
      await apiClient(`/api/contacts/${contactId}/documents/${docId}`, { method: 'DELETE', token })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to remove document' }) }
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 && !showAdd && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <Paperclip size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">No documents yet</p>
          <p className="text-xs text-gray-400 mt-0.5">Attach invoices, contracts, receipts, and more.</p>
        </div>
      )}

      {docs.map(doc => (
        <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
            {DOC_ICON[doc.docCategory] ?? '📎'}
          </div>
          <div className="flex-1 min-w-0">
            <a href={doc.storageUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-indigo-600 hover:underline truncate block">
              {doc.fileName}
            </a>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {DOC_CATEGORIES.find(c => c.value === doc.docCategory)?.label ?? 'Other'} · {formatDate(doc.uploadedAt)}
            </p>
            {doc.notes && <p className="text-xs text-gray-500 mt-1 leading-snug">{doc.notes}</p>}
          </div>
          <button onClick={() => deleteDoc(doc.id)} className="p-1.5 text-gray-300 hover:text-red-400 flex-shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Attach Document</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.fileName} onChange={set('fileName')} placeholder="File name"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <select value={form.docCategory} onChange={set('docCategory')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <input value={form.storageUrl} onChange={set('storageUrl')} placeholder="Link (Google Drive, Dropbox, etc.)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <textarea value={form.notes} onChange={set('notes')} placeholder="Notes (optional)" rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button onClick={addDoc} disabled={adding || !form.fileName.trim() || !form.storageUrl.trim()}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              {adding && <Loader2 size={10} className="animate-spin" />} Attach
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
          <Paperclip size={14} /> Attach document
        </button>
      )}
    </div>
  )
}

// ─── MessagesTab ──────────────────────────────────────────────────────────────

// Ported from the orphaned /relationships/[id] page (see docs/RELATIONSHIP_OS_PLAN.md
// §3/§7) — this was the only place a user could see or pause their own
// relationship clocks, but nothing linked to that route. Same data, same
// toggle action, now living as a tab here instead of a second contact-detail page.
// Relationship Goals (docs/RELATIONSHIP_OS_PLAN.md §5.12/§6.11) — one table,
// vocabulary swaps by mode. aiNextStep is regenerated by the intelligence
// service on create (best-effort — a goal is still useful without one).
interface Goal {
  id: string
  goalType: string
  customLabel: string | null
  status: 'active' | 'achieved' | 'abandoned'
  targetDate: string | null
  aiNextStep: string | null
}

const BUSINESS_GOAL_TYPES = [
  'become_preferred_supplier', 'upsell', 'cross_sell', 'renew_contract',
  'request_referral', 'recover_relationship', 'increase_spend', 'schedule_meeting',
]
const PERSONAL_GOAL_TYPES = [
  'reconnect', 'deepen_friendship', 'repair_rift', 'be_present',
  'support_through_event', 'maintain_long_distance',
]

function goalLabel(g: Goal) {
  return g.customLabel || g.goalType.replace(/_/g, ' ')
}

function GoalsPanel({ contactId, token, mode }: { contactId: string; token: string; mode: string }) {
  const { data, refetch } = useApi<{ goals: Goal[] }>(`/api/goals?contactId=${contactId}`, token)
  const goals = data?.goals ?? []
  const [showForm, setShowForm] = useState(false)
  const [goalType, setGoalType] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const goalTypes = mode === 'personal' ? PERSONAL_GOAL_TYPES
    : mode === 'business' ? BUSINESS_GOAL_TYPES
    : [...BUSINESS_GOAL_TYPES, ...PERSONAL_GOAL_TYPES]

  const addGoal = async () => {
    if (!goalType) return
    setSaving(true)
    try {
      await apiClient('/api/goals', {
        method: 'POST', token,
        body: JSON.stringify({ contactId, goalType, targetDate: targetDate || undefined }),
      })
      setShowForm(false)
      setGoalType('')
      setTargetDate('')
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (id: string, status: 'achieved' | 'abandoned') => {
    await apiClient(`/api/goals/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
    refetch()
  }

  const activeGoals = goals.filter(g => g.status === 'active')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <Target size={14} className="text-indigo-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Goals</p>
        <button onClick={() => setShowForm(s => !s)} className="ml-auto text-xs text-indigo-600 hover:underline">
          {showForm ? 'Cancel' : '+ Add goal'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-gray-100 space-y-2">
          <select
            value={goalType}
            onChange={e => setGoalType(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 capitalize"
          >
            <option value="">Select a goal…</option>
            {goalTypes.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
          />
          <button
            onClick={addGoal}
            disabled={!goalType || saving}
            className="w-full text-sm bg-indigo-600 text-white rounded-lg py-1.5 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add goal'}
          </button>
        </div>
      )}

      {activeGoals.length === 0 ? (
        !showForm && <p className="px-4 py-3 text-xs text-gray-400">No active goals for this relationship.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {activeGoals.map(g => (
            <div key={g.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 capitalize">{goalLabel(g)}</p>
                {g.targetDate && <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(g.targetDate)}</span>}
              </div>
              {g.aiNextStep && <p className="text-xs text-gray-500 mt-1 leading-snug">{g.aiNextStep}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => updateStatus(g.id, 'achieved')} className="text-[11px] text-green-600 hover:underline">Mark achieved</button>
                <button onClick={() => updateStatus(g.id, 'abandoned')} className="text-[11px] text-gray-400 hover:underline">Abandon</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface RelationshipClock {
  id: string
  clockType: string
  avgDaysBetweenMessages: number | null
  stdDevDays: number | null
  isActive: boolean
  isManuallyConfigured: boolean
  checkIntervalDays: number
  lastNudgeAt: string | null
  nudgeCount: number
}

const CLOCK_LABELS: Record<string, string> = {
  dormancy_watch: 'Dormancy Watch',
  weekly_touchpoint: 'Weekly Touchpoint',
  daily_checkin: 'Daily Check-in',
  post_event_followup: 'Post-event Follow-up',
}

function ClocksPanel({ contactId, token }: { contactId: string; token: string }) {
  const { data, refetch } = useApi<{ clocks: RelationshipClock[] }>(`/api/contacts/${contactId}/clock`, token)
  const clocks = data?.clocks ?? []
  const [toggling, setToggling] = useState<string | null>(null)

  const toggleClock = async (clockType: string, currentActive: boolean) => {
    setToggling(clockType)
    try {
      await apiClient(`/api/contacts/${contactId}/clock/${clockType}`, {
        method: 'PUT', token,
        body: JSON.stringify({ isActive: !currentActive }),
      })
      refetch()
    } finally {
      setToggling(null)
    }
  }

  if (clocks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <Clock size={28} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 font-medium">No relationship clocks yet</p>
        <p className="text-xs text-gray-400 mt-0.5">Set up automatically as the temporal intelligence engine learns your cadence.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Relationship Clocks</p>
        <p className="text-xs text-gray-400 mt-0.5">AI-learned timing for proactive suggestions.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {clocks.map((clock) => (
          <div key={clock.id} className="flex items-start gap-4 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium text-gray-800">{CLOCK_LABELS[clock.clockType] || clock.clockType}</p>
                {clock.isManuallyConfigured && <Badge variant="info">manual</Badge>}
              </div>
              {clock.avgDaysBetweenMessages != null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Typical cadence: every {Math.round(clock.avgDaysBetweenMessages)} days
                  {clock.stdDevDays != null && ` ±${Math.round(clock.stdDevDays)}d`}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Checks every {clock.checkIntervalDays} days
                {clock.nudgeCount > 0 && ` · ${clock.nudgeCount} nudge${clock.nudgeCount !== 1 ? 's' : ''}`}
                {clock.lastNudgeAt && ` · last ${formatDate(clock.lastNudgeAt)}`}
              </p>
            </div>
            <button
              onClick={() => toggleClock(clock.clockType, clock.isActive)}
              disabled={toggling === clock.clockType}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 ${
                clock.isActive
                  ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700'
              }`}
            >
              {clock.isActive ? 'Active' : 'Paused'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MessagesTab({ contactId, token }: { contactId: string; token: string }) {
  const { data, loading } = useApi<{ messages: Message[]; conversationId: string | null }>(
    `/api/contacts/${contactId}/messages`, token,
  )
  const messages = data?.messages ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className="h-8 w-48 bg-gray-200 rounded-2xl animate-pulse" />
        </div>
      ))}
    </div>
  )

  if (messages.length === 0) return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
      <MessageSquare size={28} className="text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-700">No messages yet</p>
      <p className="text-xs text-gray-400 mt-1">Start a conversation in the Inbox.</p>
      <Link href="/inbox" className="inline-flex items-center gap-1.5 px-4 py-2 mt-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
        <MessageSquare size={14} /> Open Inbox
      </Link>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{messages.length} messages</p>
        {data?.conversationId && (
          <Link href="/inbox" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            Open in inbox <ChevronRight size={11} />
          </Link>
        )}
      </div>
      <div className="p-4 space-y-2 max-h-[65vh] overflow-y-auto">
        {messages.map((msg, idx) => {
          const isUser   = msg.senderType === 'user'
          const prevMsg  = idx > 0 ? messages[idx - 1] : null
          const showDate = !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString()
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                    {new Date(msg.timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
              <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  isUser ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}>
                  <div className={isUser ? '[&_p]:text-white [&_a]:text-indigo-200' : ''}>
                    <MessageContent msg={msg} token={token} />
                  </div>
                  <p className={`text-[10px] mt-1 text-right ${isUser ? 'text-indigo-300' : 'text-gray-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── EditSlideOver ────────────────────────────────────────────────────────────

interface EditForm {
  name: string; phoneNumber: string; email: string; company: string
  jobTitle: string; industry: string; website: string; notes: string
  customerStatus: string; pipelineStage: string; leadScore: string
  sourceProductId: string; sourceSocialPostId: string
}

function EditSlideOver({ contact, token, onClose, onSaved }: {
  contact: ContactDetail; token: string; onClose: () => void; onSaved: () => void
}) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const hasMarketingAccess = session.data?.marketingAccess === 'beta' || session.data?.marketingAccess === 'enabled'
  const { data: productsData } = useApi<{ products: { id: string; name: string }[] }>(
    hasMarketingAccess ? '/api/products' : null, token,
  )
  const { data: postsData } = useApi<{ posts: { id: string; platform: string; caption: string }[] }>(
    hasMarketingAccess ? '/api/social-posts' : null, token,
  )
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditForm>({
    name:           contact.customName ?? contact.displayName ?? '',
    phoneNumber:    contact.phoneNumber ?? '',
    email:          contact.email ?? '',
    company:        contact.company ?? '',
    jobTitle:       contact.jobTitle ?? '',
    industry:       contact.industry ?? '',
    website:        contact.website ?? '',
    notes:          contact.notes ?? '',
    customerStatus: contact.customerStatus ?? 'contact',
    pipelineStage:  contact.pipelineStage ?? '',
    leadScore:      String(contact.leadScore ?? 0),
    sourceProductId:    contact.sourceProductId ?? '',
    sourceSocialPostId: contact.sourceSocialPostId ?? '',
  })

  const set = (field: keyof EditForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      await apiClient(`/api/contacts/${contact.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({
          name:           form.name || null,
          phoneNumber:    form.phoneNumber ? form.phoneNumber.replace(/\D/g, '') : null,
          email:          form.email || null,
          company:        form.company || null,
          jobTitle:       form.jobTitle || null,
          industry:       form.industry || null,
          website:        form.website || null,
          notes:          form.notes || null,
          customerStatus: form.customerStatus,
          pipelineStage:  form.pipelineStage || null,
          leadScore:      parseInt(form.leadScore) || 0,
          ...(hasMarketingAccess ? {
            sourceProductId:    form.sourceProductId || null,
            sourceSocialPostId: form.sourceSocialPostId || null,
          } : {}),
        }),
      })
      addToast({ variant: 'success', title: 'Contact saved' })
      onSaved(); onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to save' })
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Edit Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity</p>
            <div className="space-y-3">
              <label className="block"><span className={labelCls}>Display Name</span>
                <input value={form.name} onChange={set('name')} placeholder={contact.displayName ?? ''} className={inputCls} />
              </label>
              <label className="block"><span className={labelCls}>Phone Number</span>
                <input value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+260…" className={inputCls} />
              </label>
              <label className="block"><span className={labelCls}>Email</span>
                <input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" className={inputCls} />
              </label>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Professional</p>
            <div className="space-y-3">
              <label className="block"><span className={labelCls}>Company</span>
                <input value={form.company} onChange={set('company')} className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={labelCls}>Job Title</span>
                  <input value={form.jobTitle} onChange={set('jobTitle')} className={inputCls} />
                </label>
                <label className="block"><span className={labelCls}>Industry</span>
                  <input value={form.industry} onChange={set('industry')} className={inputCls} />
                </label>
              </div>
              <label className="block"><span className={labelCls}>Website</span>
                <input value={form.website} onChange={set('website')} placeholder="https://…" className={inputCls} />
              </label>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">CRM</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={labelCls}>Status</span>
                  <select value={form.customerStatus} onChange={set('customerStatus')} className={inputCls}>
                    {CUSTOMER_STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </label>
                <label className="block"><span className={labelCls}>Pipeline</span>
                  <select value={form.pipelineStage} onChange={set('pipelineStage')} className={inputCls}>
                    {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                  </select>
                </label>
              </div>
              <label className="block"><span className={labelCls}>Lead Score (0–100)</span>
                <input type="number" min="0" max="100" value={form.leadScore} onChange={set('leadScore')} className={inputCls} />
              </label>
            </div>
          </div>
          {hasMarketingAccess && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Lead Source</p>
              <p className="text-xs text-gray-400 mb-3">
                Which product or post brought this contact in — set manually since there's no live click-tracking yet.
              </p>
              <div className="space-y-3">
                <label className="block"><span className={labelCls}>Product</span>
                  <select value={form.sourceProductId} onChange={set('sourceProductId')} className={inputCls}>
                    <option value="">None</option>
                    {(productsData?.products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className={labelCls}>Social post</span>
                  <select value={form.sourceSocialPostId} onChange={set('sourceSocialPostId')} className={inputCls}>
                    <option value="">None</option>
                    {(postsData?.posts ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.platform} — {p.caption.slice(0, 40)}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
          <div>
            <label className="block"><span className={labelCls}>Notes</span>
              <textarea value={form.notes} onChange={set('notes')} rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </label>
          </div>
        </div>
        <div className="flex-shrink-0 border-t border-gray-200 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const zuriSession  = useZuriSession()
  const token        = zuriSession.data?.accessToken
  const router       = useRouter()
  const { addToast } = useToast()

  const { data: contactData, loading, error, refetch } = useApi<{ contact: ContactDetail }>(
    `/api/contacts/${id}`, token,
  )

  const [activeTab,  setActiveTab]  = useState<TabId>('profile')
  const [showEdit,   setShowEdit]   = useState(false)
  const [tagInput,   setTagInput]   = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagSaving,  setTagSaving]  = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  // local AI profile copy for optimistic updates
  const [localProfile, setLocalProfile] = useState<ContactProfile | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)

  const contact = contactData?.contact
  const mode    = zuriSession.data?.mode ?? 'hybrid'

  // sync local profile when data loads
  useEffect(() => {
    if (contact?.profile) setLocalProfile(contact.profile)
  }, [contact?.profile])

  const addTag = async () => {
    if (!tagInput.trim() || !token) return
    setTagSaving(true)
    try {
      await apiClient(`/api/contacts/${id}/tags`, { method: 'POST', token, body: JSON.stringify({ tag: tagInput.trim() }) })
      setTagInput(''); setShowTagInput(false); refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to add tag' }) }
    finally { setTagSaving(false) }
  }

  const removeTag = async (tag: string) => {
    if (!token) return
    try {
      await apiClient(`/api/contacts/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE', token })
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to remove tag' }) }
  }

  const rebuildAIProfile = async () => {
    if (!token) return
    setRebuilding(true)
    try {
      const convData = await apiClient<{ conversations: { id: string }[] }>(
        `/api/conversations?contactId=${id}`, { token },
      )
      const convId = convData.conversations?.[0]?.id
      if (!convId) {
        addToast({ variant: 'error', title: 'No conversation found for this contact' })
        return
      }
      await apiClient(
        `/api/conversations/${convId}/analyze`,
        { method: 'POST', token, body: JSON.stringify({ scope: 'all', includeProfile: true, includeSuggestions: false }) },
      )
      addToast({ variant: 'success', title: 'Profile rebuild queued — AI insights will update shortly' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to queue profile rebuild' })
    } finally {
      setRebuilding(false)
    }
  }

  const archiveContact = async () => {
    if (!token) return
    if (!confirm(`Archive ${contact?.name}? They'll be hidden from the contacts list.`)) return
    try {
      await apiClient(`/api/contacts/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Contact archived' })
      router.push('/contacts')
    } catch { addToast({ variant: 'error', title: 'Failed to archive contact' }) }
  }

  const handleAIFieldSaved = (key: AIFieldKey, value: string | null, lockAction: 'lock' | 'unlock' | 'none') => {
    setLocalProfile(prev => {
      if (!prev) return prev
      const locked = lockAction === 'lock'
        ? Array.from(new Set([...(prev.lockedFields ?? []), key]))
        : lockAction === 'unlock'
          ? (prev.lockedFields ?? []).filter(f => f !== key)
          : prev.lockedFields ?? []
      const edited = lockAction !== 'none' || value !== null
        ? Array.from(new Set([...(prev.userEditedFields ?? []), key]))
        : prev.userEditedFields ?? []
      return { ...prev, [key]: value, lockedFields: locked, userEditedFields: edited }
    })
  }

  // ── Loading state ──
  if (zuriSession.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ChevronLeft size={20} />
          </button>
          <div className="h-5 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <SkeletonCard /><SkeletonCard />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <Link href="/contacts" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
            <ChevronLeft size={14} /> Contacts
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-sm font-medium text-gray-900">Contact not found</p>
            <Link href="/contacts" className="text-xs text-indigo-600 hover:underline mt-1 block">Back to contacts</Link>
          </div>
        </div>
      </div>
    )
  }

  const profile     = localProfile ?? contact.profile
  const trend       = TREND[contact.relationship.healthTrend] ?? TREND.stable
  const TrendIcon   = trend.Icon
  const TierIcon    = TIER_ICON[contact.relationship.importanceTier] ?? User
  const tierLabel   = TIER_LABEL[contact.relationship.importanceTier] ?? 'Contact'
  const completeness= calcCompleteness(contact)
  const phoneHidden = isPhoneRedundant(contact)

  const buyingSignals      = contact.insights.filter(i => ['buying_signal','purchase_intent','interest','opportunity'].includes(i.key))
  const personalityInsights= contact.insights.filter(i => ['personality','communication_style','preference','behavior'].some(k => i.key.includes(k)))
  const otherInsights      = contact.insights.filter(i =>
    !buyingSignals.find(b => b.key === i.key) && !personalityInsights.find(p => p.key === i.key)
  )

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Nav bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <Link href="/contacts" className="text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{contact.name}</span>
          <div className="flex items-center gap-1.5">
            {contact.phoneNumber && !phoneHidden && (
              <a href={`tel:${contact.phoneNumber}`}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                <Phone size={17} />
              </a>
            )}
            <button onClick={() => setShowEdit(true)}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Edit3 size={17} />
            </button>
            <button
              onClick={rebuildAIProfile}
              disabled={rebuilding}
              title="Rebuild AI profile from all conversations"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rebuilding ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              <span className="hidden md:inline">Rebuild AI Profile</span>
            </button>
            <Link href="/inbox"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <MessageSquare size={14} />
              <span className="hidden sm:inline">Message</span>
            </Link>
          </div>
        </div>

        {/* ── Hero ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            {/* Left: health ring with avatar inside */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <HealthRing score={contact.relationship.healthScore} />
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${trend.bg} ${trend.cls}`}>
                <TrendIcon size={9} /> {trend.label}
              </span>
            </div>

            {/* Right: name + details */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{contact.name}</h1>

              {/* Company line */}
              {contact.company && (
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                  <Building2 size={12} className="flex-shrink-0 text-gray-400" />
                  {contact.company}{contact.jobTitle ? ` · ${contact.jobTitle}` : ''}
                </p>
              )}

              {/* Phone — only show if not same as name */}
              {contact.phoneNumber && !phoneHidden && (
                <a href={`tel:${contact.phoneNumber}`} className="text-sm text-indigo-600 hover:underline mt-0.5 block">
                  {formatPhone(contact.phoneNumber)}
                </a>
              )}

              {/* Status badges */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Badge variant={statusBadgeVariant(contact.customerStatus)} className="capitalize text-[11px]">
                  {contact.customerStatus}
                </Badge>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 capitalize">
                  <TierIcon size={11} className="text-indigo-400" />
                  {tierLabel}
                </span>
                {contact.pipelineStage && (
                  <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {contact.pipelineStage}
                  </span>
                )}
              </div>

              {/* Completeness bar */}
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Profile completeness</span>
                  {completeness < 100 && (
                    <button onClick={() => setShowEdit(true)} className="text-[10px] text-indigo-500 hover:underline">Fill in →</button>
                  )}
                </div>
                <CompletenessBar pct={completeness} />
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-around mt-4 pt-3 border-t border-gray-50">
            <div className="text-center">
              <p className="text-base font-bold text-gray-900 tabular-nums">{contact.stats.totalMessages}</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">msgs</p>
            </div>
            <div className="w-px h-7 bg-gray-100" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">
                {contact.relationship.lastInteractionAt ? timeAgo(contact.relationship.lastInteractionAt) : '—'}
              </p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">last contact</p>
            </div>
            <div className="w-px h-7 bg-gray-100" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">{contact.insights.length}</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">AI insights</p>
            </div>
            {contact.leadScore > 0 && mode !== 'personal' && (
              <>
                <div className="w-px h-7 bg-gray-100" />
                <div className="text-center">
                  <p className={`text-sm font-bold tabular-nums ${contact.leadScore >= 70 ? 'text-green-600' : contact.leadScore >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {contact.leadScore}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-tight mt-0.5">score</p>
                </div>
              </>
            )}
          </div>

          {/* Why the health score is what it is — always tell them why */}
          {contact.healthHistory[0]?.changeReason && (
            <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-gray-50">
              <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500 leading-snug">{contact.healthHistory[0].changeReason}</p>
            </div>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 sticky top-0 z-10">
          <div ref={tabBarRef} className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">

            {/* ══ PROFILE TAB ══ */}
            {activeTab === 'profile' && (
              <>
                {/* Contact info card */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-gray-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Info</p>
                    </div>
                    <button onClick={() => setShowEdit(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50">
                      <Edit3 size={12} /> Edit all
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {[
                      { icon: <Phone size={14} />, label: 'Phone', value: contact.phoneNumber ? formatPhone(contact.phoneNumber) : null, href: contact.phoneNumber ? `tel:${contact.phoneNumber}` : undefined },
                      { icon: <Mail size={14} />, label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
                      { icon: <Building2 size={14} />, label: 'Company', value: contact.company },
                      { icon: <Briefcase size={14} />, label: 'Job Title', value: contact.jobTitle },
                      { icon: <Activity size={14} />, label: 'Industry', value: contact.industry },
                      { icon: <Globe size={14} />, label: 'Website', value: contact.website, href: contact.website ?? undefined },
                      { icon: <Clock size={14} />, label: 'Added', value: formatDate(contact.createdAt) },
                    ].map(({ icon, label, value, href }) => value ? (
                      <div key={label} className="flex items-start gap-3 px-4 py-3">
                        <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">{label}</p>
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline break-all">{value}</a>
                          ) : (
                            <p className="text-sm text-gray-800 break-words">{value}</p>
                          )}
                        </div>
                      </div>
                    ) : null)}
                  </div>
                  {!contact.phoneNumber && !contact.email && !contact.company && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">No contact details yet.</p>
                      <button onClick={() => setShowEdit(true)} className="text-xs text-indigo-600 hover:underline mt-1">Add details →</button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {contact.notes && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb size={14} className="text-gray-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                )}

                {/* Tags */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag size={14} className="text-gray-400" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 pl-2.5 pr-1.5 py-1 rounded-full">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="text-indigo-300 hover:text-red-500 ml-0.5">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {showTagInput ? (
                      <span className="inline-flex items-center gap-1">
                        <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setShowTagInput(false); setTagInput('') } }}
                          placeholder="tag"
                          className="text-xs border border-indigo-300 rounded-full px-2.5 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <button onClick={addTag} disabled={tagSaving || !tagInput.trim()} className="text-xs text-indigo-600 font-medium disabled:opacity-40">
                          {tagSaving ? '…' : 'Add'}
                        </button>
                        <button onClick={() => { setShowTagInput(false); setTagInput('') }} className="text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setShowTagInput(true)}
                        className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-300 px-2.5 py-1 rounded-full transition-colors">
                        <Tag size={9} /> + tag
                      </button>
                    )}
                  </div>
                </div>

                {/* Relationship */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart size={14} className="text-gray-400" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Relationship</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Type</p>
                      <p className="text-sm text-gray-700 capitalize">{contact.relationship.type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Tier</p>
                      <p className="text-sm text-gray-700">{tierLabel}</p>
                    </div>
                    {contact.relationship.lastInteractionAt && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Last Interaction</p>
                        <p className="text-sm text-gray-700">{formatDate(contact.relationship.lastInteractionAt)}</p>
                      </div>
                    )}
                    {contact.relationship.notes && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Notes</p>
                        <p className="text-sm text-gray-700 leading-snug">{contact.relationship.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Health history */}
                {contact.healthHistory.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <Activity size={14} className="text-gray-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Health History</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {contact.healthHistory.slice(0, 5).map((h, i) => {
                        const delta = h.score - (h.previousScore ?? h.score)
                        return (
                          <div key={i} className="flex items-start gap-3 px-4 py-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              h.score >= 70 ? 'bg-green-100 text-green-700' : h.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>{h.score}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold flex items-center gap-0.5 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                  {delta > 0 ? <ArrowUpRight size={11} /> : delta < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
                                  {delta > 0 ? '+' : ''}{delta}
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(h.recordedAt)}</span>
                              </div>
                              {h.changeReason && <p className="text-sm text-gray-700 mt-0.5 leading-snug">{h.changeReason}</p>}
                              <FactorBreakdown factors={h.factors} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══ AI PROFILE TAB ══ */}
            {activeTab === 'ai' && (
              <>
                {profile && (
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3 flex items-start gap-2">
                    <Brain size={14} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-indigo-700">AI-Generated Profile</p>
                      <p className="text-[11px] text-indigo-500 mt-0.5 leading-relaxed">
                        Zuri fills these fields automatically from conversation analysis. Once you edit a field, AI will no longer overwrite it — unless you unlock it.
                      </p>
                    </div>
                  </div>
                )}

                {AI_FIELDS.map(field => (
                  <AIProfileField
                    key={field.key}
                    contactId={contact.id}
                    token={token!}
                    fieldKey={field.key}
                    label={field.label}
                    value={(profile as any)?.[field.key] ?? null}
                    state={profile ? getFieldState(field.key, profile) : 'ai'}
                    onSaved={handleAIFieldSaved}
                  />
                ))}

                {contact.opportunities.length > 0 && (
                  <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100 bg-amber-50/50">
                      <Zap size={14} className="text-amber-500" />
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Opportunities</p>
                    </div>
                    <div className="divide-y divide-amber-50">
                      {contact.opportunities.map(opp => {
                        const config = OPPORTUNITY_TYPE_CONFIG[opp.opportunityType]
                        const Icon = config?.Icon ?? Zap
                        return (
                          <div key={opp.id} className="flex items-start gap-3 px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] border px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${config?.cls ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              <Icon size={10} /> {config?.label ?? opp.opportunityType}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 leading-snug">{opp.title}</p>
                              {opp.description && <p className="text-xs text-gray-400 mt-0.5">{opp.description}</p>}
                              {opp.estimatedValueCents !== null && (
                                <p className="text-xs font-medium text-green-600 mt-0.5">
                                  {(opp.estimatedValueCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })}
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 bg-gray-100 text-gray-500">
                              {Math.round(opp.confidence * 100)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {contact.connections.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <User size={14} className="text-indigo-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Connected To</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {contact.connections.map(c => (
                        <Link key={c.id} href={`/contacts/${c.otherContactId}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0 text-sm">
                            <span className="text-gray-800">{contact.name}</span>{' '}
                            <span className="text-gray-400">{CONNECTION_TYPE_LABELS[c.connectionType] ?? c.connectionType.replace(/_/g, ' ')}</span>{' '}
                            <span className="font-medium text-gray-900">{c.otherContactName}</span>
                          </div>
                          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <NetworkValueCard value={contact.relationship.networkValue} />

                {contact.products.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <ShoppingCart size={14} className="text-indigo-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {contact.products.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">
                              {p.productName}{p.quantity && p.quantity > 1 ? ` ×${p.quantity}` : ''}
                            </p>
                            {p.replacementPredictedAt && (
                              <p className="text-xs text-amber-600 mt-0.5">Replacement due {formatDate(p.replacementPredictedAt)}</p>
                            )}
                          </div>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                            {PRODUCT_RELATION_LABELS[p.relationType] ?? p.relationType}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {contact.lifeEvents.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <Sparkles size={14} className="text-indigo-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Life Events</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {contact.lifeEvents.map(e => (
                        <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                          {LIFE_EVENT_ICONS[e.eventType] ?? <Bell size={15} className="text-gray-400" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{e.title}</p>
                            {e.eventDate && <p className="text-xs text-gray-400 mt-0.5">{formatDate(e.eventDate)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <GoalsPanel contactId={contact.id} token={token!} mode={mode} />

                {buyingSignals.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <Zap size={14} className="text-amber-500" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buying Signals</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {buyingSignals.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{insight.value}</p>
                            {insight.supportingText && <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>}
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                            insight.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>{Math.round(insight.confidence * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {personalityInsights.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                      <User size={14} className="text-indigo-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Personality Insights</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {personalityInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${insight.confidence >= 0.8 ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-indigo-600 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-gray-700 mt-0.5 leading-snug">{insight.value}</p>
                            {insight.supportingText && <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {otherInsights.length > 0 && (
                  <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none">
                      <Sparkles size={14} className="text-gray-400" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">All Insights ({contact.insights.length})</p>
                      <ChevronRight size={14} className="text-gray-300" />
                    </summary>
                    <div className="divide-y divide-gray-50">
                      {otherInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3">
                          <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${insight.confidence >= 0.8 ? 'bg-indigo-400' : 'bg-gray-200'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-500 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-gray-700 mt-0.5 leading-snug">{insight.value}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(insight.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {contact.insights.length === 0 && !profile?.personalitySummary && (
                  <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                    <Sparkles size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No intelligence data yet</p>
                    <p className="text-xs text-gray-400 mt-1">Insights appear as Zuri analyses conversations.</p>
                  </div>
                )}
              </>
            )}

            {/* ══ ACTIVITY TAB ══ */}
            {activeTab === 'activity' && (
              <>
                {/* Proactive suggestions */}
                {contact.proactiveSuggestions.length > 0 && (
                  <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
                      <Zap size={14} className="text-amber-500" />
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">AI Suggestions</p>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {contact.proactiveSuggestions.map(s => (
                        <div key={s.id} className="px-4 py-3">
                          <p className="text-sm font-medium text-amber-900">{s.title}</p>
                          <p className="text-xs text-amber-700 mt-0.5 leading-snug">{s.body}</p>
                          {s.draftMessage && (
                            <div className="mt-2 bg-white rounded-lg border border-amber-200 p-2.5">
                              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide mb-1">Suggested reply</p>
                              <p className="text-xs text-gray-700 leading-snug">{s.draftMessage}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <CheckSquare size={14} className="text-gray-400" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</p>
                  </div>
                  <div className="p-4">
                    <TasksPanel contactId={contact.id} token={token!} />
                  </div>
                </div>

                {/* Context pins */}
                <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100 bg-amber-50/50">
                    <Pin size={14} className="text-amber-500" />
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Important Context</p>
                  </div>
                  <div className="p-4">
                    <ContextPinsPanel contactId={contact.id} token={token!} />
                  </div>
                </div>
              </>
            )}

            {/* ══ CALENDAR TAB ══ */}
            {activeTab === 'calendar' && (
              <CalendarPanel
                contactId={contact.id}
                token={token!}
                events={contact.upcomingEvents}
                onRefresh={refetch}
              />
            )}

            {/* ══ DOCS TAB ══ */}
            {activeTab === 'docs' && (
              <DocumentsPanel contactId={contact.id} token={token!} />
            )}

            {/* ══ CLOCKS TAB ══ */}
            {activeTab === 'clocks' && (
              <ClocksPanel contactId={contact.id} token={token!} />
            )}

            {/* ══ MESSAGES TAB ══ */}
            {activeTab === 'messages' && (
              <MessagesTab contactId={contact.id} token={token!} />
            )}

          </div>
        </div>
      </div>

      {/* Archive button — bottom of page on mobile */}
      <div className="fixed bottom-20 right-4 z-20 sm:hidden">
        <button onClick={archiveContact}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200">
          <Trash2 size={16} />
        </button>
      </div>

      {showEdit && token && (
        <EditSlideOver contact={contact} token={token!} onClose={() => setShowEdit(false)} onSaved={refetch} />
      )}
    </>
  )
}
