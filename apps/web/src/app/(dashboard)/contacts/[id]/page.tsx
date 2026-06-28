'use client'

import { use, useState } from 'react'
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
  X,
  Check,
  Loader2,
  Calendar,
  Gift,
  Briefcase as BriefcaseIcon,
  Plane,
  PartyPopper,
  Bell,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, useToast } from '@/components/ui'

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

interface EditForm {
  name: string
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, className, accent }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; accent?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${accent ? 'border-indigo-100' : 'border-gray-200'} ${className ?? ''}`}>
      <div className={`flex items-center gap-2 px-5 py-3.5 border-b ${accent ? 'border-indigo-50 bg-indigo-50/30' : 'border-gray-100'}`}>
        {icon && <span className={accent ? 'text-indigo-500' : 'text-gray-400'}>{icon}</span>}
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-indigo-700' : 'text-gray-500'}`}>{title}</p>
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
                <input
                  value={form.name} onChange={set('name')}
                  placeholder={contact.displayName ?? contact.phoneNumber ?? ''}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Status</span>
                <select
                  value={form.customerStatus} onChange={set('customerStatus')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
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
                <input
                  type="email" value={form.email} onChange={set('email')}
                  placeholder="email@example.com"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Website</span>
                <input
                  type="url" value={form.website} onChange={set('website')}
                  placeholder="https://"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Business</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Company</span>
                <input
                  value={form.company} onChange={set('company')}
                  placeholder="Company name"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Job Title</span>
                <input
                  value={form.jobTitle} onChange={set('jobTitle')}
                  placeholder="e.g. Owner, Manager"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Industry</span>
                <input
                  value={form.industry} onChange={set('industry')}
                  placeholder="e.g. Retail, Construction"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Stage</span>
                <select
                  value={form.pipelineStage} onChange={set('pipelineStage')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s || 'None'}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 block mb-1">Lead Score (0–100)</span>
                <input
                  type="number" min={0} max={100}
                  value={form.leadScore} onChange={set('leadScore')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Notes</p>
            <textarea
              value={form.notes} onChange={set('notes')}
              rows={5}
              placeholder="Private notes about this contact…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
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

  const { data: contactData, loading, refetch } = useApi<{ contact: ContactDetail }>(
    `/api/contacts/${id}`,
    token,
  )

  const contact = contactData?.contact

  const tabs: { id: TabId; label: string; show?: boolean }[] = [
    { id: 'overview',     label: 'Overview'                              },
    { id: 'intelligence', label: 'AI Intelligence'                       },
    { id: 'timeline',     label: 'Health History'                        },
    { id: 'messages',     label: 'Messages'                              },
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

  const responseRatio = contact.stats.totalMessages > 0
    ? Math.round((contact.stats.received / contact.stats.totalMessages) * 100)
    : 0

  const buyingSignals      = contact.insights.filter(i => ['buying_signal','purchase_intent','interest','opportunity'].includes(i.key))
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
              <a href={`tel:${contact.phoneNumber}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Phone size={14} /> Call
              </a>
            )}
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
                    <p className="text-sm text-gray-500 mt-0.5">{contact.phoneNumber}</p>
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
                    {/* AI badges in hero */}
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
                      <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        <Tag size={9} />{tag}
                      </span>
                    ))}
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
            {tabs.filter(t => t.show !== false).map(tab => (
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
                {/* 1. AI INTELLIGENCE HUB — always first */}
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
                          <button
                            onClick={() => setActiveTab('intelligence')}
                            className="inline-flex items-center gap-1 text-xs bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full hover:bg-indigo-50 transition-colors"
                          >
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

                      {(contact.profile!.emotionalPatterns || contact.profile!.knownTriggers) && (
                        <div className="mt-3 pt-3 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {contact.profile!.emotionalPatterns && (
                            <div>
                              <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Emotional Patterns</p>
                              <p className="text-xs text-indigo-800 leading-relaxed">{contact.profile!.emotionalPatterns}</p>
                            </div>
                          )}
                          {contact.profile!.knownTriggers && (
                            <div>
                              <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Known Triggers</p>
                              <p className="text-xs text-indigo-800 leading-relaxed">{contact.profile!.knownTriggers}</p>
                            </div>
                          )}
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

                {/* 2. NEXT BEST ACTION — proactive suggestion */}
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
                        <Link
                          href="/proactive"
                          className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-1 font-medium"
                        >
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

                {/* 3. BUYING SIGNALS — if any exist */}
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

                {/* 4. UPCOMING EVENTS — AI-extracted */}
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

                {/* 5. AI MEMORY PREVIEW — top insights */}
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
                        <button
                          onClick={() => setActiveTab('intelligence')}
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1 font-medium"
                        >
                          View all {contact.insights.length} insights <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  </SectionCard>
                )}

                {/* 6. CONTACT INFORMATION */}
                <SectionCard title="Contact Information" icon={<User size={14} />}>
                  <InfoRow icon={<Phone size={14} />}    label="Phone"    value={contact.phoneNumber} href={contact.phoneNumber ? `tel:${contact.phoneNumber}` : undefined} />
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

                {/* 7. NOTES */}
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
                {/* Profile deep-dive */}
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

                {/* Buying signals */}
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

                {/* Personality insights */}
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

                {/* Other insights */}
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
            {activeTab === 'messages' && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Open the conversation in Inbox</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  {contact.stats.totalMessages > 0
                    ? `${contact.stats.totalMessages.toLocaleString()} messages · ${contact.stats.sent.toLocaleString()} sent · ${contact.stats.received.toLocaleString()} received`
                    : 'No messages yet'}
                </p>
                <Link
                  href="/inbox"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <MessageSquare size={14} /> Open Inbox
                </Link>
              </div>
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
