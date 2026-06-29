'use client'

import { use, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Phone,
  Mail,
  Globe,
  Building2,
  Briefcase,
  Star,
  Activity,
  ChevronRight,
  Zap,
  Clock,
  Heart,
  User,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Edit3,
  Tag,
  Trash2,
  X,
  Check,
  Loader2,
  Calendar,
  Gift,
  Briefcase as BriefcaseIcon,
  Plane,
  PartyPopper,
  Bell,
  CheckSquare,
  Square,
  Plus,
  Pin,
  PinOff,
  Target,
  TrendingUp as Upsell,
  RefreshCw,
  ShoppingCart,
  MapPin,
  Download,
  Music,
  Film,
  Image,
  Mic,
  FileText,
  Send,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, useToast } from '@/components/ui'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

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
  }
  profile: {
    personalitySummary: string
    communicationStyle: string | null
    emotionalPatterns: string | null
    knownTriggers: string | null
    currentLifeContext: string | null
    moodBaseline: string | null
    updatedAt: string | null
  } | null
  insights: Array<{
    key: string
    value: string
    confidence: number
    supportingText: string | null
    createdAt: string
  }>
  healthHistory: Array<{
    score: number
    previousScore: number
    changeReason: string | null
    factors: unknown
    recordedAt: string
  }>
  stats: {
    totalMessages: number
    sent: number
    received: number
  }
  proactiveSuggestions: Array<{
    id: string
    suggestionType: string
    title: string
    body: string
    draftMessage: string | null
    priority: number
  }>
  upcomingEvents: Array<{
    id: string
    eventType: string
    title: string
    eventDate: string
    isRecurring: boolean
    confidence: number
  }>
}

interface Task {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  completedAt: string | null
  createdBy: 'user' | 'ai'
  createdAt: string
}

interface ContextPin {
  id: string
  content: string
  createdAt: string
}

interface Message {
  id: string
  senderType: 'user' | 'contact'
  messageType?: string
  body: string | null
  timestamp: string
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
  quotedMessageId?: string | null
  pendingSuggestions: number
}

interface EditForm {
  name: string
  phoneNumber: string
  email: string
  company: string
  jobTitle: string
  industry: string
  website: string
  notes: string
  customerStatus: string
  pipelineStage: string
  leadScore: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'intelligence' | 'timeline' | 'messages'

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

const EVENT_ICONS: Record<string, React.ReactNode> = {
  birthday:    <Gift size={13} className="text-pink-500" />,
  anniversary: <Heart size={13} className="text-red-500" />,
  job_change:  <BriefcaseIcon size={13} className="text-blue-500" />,
  travel:      <Plane size={13} className="text-sky-500" />,
  celebration: <PartyPopper size={13} className="text-amber-500" />,
  appointment: <Calendar size={13} className="text-indigo-500" />,
  deadline:    <Bell size={13} className="text-orange-500" />,
}

const OPPORTUNITY_KEYS = ['buying_signal', 'purchase_intent', 'interest', 'opportunity', 'upsell', 'cross_sell', 'renewal', 'churn_risk']

const OPPORTUNITY_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  upsell:         { label: 'Upsell',      cls: 'bg-green-50 text-green-700 border-green-200',  Icon: Upsell },
  cross_sell:     { label: 'Cross-sell',  cls: 'bg-blue-50 text-blue-700 border-blue-200',     Icon: ShoppingCart },
  renewal:        { label: 'Renewal',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', Icon: RefreshCw },
  buying_signal:  { label: 'Buying',      cls: 'bg-amber-50 text-amber-700 border-amber-200',  Icon: Zap },
  purchase_intent:{ label: 'Intent',      cls: 'bg-amber-50 text-amber-700 border-amber-200',  Icon: Target },
  interest:       { label: 'Interest',    cls: 'bg-purple-50 text-purple-700 border-purple-200', Icon: Sparkles },
  opportunity:    { label: 'Opportunity', cls: 'bg-teal-50 text-teal-700 border-teal-200',     Icon: Target },
  churn_risk:     { label: 'Churn Risk',  cls: 'bg-red-50 text-red-700 border-red-200',        Icon: Bell },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone
  return phone.startsWith('+') ? phone : `+${digits}`
}

function formatDate(ts: string | null) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 7)  return `In ${diff} days`
  if (diff < 30) return `In ${Math.floor(diff / 7)} week${diff >= 14 ? 's' : ''}`
  return formatEventDate(dateStr)
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000)return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function statusBadgeVariant(status: string): 'default' | 'success' | 'info' | 'warning' | 'error' | 'purple' {
  switch (status) {
    case 'vip':      return 'purple'
    case 'customer': return 'success'
    case 'lead':
    case 'prospect': return 'warning'
    case 'partner':  return 'info'
    case 'supplier': return 'default'
    default:         return 'default'
  }
}

function moodColor(mood: string | null) {
  if (!mood) return 'bg-gray-100 text-gray-600 border-gray-200'
  if (mood === 'positive') return 'bg-green-50 text-green-700 border-green-200'
  if (mood === 'negative') return 'bg-red-50 text-red-600 border-red-200'
  if (mood === 'variable') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

function calcCompleteness(contact: ContactDetail): number {
  const fields = [
    !!contact.phoneNumber,
    !!contact.email,
    !!contact.company,
    !!contact.jobTitle,
    !!contact.industry,
    !!contact.notes,
    contact.tags.length > 0,
    !!contact.profile?.personalitySummary,
  ]
  const filled = fields.filter(Boolean).length
  return Math.round((filled / fields.length) * 100)
}

function mediaHref(url: string | null | undefined, token: string | undefined): string {
  if (!url) return ''
  const base = url.startsWith('http') ? url : `${API_BASE}${url}`
  return token ? `${base}?token=${token}` : base
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
    } catch { return <p className="text-sm text-gray-700">📍 Location</p> }
  }

  if (mt === 'contact_card') return (
    <p className="flex items-center gap-1.5 text-sm text-gray-700">
      <Phone size={12} className="text-gray-400" /> {msg.body ?? 'Contact'}
    </p>
  )

  if (mt === 'image' || mt === 'sticker') {
    return (
      <div className="space-y-1">
        {href ? (
          <img src={href} alt="" className="rounded-lg max-w-[200px] max-h-[200px] object-cover" />
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><Image size={13} /> Photo</div>
        )}
        {msg.body && <p className="text-xs text-gray-600">{msg.body}</p>}
      </div>
    )
  }

  if (mt === 'video') {
    return (
      <div className="space-y-1">
        {href ? (
          <video src={href} controls className="rounded-lg max-w-[200px]" style={{ maxHeight: 160 }} />
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><Film size={13} /> Video</div>
        )}
        {msg.body && <p className="text-xs text-gray-600">{msg.body}</p>}
      </div>
    )
  }

  if (mt === 'audio') {
    return (
      <div className="space-y-1">
        {href ? (
          <audio src={href} controls className="max-w-[220px]" />
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><Mic size={13} /> Voice message</div>
        )}
        {msg.transcription && <p className="text-xs text-gray-500 italic">"{msg.transcription}"</p>}
      </div>
    )
  }

  if (mt === 'document') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
        <FileText size={14} className="text-gray-400" />
        <span className="truncate max-w-[160px]">{msg.body ?? 'Document'}</span>
        <Download size={12} className="text-gray-400 flex-shrink-0" />
      </a>
    )
  }

  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body ?? ''}</p>
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, className, accent, action }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; accent?: boolean; action?: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${accent ? 'border-indigo-100' : 'border-gray-200'} ${className ?? ''}`}>
      <div className={`flex items-center gap-2 px-5 py-3.5 border-b ${accent ? 'border-indigo-50 bg-indigo-50/30' : 'border-gray-100'}`}>
        {icon && <span className={accent ? 'text-indigo-500' : 'text-gray-400'}>{icon}</span>}
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-indigo-700' : 'text-gray-500'}`}>{title}</p>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function HealthRing({ score }: { score: number }) {
  const r     = 36
  const circ  = 2 * Math.PI * r
  const pct   = Math.max(0, Math.min(100, score))
  const offset= circ - (pct / 100) * circ
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold text-gray-900 leading-none">{score}</p>
        <p className="text-[10px] text-gray-400 leading-none mt-0.5">health</p>
      </div>
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
      <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">{pct}%</span>
    </div>
  )
}

function InfoRow({ icon, label, value, href }: {
  icon: React.ReactNode; label: string; value: string | null | undefined; href?: string
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline break-all">{value}</a>
        ) : (
          <p className="text-sm text-gray-800 break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

// ─── Tasks panel ─────────────────────────────────────────────────────────────

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
        method: 'POST', token,
        body: JSON.stringify({ title: newTitle.trim(), dueDate: newDue || undefined }),
      })
      setNewTitle(''); setNewDue(''); setAdding(false)
      refetch()
    } catch { addToast({ variant: 'error', title: 'Failed to add task' }) }
    finally { setSaving(false) }
  }

  const toggleTask = async (task: Task) => {
    try {
      await apiClient(`/api/contacts/${contactId}/tasks/${task.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ completed: !task.completedAt }),
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
              <p className={`text-[11px] mt-0.5 font-medium ${
                new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'
              }`}>Due {formatDate(task.dueDate)}</p>
            )}
          </div>
          {task.createdBy === 'ai' && (
            <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full border border-indigo-100 flex-shrink-0">AI</span>
          )}
          <button onClick={() => deleteTask(task.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      ))}

      {adding && (
        <div className="flex items-start gap-2 pt-1">
          <div className="flex-1 space-y-2">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
              placeholder="Task description…"
              className="w-full text-sm border border-indigo-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="date"
              value={newDue}
              onChange={e => setNewDue(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600"
            />
            <div className="flex items-center gap-2">
              <button onClick={addTask} disabled={!newTitle.trim() || saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Add task
              </button>
              <button onClick={() => { setAdding(false); setNewTitle(''); setNewDue('') }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 transition-colors">
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
                <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0 text-indigo-400 hover:text-gray-300 transition-colors">
                  <CheckSquare size={16} />
                </button>
                <p className="text-sm text-gray-500 line-through flex-1">{task.title}</p>
                <button onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
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

// ─── Context Pins panel ───────────────────────────────────────────────────────

function ContextPinsPanel({ contactId, token }: { contactId: string; token: string }) {
  const { addToast } = useToast()
  const { data, refetch } = useApi<{ pins: ContextPin[] }>(`/api/contacts/${contactId}/context`, token)
  const pins = data?.pins ?? []
  const [adding, setAdding] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const addPin = async () => {
    if (!newContent.trim()) return
    setSaving(true)
    try {
      await apiClient(`/api/contacts/${contactId}/context`, {
        method: 'POST', token, body: JSON.stringify({ content: newContent.trim() }),
      })
      setNewContent(''); setAdding(false)
      refetch()
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

      {pins.length === 0 && !adding && (
        <p className="text-sm text-gray-400 py-1">No context pins yet.</p>
      )}

      {pins.map(pin => (
        <div key={pin.id} className="flex items-start gap-2.5 group py-1.5 px-3 bg-amber-50 border border-amber-100 rounded-lg">
          <Pin size={11} className="text-amber-400 flex-shrink-0 mt-1" />
          <p className="flex-1 text-sm text-amber-900 leading-snug">{pin.content}</p>
          <button onClick={() => deletePin(pin.id)}
            className="opacity-0 group-hover:opacity-100 text-amber-300 hover:text-red-400 transition-all flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-2 pt-1">
          <textarea
            ref={inputRef}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addPin() }}
            placeholder="e.g. Allergic to peanuts · Prefers morning calls · Budget approved Q3"
            rows={2}
            className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-amber-50/50"
          />
          <div className="flex items-center gap-2">
            <button onClick={addPin} disabled={!newContent.trim() || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Pin size={11} />}
              Pin it
            </button>
            <button onClick={() => { setAdding(false); setNewContent('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-medium mt-1 transition-colors">
          <Pin size={12} /> Add context
        </button>
      )}
    </div>
  )
}

// ─── Messages tab ─────────────────────────────────────────────────────────────

function MessagesTab({ contactId, token }: { contactId: string; token: string }) {
  const { data, loading } = useApi<{ messages: Message[]; conversationId: string | null }>(
    `/api/contacts/${contactId}/messages`, token,
  )
  const messages = data?.messages ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (loading) return (
    <div className="space-y-3 p-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className="h-8 w-48 bg-gray-200 rounded-2xl animate-pulse" />
        </div>
      ))}
    </div>
  )

  if (messages.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-700">No messages yet</p>
      <p className="text-xs text-gray-400 mt-1">Start a conversation in the Inbox.</p>
      <Link href="/inbox"
        className="inline-flex items-center gap-1.5 px-4 py-2 mt-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
        <MessageSquare size={14} /> Open Inbox
      </Link>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {messages.length} messages
        </p>
        {data?.conversationId && (
          <Link href="/inbox" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            Open in inbox <ChevronRight size={11} />
          </Link>
        )}
      </div>
      <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
        {messages.map((msg, idx) => {
          const isUser = msg.senderType === 'user'
          const prevMsg = idx > 0 ? messages[idx - 1] : null
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
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
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

// ─── Edit slide-over ─────────────────────────────────────────────────────────

function EditSlideOver({
  contact, token, onClose, onSaved,
}: {
  contact: ContactDetail
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditForm>({
    name:           contact.customName ?? contact.displayName ?? '',
    phoneNumber:    formatPhone(contact.phoneNumber),
    email:          contact.email ?? '',
    company:        contact.company ?? '',
    jobTitle:       contact.jobTitle ?? '',
    industry:       contact.industry ?? '',
    website:        contact.website ?? '',
    notes:          contact.notes ?? '',
    customerStatus: contact.customerStatus ?? 'contact',
    pipelineStage:  contact.pipelineStage ?? '',
    leadScore:      String(contact.leadScore ?? 0),
  })

  const set = (field: keyof EditForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      await apiClient(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name:           form.name          || null,
          phoneNumber:    form.phoneNumber ? form.phoneNumber.replace(/\D/g, '') : null,
          email:          form.email         || null,
          company:        form.company       || null,
          jobTitle:       form.jobTitle      || null,
          industry:       form.industry      || null,
          website:        form.website       || null,
          notes:          form.notes         || null,
          customerStatus: form.customerStatus,
          pipelineStage:  form.pipelineStage  || null,
          leadScore:      parseInt(form.leadScore) || 0,
        }),
      })
      addToast({ variant: 'success', title: 'Contact saved' })
      onSaved()
      onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to save', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Edit Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Display Name</span>
                <input value={form.name} onChange={set('name')} placeholder={contact.displayName ?? contact.phoneNumber ?? ''}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Phone Number</span>
                <input type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+260971234567"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Status</span>
                <select value={form.customerStatus} onChange={set('customerStatus')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {CUSTOMER_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Info</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Email</span>
                <input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Website</span>
                <input type="url" value={form.website} onChange={set('website')} placeholder="https://"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Business</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Company</span>
                <input value={form.company} onChange={set('company')} placeholder="Company name"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Job Title</span>
                <input value={form.jobTitle} onChange={set('jobTitle')} placeholder="e.g. Owner, Manager"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Industry</span>
                <input value={form.industry} onChange={set('industry')} placeholder="e.g. Retail, Construction"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Stage</span>
                <select value={form.pipelineStage} onChange={set('pipelineStage')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s || 'None'}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Lead Score (0–100)</span>
                <input type="number" min={0} max={100} value={form.leadScore} onChange={set('leadScore')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Notes</p>
            <textarea value={form.notes} onChange={set('notes')} rows={5}
              placeholder="Private notes about this contact…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const session = useZuriSession()
  const router  = useRouter()
  const token   = session.data?.accessToken
  const mode    = session.data?.mode ?? 'hybrid'
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showEdit,  setShowEdit]  = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagSaving, setTagSaving] = useState(false)

  const { addToast } = useToast()

  const { data: contactData, loading, refetch } = useApi<{ contact: ContactDetail }>(
    `/api/contacts/${id}`,
    token,
  )

  const addTag = async () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (!trimmed || !token) return
    setTagSaving(true)
    try {
      await apiClient(`/api/contacts/${id}/tags`, { method: 'POST', token, body: JSON.stringify({ tag: trimmed }) })
      setTagInput('')
      setShowTagInput(false)
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add tag' })
    } finally {
      setTagSaving(false)
    }
  }

  const removeTag = async (tag: string) => {
    if (!token) return
    try {
      await apiClient(`/api/contacts/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE', token })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to remove tag' })
    }
  }

  const archiveContact = async () => {
    if (!token) return
    try {
      await apiClient(`/api/contacts/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Contact archived' })
      router.push('/contacts')
    } catch {
      addToast({ variant: 'error', title: 'Failed to archive contact' })
    }
  }

  const contact = contactData?.contact

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',     label: 'Overview'       },
    { id: 'intelligence', label: 'AI Intelligence' },
    { id: 'timeline',     label: 'Health History'  },
    { id: 'messages',     label: 'Messages'        },
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div className="h-6 w-40 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-3xl mx-auto w-full">
          <div className="h-36 bg-gray-200 rounded-xl animate-pulse" />
          <SkeletonCard /><SkeletonCard />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <Link href="/contacts" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
            <ChevronRight size={14} className="rotate-180" /> Contacts
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

  const trend    = TREND[contact.relationship.healthTrend] ?? TREND.stable
  const TrendIcon= trend.Icon
  const TierIcon = TIER_ICON[contact.relationship.importanceTier] ?? User
  const tierLabel= TIER_LABEL[contact.relationship.importanceTier] ?? 'Contact'
  const completeness = calcCompleteness(contact)

  const responseRatio = contact.stats.totalMessages > 0
    ? Math.round((contact.stats.received / contact.stats.totalMessages) * 100)
    : 0

  const buyingSignals      = contact.insights.filter(i => ['buying_signal','purchase_intent','interest','opportunity'].includes(i.key))
  const opportunityFlags   = contact.insights.filter(i => OPPORTUNITY_KEYS.includes(i.key))
  const personalityInsights= contact.insights.filter(i => ['personality','communication_style','preference','behavior'].includes(i.key))
  const otherInsights      = contact.insights.filter(i =>
    !buyingSignals.find(b => b.key === i.key) && !personalityInsights.find(p => p.key === i.key)
  )

  const topSuggestion = contact.proactiveSuggestions[0] ?? null
  const hasAiProfile  = !!contact.profile?.personalitySummary
  const aiInsightCount= contact.insights.length

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Nav header ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3">
          <Link href="/contacts" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronRight size={18} className="rotate-180" />
          </Link>
          <span className="text-xs text-gray-400 hidden sm:inline">Contacts</span>
          <ChevronRight size={14} className="text-gray-300 hidden sm:inline" />
          <span className="text-sm font-medium text-gray-900 truncate">{contact.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit3 size={14} /> Edit
            </button>
            {contact.phoneNumber && (
              <a href={`tel:${formatPhone(contact.phoneNumber)}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Phone size={14} /> Call
              </a>
            )}
            <button
              onClick={archiveContact}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              title="Archive contact"
            >
              <Trash2 size={14} /> Archive
            </button>
            <Link href="/inbox"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <MessageSquare size={14} /> Message
            </Link>
          </div>
        </div>

        {/* ── Hero card ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-5">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">{contact.name}</h1>
                  {contact.company && (
                    <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1.5">
                      <Building2 size={13} className="text-gray-400 flex-shrink-0" />
                      {contact.company}
                      {contact.jobTitle && <span className="text-gray-400">· {contact.jobTitle}</span>}
                    </p>
                  )}
                  {contact.phoneNumber && (
                    <p className="text-sm text-gray-500 mt-0.5">{formatPhone(contact.phoneNumber)}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant={statusBadgeVariant(contact.customerStatus)} className="capitalize">
                      {contact.customerStatus}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 capitalize">
                      <TierIcon size={12} className="text-indigo-500" />
                      {tierLabel}
                    </span>
                    {contact.pipelineStage && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {contact.pipelineStage}
                      </span>
                    )}
                    {hasAiProfile && (
                      <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                        <Brain size={9} /> AI profiled
                      </span>
                    )}
                    {topSuggestion && (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Zap size={9} /> Action suggested
                      </span>
                    )}
                    {contact.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 pl-2 pr-1 py-0.5 rounded-full">
                        <Tag size={9} />{tag}
                        <button onClick={() => removeTag(tag)}
                          className="text-indigo-300 hover:text-indigo-600 transition-colors ml-0.5" title={`Remove tag "${tag}"`}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {showTagInput ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setShowTagInput(false); setTagInput('') } }}
                          placeholder="tag name"
                          className="text-xs border border-indigo-300 rounded-full px-2 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                        <button onClick={addTag} disabled={tagSaving || !tagInput.trim()} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">
                          {tagSaving ? '…' : 'Add'}
                        </button>
                        <button onClick={() => { setShowTagInput(false); setTagInput('') }} className="text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setShowTagInput(true)}
                        className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-full transition-colors">
                        <Tag size={9} /> + tag
                      </button>
                    )}
                  </div>
                </div>
                <HealthRing score={contact.relationship.healthScore} />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <HealthBar score={contact.relationship.healthScore} showLabel size="sm" className="flex-1 max-w-xs" />
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${trend.bg} ${trend.cls}`}>
                  <TrendIcon size={11} /> {trend.label}
                </span>
              </div>

              {/* Completeness */}
              <div className="mt-3 max-w-xs">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Profile completeness</p>
                  {completeness < 100 && (
                    <button onClick={() => setShowEdit(true)} className="text-[10px] text-indigo-500 hover:underline">Fill in →</button>
                  )}
                </div>
                <CompletenessBar pct={completeness} />
              </div>

              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900">{contact.stats.totalMessages.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">messages</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900">{contact.stats.sent.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">sent</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900">{contact.stats.received.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">received</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900">{responseRatio}%</p>
                  <p className="text-[10px] text-gray-400 leading-tight">from them</p>
                </div>
                {aiInsightCount > 0 && (
                  <>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-center">
                      <p className="text-base font-bold text-indigo-600">{aiInsightCount}</p>
                      <p className="text-[10px] text-gray-400 leading-tight">AI insights</p>
                    </div>
                  </>
                )}
                {contact.leadScore > 0 && mode !== 'personal' && (
                  <>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-center">
                      <p className={`text-base font-bold leading-tight ${contact.leadScore >= 70 ? 'text-green-600' : contact.leadScore >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {contact.leadScore}
                      </p>
                      <p className="text-[10px] text-gray-400 leading-tight">lead score</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 overflow-x-auto">
          <div className="max-w-3xl mx-auto flex gap-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.id === 'intelligence' && aiInsightCount > 0 && (
                  <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">
                    {aiInsightCount}
                  </span>
                )}
                {tab.id === 'messages' && contact.stats.totalMessages > 0 && (
                  <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                    {contact.stats.totalMessages}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-4">

            {/* ══ OVERVIEW ══ */}
            {activeTab === 'overview' && (
              <>
                {/* 1. AI INTELLIGENCE HUB */}
                <div className={`rounded-xl border p-5 ${
                  hasAiProfile
                    ? 'bg-gradient-to-br from-indigo-50 via-purple-50 to-violet-50 border-indigo-100'
                    : 'bg-gray-50 border-dashed border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Brain size={16} className={hasAiProfile ? 'text-indigo-600' : 'text-gray-300'} />
                      <p className={`text-sm font-semibold ${hasAiProfile ? 'text-indigo-900' : 'text-gray-500'}`}>
                        Zuri's Intelligence
                      </p>
                    </div>
                    {contact.profile?.updatedAt && (
                      <span className="text-[10px] text-indigo-400">Updated {timeAgo(contact.profile.updatedAt)}</span>
                    )}
                  </div>

                  {hasAiProfile ? (
                    <>
                      <p className="text-sm text-indigo-900 leading-relaxed">{contact.profile!.personalitySummary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {contact.profile!.moodBaseline && (
                          <span className={`inline-flex items-center gap-1 text-xs border px-2.5 py-1 rounded-full font-medium ${moodColor(contact.profile!.moodBaseline)}`}>
                            <Heart size={10} /> {contact.profile!.moodBaseline} mood
                          </span>
                        )}
                        {contact.profile!.communicationStyle && (
                          <span className="inline-flex items-center gap-1 text-xs bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                            <MessageSquare size={10} /> {contact.profile!.communicationStyle}
                          </span>
                        )}
                        {aiInsightCount > 0 && (
                          <button onClick={() => setActiveTab('intelligence')}
                            className="inline-flex items-center gap-1 text-xs bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full hover:bg-indigo-50 transition-colors">
                            <Sparkles size={10} /> {aiInsightCount} insights
                          </button>
                        )}
                      </div>
                      {contact.profile!.currentLifeContext && (
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Current Context</p>
                          <p className="text-sm text-indigo-800 leading-relaxed">{contact.profile!.currentLifeContext}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-3 py-1">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <Brain size={16} className="text-gray-300" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 font-medium">Building {contact.name}'s AI profile…</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Zuri analyses every conversation and builds a living psychological profile over time.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. OPPORTUNITY FLAGS */}
                {opportunityFlags.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Opportunity Flags</p>
                    <div className="flex flex-wrap gap-2">
                      {opportunityFlags.map((insight, i) => {
                        const cfg = OPPORTUNITY_CONFIG[insight.key] ?? OPPORTUNITY_CONFIG.opportunity
                        const Icon = cfg.Icon
                        return (
                          <div key={i} title={insight.value}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.cls} cursor-default`}>
                            <Icon size={11} />
                            {cfg.label}
                            <span className="text-[10px] opacity-70 ml-0.5">{Math.round(insight.confidence * 100)}%</span>
                          </div>
                        )
                      })}
                    </div>
                    {opportunityFlags.length > 0 && (
                      <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                        {opportunityFlags[0].value}
                      </p>
                    )}
                  </div>
                )}

                {/* 3. NEXT BEST ACTION */}
                {topSuggestion && (
                  <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-100 bg-amber-100/50">
                      <Zap size={14} className="text-amber-600" />
                      <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Recommended Action</p>
                      <span className="ml-auto text-[11px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium capitalize">
                        {topSuggestion.suggestionType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="p-5">
                      <p className="text-sm font-semibold text-amber-900">{topSuggestion.title}</p>
                      <p className="text-sm text-amber-800 mt-1 leading-relaxed">{topSuggestion.body}</p>
                      {topSuggestion.draftMessage && (
                        <div className="mt-3 bg-white rounded-lg p-4 border border-amber-100">
                          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1.5">Draft Message</p>
                          <p className="text-sm text-gray-700 leading-relaxed">"{topSuggestion.draftMessage}"</p>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <Link href="/proactive"
                          className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-1 font-medium">
                          View all in Proactive Queue <ChevronRight size={11} />
                        </Link>
                        {contact.proactiveSuggestions.length > 1 && (
                          <span className="text-[11px] text-amber-500">
                            +{contact.proactiveSuggestions.length - 1} more suggestion{contact.proactiveSuggestions.length > 2 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. TASKS */}
                {token && (
                  <SectionCard title="Tasks" icon={<CheckSquare size={14} />}
                    action={
                      <span className="text-[10px] text-gray-400">track follow-ups</span>
                    }>
                    <TasksPanel contactId={id} token={token} />
                  </SectionCard>
                )}

                {/* 5. IMPORTANT CONTEXT */}
                {token && (
                  <SectionCard title="Important Context" icon={<Pin size={14} />}
                    action={<span className="text-[10px] text-amber-500 font-medium">injected into AI</span>}>
                    <ContextPinsPanel contactId={id} token={token} />
                  </SectionCard>
                )}

                {/* 6. BUYING SIGNALS */}
                {buyingSignals.length > 0 && (
                  <SectionCard title="Buying Signals" icon={<Zap size={14} />} accent>
                    <div className="space-y-3">
                      {buyingSignals.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                          <Zap size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 font-medium leading-snug">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-500 mt-1 italic">"{insight.supportingText}"</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">{timeAgo(insight.createdAt)}</p>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
                            insight.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {Math.round(insight.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* 7. UPCOMING EVENTS */}
                {contact.upcomingEvents.length > 0 && (
                  <SectionCard title="Upcoming Events" icon={<Calendar size={14} />} accent>
                    <div className="space-y-0">
                      {contact.upcomingEvents.map((event, i) => (
                        <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                            {EVENT_ICONS[event.eventType] ?? <Calendar size={13} className="text-indigo-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
                            <p className="text-xs text-gray-400 capitalize">{event.eventType.replace(/_/g, ' ')}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-indigo-600">{daysUntil(event.eventDate)}</p>
                            <p className="text-[10px] text-gray-400">{formatEventDate(event.eventDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* 8. AI MEMORY PREVIEW */}
                {contact.insights.length > 0 && (
                  <SectionCard title="AI Memory" icon={<Brain size={14} />} accent>
                    <div className="space-y-3">
                      {contact.insights.slice(0, 6).map((insight, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                            insight.confidence >= 0.8 ? 'bg-indigo-500' : insight.confidence >= 0.5 ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-indigo-600 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(insight.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-snug mt-0.5">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {contact.insights.length > 6 && (
                        <button onClick={() => setActiveTab('intelligence')}
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1 font-medium">
                          View all {contact.insights.length} insights <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  </SectionCard>
                )}

                {/* 9. CONTACT INFORMATION */}
                <SectionCard title="Contact Information" icon={<User size={14} />}>
                  <InfoRow icon={<Phone size={14} />}    label="Phone"    value={formatPhone(contact.phoneNumber)} href={contact.phoneNumber ? `tel:${formatPhone(contact.phoneNumber)}` : undefined} />
                  <InfoRow icon={<Mail size={14} />}     label="Email"    value={contact.email}       href={contact.email ? `mailto:${contact.email}` : undefined} />
                  <InfoRow icon={<Building2 size={14} />}label="Company"  value={contact.company} />
                  <InfoRow icon={<Briefcase size={14} />}label="Job Title"value={contact.jobTitle} />
                  <InfoRow icon={<Tag size={14} />}      label="Industry" value={contact.industry} />
                  <InfoRow icon={<Globe size={14} />}    label="Website"  value={contact.website}     href={contact.website ?? undefined} />
                  <InfoRow icon={<Activity size={14} />} label="Source"   value={contact.source !== 'whatsapp' ? contact.source : null} />
                  <InfoRow icon={<Clock size={14} />}    label="Added"    value={formatDate(contact.createdAt)} />
                  {!contact.phoneNumber && !contact.email && !contact.company && (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-400">No additional info yet.</p>
                      <button onClick={() => setShowEdit(true)} className="text-xs text-indigo-600 hover:underline mt-1">
                        Add details →
                      </button>
                    </div>
                  )}
                </SectionCard>

                {/* 10. NOTES */}
                {contact.notes && (
                  <SectionCard title="Notes" icon={<Lightbulb size={14} />}>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
                  </SectionCard>
                )}
              </>
            )}

            {/* ══ AI INTELLIGENCE ══ */}
            {activeTab === 'intelligence' && (
              <>
                {contact.profile && (
                  <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-violet-50 rounded-xl border border-indigo-100 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain size={16} className="text-indigo-600" />
                      <p className="text-sm font-semibold text-indigo-900">Full AI Profile</p>
                      {contact.profile.updatedAt && (
                        <span className="ml-auto text-[10px] text-indigo-400">Updated {timeAgo(contact.profile.updatedAt)}</span>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Personality Summary</p>
                        <p className="text-sm text-indigo-900 leading-relaxed">{contact.profile.personalitySummary}</p>
                      </div>
                      {contact.profile.communicationStyle && (
                        <div>
                          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Communication Style</p>
                          <p className="text-sm text-indigo-800 leading-relaxed">{contact.profile.communicationStyle}</p>
                        </div>
                      )}
                      {contact.profile.emotionalPatterns && (
                        <div>
                          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Emotional Patterns</p>
                          <p className="text-sm text-indigo-800 leading-relaxed">{contact.profile.emotionalPatterns}</p>
                        </div>
                      )}
                      {contact.profile.knownTriggers && (
                        <div>
                          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Known Triggers</p>
                          <p className="text-sm text-indigo-800 leading-relaxed">{contact.profile.knownTriggers}</p>
                        </div>
                      )}
                      {contact.profile.currentLifeContext && (
                        <div>
                          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Current Life Context</p>
                          <p className="text-sm text-indigo-800 leading-relaxed">{contact.profile.currentLifeContext}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {contact.profile.moodBaseline && (
                          <span className={`inline-flex items-center gap-1 text-xs border px-2.5 py-1 rounded-full font-medium ${moodColor(contact.profile.moodBaseline)}`}>
                            <Heart size={10} /> {contact.profile.moodBaseline} mood
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {buyingSignals.length > 0 && (
                  <SectionCard title="Buying Signals & Opportunities" icon={<Zap size={14} />} accent>
                    <div className="space-y-3">
                      {buyingSignals.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                          <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug font-medium">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-500 mt-1 italic">"{insight.supportingText}"</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">{timeAgo(insight.createdAt)}</p>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
                            insight.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {Math.round(insight.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {personalityInsights.length > 0 && (
                  <SectionCard title="Personality & Behaviour" icon={<User size={14} />} accent>
                    <div className="space-y-3">
                      {personalityInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            insight.confidence >= 0.8 ? 'bg-indigo-500' : insight.confidence >= 0.5 ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-indigo-600 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-gray-700 leading-snug mt-0.5">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(insight.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {otherInsights.length > 0 && (
                  <SectionCard title={`All Insights (${contact.insights.length})`} icon={<Sparkles size={14} />} accent>
                    <div className="space-y-3">
                      {otherInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            insight.confidence >= 0.8 ? 'bg-indigo-500' : insight.confidence >= 0.5 ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-indigo-600 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(insight.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-snug mt-0.5">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {contact.insights.length === 0 && !contact.profile && (
                  <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                    <Sparkles size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No intelligence data yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Insights appear as Zuri analyses conversations with {contact.name}.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ══ HEALTH HISTORY ══ */}
            {activeTab === 'timeline' && (
              <SectionCard title="Relationship Health History" icon={<Activity size={14} />}>
                {contact.healthHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No health history recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {contact.healthHistory.map((h, i) => {
                      const delta = h.score - (h.previousScore ?? h.score)
                      const up    = delta > 0
                      return (
                        <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            h.score >= 70 ? 'bg-green-100 text-green-700' : h.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {h.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {up ? <ArrowUpRight size={12} /> : delta < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
                                {up ? '+' : ''}{delta}
                              </span>
                              <span className="text-xs text-gray-400">{formatDate(h.recordedAt)}</span>
                            </div>
                            {h.changeReason && (
                              <p className="text-sm text-gray-700 mt-0.5 leading-snug">{h.changeReason}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>
            )}

            {/* ══ MESSAGES ══ */}
            {activeTab === 'messages' && token && (
              <MessagesTab contactId={id} token={token} />
            )}

          </div>
        </div>
      </div>

      {showEdit && token && (
        <EditSlideOver
          contact={contact}
          token={token}
          onClose={() => setShowEdit(false)}
          onSaved={refetch}
        />
      )}
    </>
  )
}
