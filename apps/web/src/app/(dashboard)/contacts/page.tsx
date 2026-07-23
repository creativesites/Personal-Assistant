'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Users,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Download,
  Upload,
  UserPlus,
  MessageSquare,
  MoreHorizontal,
  CheckSquare,
  Square,
  Tag,
  Trash2,
  X,
  ChevronRight,
  Star,
  Zap,
  Clock,
  Heart,
  Brain,
  Sparkles,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, Badge, EmptyState, HealthBar, SkeletonCard, useToast } from '@/components/ui'

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  jobTitle?: string
  industry?: string
  notes?: string
  customerStatus?: string
  pipelineStage?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  tags: string[]
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
    lastInteractionAt: string | null
  }
  profile: { personalitySummary: string; moodBaseline: string } | null
  leadScore: number
  insightCount: number
  pendingActions: number
}

function calcCompleteness(c: Contact): number {
  const fields = [!!c.phone, !!c.email, !!c.company, !!c.jobTitle, !!c.industry, !!c.notes, c.tags.length > 0, !!c.profile?.personalitySummary]
  return Math.round((fields.filter(Boolean).length / fields.length) * 100)
}

function CompletenessChip({ pct }: { pct: number }) {
  const cls = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-1.5" title={`Profile ${pct}% complete`}>
      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 font-medium tabular-nums">{pct}%</span>
    </div>
  )
}

type SortKey = 'health' | 'recent' | 'name' | 'lead'
type ViewMode = 'table' | 'grid' | 'kanban'
type StatusFilter = 'all' | 'vip' | 'key' | 'customer' | 'lead' | 'partner' | 'attention'
type HealthFilter = 'all' | 'healthy' | 'moderate' | 'at_risk'
type ActivityFilter = 'all' | 'today' | 'week' | 'month' | 'dormant'
type LeadFilter = 'all' | 'hot' | 'warm' | 'cold'
type AiFilter = 'all' | 'profiled' | 'with_insights' | 'has_action'

const KANBAN_STAGES = [
  { id: 'lead',       label: 'New Lead',     color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { id: 'contacted',  label: 'Contacted',    color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'qualified',  label: 'Qualified',    color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
  { id: 'proposal',   label: 'Proposal Sent',color: 'bg-purple-50 border-purple-200 text-purple-800' },
  { id: 'customer',   label: 'Won Customer', color: 'bg-green-50 border-green-200 text-green-800' },
  { id: 'lost',       label: 'Dormant / Lost',color: 'bg-gray-50 border-gray-200 text-gray-700' },
] as const

function getContactKanbanStage(c: Contact): string {
  const ps = (c.pipelineStage || '').toLowerCase()
  const cs = (c.customerStatus || c.relationship.type || '').toLowerCase()

  if (cs === 'customer' || ps === 'won' || ps === 'customer') return 'customer'
  if (ps === 'proposal' || ps === 'quote' || ps === 'quotation') return 'proposal'
  if (ps === 'qualified') return 'qualified'
  if (ps === 'contacted') return 'contacted'
  if (ps === 'lost' || ps === 'dormant' || cs === 'dormant') return 'lost'
  return 'lead'
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
  return `${Math.floor(diff / 365)}y ago`
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone
  return phone.startsWith('+') ? phone : `+${digits}`
}

function getActivityBucket(ts: string | null): ActivityFilter {
  if (!ts) return 'dormant'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff <= 7) return 'week'
  if (diff <= 30) return 'month'
  return 'dormant'
}

const TREND_CONFIG = {
  improving: { Icon: TrendingUp,   cls: 'text-green-600', label: 'Improving' },
  stable:    { Icon: Minus,        cls: 'text-gray-400',  label: 'Stable'    },
  declining: { Icon: TrendingDown, cls: 'text-red-500',   label: 'Declining' },
}

function statusBadge(contact: Contact) {
  if (contact.relationship.importanceTier === 1) return { label: 'VIP', cls: 'bg-purple-100 text-purple-700 border border-purple-200' }
  if (contact.relationship.importanceTier === 2) return { label: 'Key', cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' }
  const t = contact.relationship.type
  if (t === 'customer') return { label: 'Customer', cls: 'bg-green-100 text-green-700 border border-green-200' }
  if (t === 'lead' || t === 'prospect') return { label: 'Lead', cls: 'bg-amber-100 text-amber-700 border border-amber-200' }
  if (t === 'partner') return { label: 'Partner', cls: 'bg-blue-100 text-blue-700 border border-blue-200' }
  if (t === 'supplier' || t === 'vendor') return { label: 'Vendor', cls: 'bg-gray-100 text-gray-600 border border-gray-200' }
  return { label: 'Contact', cls: 'bg-gray-50 text-gray-500 border border-gray-200' }
}

function leadBadgeCls(score: number) {
  if (score >= 70) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 40) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-gray-50 text-gray-500 border-gray-200'
}

// ─── Add Contact modal ────────────────────────────────────────────────────────

function AddContactModal({ token, onClose, onCreated }: {
  token: string; onClose: () => void; onCreated: () => void
}) {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phoneNumber: '', email: '', company: '', customerStatus: 'contact' })
  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))

  const create = async () => {
    if (!form.name && !form.phoneNumber) {
      addToast({ variant: 'error', title: 'Name or phone number required' }); return
    }
    setSaving(true)
    try {
      await apiClient('/api/contacts', { method: 'POST', token, body: JSON.stringify(form) })
      addToast({ variant: 'success', title: 'Contact created' })
      onCreated(); onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to create contact' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Name</span>
            <input value={form.name} onChange={set('name')} placeholder="Contact name"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Phone Number</span>
            <input type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+260971234567"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Email</span>
            <input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Company</span>
            <input value={form.company} onChange={set('company')} placeholder="Company name"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Status</span>
            <select value={form.customerStatus} onChange={set('customerStatus')}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {['contact','lead','prospect','customer','vip','supplier','employee','partner','personal'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={create} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function FilterRow({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function AddTagModal({ token, selectedIds, onClose, onDone }: {
  token: string; selectedIds: string[]; onClose: () => void; onDone: () => void
}) {
  const { addToast } = useToast()
  const [tag, setTag] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    setSaving(true)
    try {
      await Promise.all(selectedIds.map(id =>
        apiClient(`/api/contacts/${id}/tags`, { method: 'POST', token, body: JSON.stringify({ tag: trimmed }) })
      ))
      addToast({ variant: 'success', title: `Tag added to ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''}` })
      onDone()
      onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add tag' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-white rounded-xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Add tag to {selectedIds.length} contact{selectedIds.length > 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={tag}
            onChange={e => setTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="e.g. premium, vip, follow-up"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={add}
            disabled={!tag.trim() || saving}
            className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportCsvModal({ token, onClose, onImported }: {
  token: string; onClose: () => void; onImported: () => void
}) {
  const { addToast } = useToast()
  const [csvText, setCsvText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleImport = async () => {
    if (!csvText.trim()) return
    setLoading(true)

    try {
      const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) {
        addToast({ variant: 'error', title: 'CSV must contain a header and at least one data row' })
        setLoading(false)
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase())

      const findIdx = (keywords: string[]) =>
        headers.findIndex(h => keywords.some(k => h.includes(k)))

      const nameIdx = findIdx(['name', 'contact'])
      const phoneIdx = findIdx(['phone', 'mobile', 'cell', 'tel', 'whatsapp'])
      const emailIdx = findIdx(['email', 'mail'])
      const companyIdx = findIdx(['company', 'organization', 'business'])
      const titleIdx = findIdx(['title', 'job', 'role'])
      const industryIdx = findIdx(['industry', 'sector'])
      const statusIdx = findIdx(['status', 'tier', 'type'])
      const stageIdx = findIdx(['stage', 'pipeline', 'funnel'])
      const tagIdx = findIdx(['tag', 'tags', 'labels'])

      const contactsToImport = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^["']|["']$/g, '').trim()) || line.split(',').map(c => c.trim())

        return {
          name: nameIdx >= 0 ? cols[nameIdx] || '' : cols[0] || '',
          phoneNumber: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
          email: emailIdx >= 0 ? cols[emailIdx] : undefined,
          company: companyIdx >= 0 ? cols[companyIdx] : undefined,
          jobTitle: titleIdx >= 0 ? cols[titleIdx] : undefined,
          industry: industryIdx >= 0 ? cols[industryIdx] : undefined,
          customerStatus: statusIdx >= 0 ? cols[statusIdx] : 'contact',
          pipelineStage: stageIdx >= 0 ? cols[stageIdx] : 'lead',
          tags: tagIdx >= 0 && cols[tagIdx] ? cols[tagIdx].split(';').map(t => t.trim()) : [],
        }
      }).filter(c => c.name || c.phoneNumber || c.email)

      if (contactsToImport.length === 0) {
        addToast({ variant: 'error', title: 'No valid rows found in CSV' })
        setLoading(false)
        return
      }

      const res = await apiClient<{ ok: boolean; importedCount: number }>('/api/contacts/bulk-import', {
        method: 'POST',
        token,
        body: JSON.stringify({ contacts: contactsToImport })
      })

      addToast({ variant: 'success', title: `Successfully imported ${res.importedCount} contacts` })
      onImported()
      onClose()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message || 'Failed to import CSV' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Upload size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Import Contacts CSV</h3>
              <p className="text-xs text-gray-500">Paste raw CSV or drag & drop contact rows</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700 block mb-1">
              CSV Content (Header row e.g. Name, Phone, Email, Company, Stage, Status, Tags)
            </span>
            <textarea
              rows={8}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`Name, Phone, Email, Company, Stage, Status\nJohn Doe, +260971234567, john@acme.com, Acme Corp, Qualified, Customer\nJane Smith, +260977654321, jane@tech.co, Tech Ltd, Proposal, Lead`}
              className="w-full text-xs font-mono border border-gray-200 rounded-xl p-3 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-white">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !csvText.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Importing...' : 'Import Contacts'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'hybrid'

  const { addToast } = useToast()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all')
  const [aiFilter, setAiFilter] = useState<AiFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showAddTag, setShowAddTag] = useState(false)

  const { data, loading, error, refetch } = useApi<{ contacts: Contact[] }>('/api/contacts', token)
  const contacts = data?.contacts ?? []

  // Compute filter counts
  const statusCounts = useMemo(() => ({
    all: contacts.length,
    vip: contacts.filter(c => c.relationship.importanceTier === 1).length,
    key: contacts.filter(c => c.relationship.importanceTier === 2).length,
    customer: contacts.filter(c => c.relationship.type === 'customer').length,
    lead: contacts.filter(c => c.relationship.type === 'lead' || c.relationship.type === 'prospect').length,
    partner: contacts.filter(c => c.relationship.type === 'partner').length,
    attention: contacts.filter(c => c.relationship.healthScore < 50).length,
  }), [contacts])

  const healthCounts = useMemo(() => ({
    all: contacts.length,
    healthy: contacts.filter(c => c.relationship.healthScore >= 70).length,
    moderate: contacts.filter(c => c.relationship.healthScore >= 40 && c.relationship.healthScore < 70).length,
    at_risk: contacts.filter(c => c.relationship.healthScore < 40).length,
  }), [contacts])

  const activityCounts = useMemo(() => ({
    all: contacts.length,
    today: contacts.filter(c => getActivityBucket(c.lastMessageAt) === 'today').length,
    week: contacts.filter(c => ['today', 'week'].includes(getActivityBucket(c.lastMessageAt))).length,
    month: contacts.filter(c => getActivityBucket(c.lastMessageAt) === 'month').length,
    dormant: contacts.filter(c => getActivityBucket(c.lastMessageAt) === 'dormant').length,
  }), [contacts])

  const processed = useMemo(() => {
    let result = contacts.filter(c => {
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !(c.phone ?? '').includes(q)) return false
      }
      // status filter
      if (statusFilter === 'vip' && c.relationship.importanceTier !== 1) return false
      if (statusFilter === 'key' && c.relationship.importanceTier !== 2) return false
      if (statusFilter === 'customer' && c.relationship.type !== 'customer') return false
      if (statusFilter === 'lead' && c.relationship.type !== 'lead' && c.relationship.type !== 'prospect') return false
      if (statusFilter === 'partner' && c.relationship.type !== 'partner') return false
      if (statusFilter === 'attention' && c.relationship.healthScore >= 50) return false
      // health filter
      if (healthFilter === 'healthy' && c.relationship.healthScore < 70) return false
      if (healthFilter === 'moderate' && (c.relationship.healthScore < 40 || c.relationship.healthScore >= 70)) return false
      if (healthFilter === 'at_risk' && c.relationship.healthScore >= 40) return false
      // activity filter
      const bucket = getActivityBucket(c.lastMessageAt)
      if (activityFilter === 'today' && bucket !== 'today') return false
      if (activityFilter === 'week' && !['today', 'week'].includes(bucket)) return false
      if (activityFilter === 'month' && bucket !== 'month') return false
      if (activityFilter === 'dormant' && bucket !== 'dormant') return false
      // lead filter (business/hybrid only)
      if (mode !== 'personal') {
        if (leadFilter === 'hot' && (c.leadScore ?? 0) < 70) return false
        if (leadFilter === 'warm' && ((c.leadScore ?? 0) < 40 || (c.leadScore ?? 0) >= 70)) return false
        if (leadFilter === 'cold' && (c.leadScore ?? 0) >= 40) return false
      }
      // AI filter
      if (aiFilter === 'profiled' && !c.profile?.personalitySummary) return false
      if (aiFilter === 'with_insights' && (c.insightCount ?? 0) === 0) return false
      if (aiFilter === 'has_action' && (c.pendingActions ?? 0) === 0) return false
      return true
    })
    return [...result].sort((a, b) => {
      if (sort === 'name')   return a.name.localeCompare(b.name)
      if (sort === 'health') return b.relationship.healthScore - a.relationship.healthScore
      if (sort === 'lead')   return (b.leadScore ?? 0) - (a.leadScore ?? 0)
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }, [contacts, search, statusFilter, healthFilter, activityFilter, leadFilter, aiFilter, sort, mode])

  const allSelected = processed.length > 0 && processed.every(c => selected.has(c.id))
  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const s = new Set(prev); processed.forEach(c => s.delete(c.id)); return s })
    } else {
      setSelected(prev => { const s = new Set(prev); processed.forEach(c => s.add(c.id)); return s })
    }
  }
  const toggleOne = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const clearSelection = () => setSelected(new Set())

  const archiveSelected = async () => {
    if (!token || selected.size === 0) return
    const ids = Array.from(selected)
    try {
      await Promise.all(ids.map(contactId =>
        apiClient(`/api/contacts/${contactId}`, { method: 'DELETE', token })
      ))
      addToast({ variant: 'success', title: `${ids.length} contact${ids.length > 1 ? 's' : ''} archived` })
    } catch {
      addToast({ variant: 'error', title: 'Some contacts could not be archived' })
    }
    clearSelection()
    refetch()
  }

  const Sidebar = () => (
    <aside className="w-full md:w-56 flex-shrink-0 space-y-1">
      <FilterSection title="Status">
        <FilterRow active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={statusCounts.all}>All contacts</FilterRow>
        {statusCounts.vip > 0 && <FilterRow active={statusFilter === 'vip'} onClick={() => setStatusFilter('vip')} count={statusCounts.vip}><span className="flex items-center gap-1.5"><Star size={12} className="text-yellow-500" />VIP</span></FilterRow>}
        {statusCounts.key > 0 && <FilterRow active={statusFilter === 'key'} onClick={() => setStatusFilter('key')} count={statusCounts.key}>Key contacts</FilterRow>}
        {statusCounts.customer > 0 && <FilterRow active={statusFilter === 'customer'} onClick={() => setStatusFilter('customer')} count={statusCounts.customer}>Customers</FilterRow>}
        {statusCounts.lead > 0 && <FilterRow active={statusFilter === 'lead'} onClick={() => setStatusFilter('lead')} count={statusCounts.lead}><span className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500" />Leads</span></FilterRow>}
        {statusCounts.partner > 0 && <FilterRow active={statusFilter === 'partner'} onClick={() => setStatusFilter('partner')} count={statusCounts.partner}>Partners</FilterRow>}
        {statusCounts.attention > 0 && <FilterRow active={statusFilter === 'attention'} onClick={() => setStatusFilter('attention')} count={statusCounts.attention}><span className="flex items-center gap-1.5"><AlertCircle size={12} className="text-red-500" />Needs attention</span></FilterRow>}
      </FilterSection>

      <FilterSection title="Relationship Health">
        <FilterRow active={healthFilter === 'all'} onClick={() => setHealthFilter('all')}>All</FilterRow>
        <FilterRow active={healthFilter === 'healthy'} onClick={() => setHealthFilter('healthy')} count={healthCounts.healthy}><span className="flex items-center gap-1.5"><Heart size={12} className="text-green-500" />Healthy (70+)</span></FilterRow>
        <FilterRow active={healthFilter === 'moderate'} onClick={() => setHealthFilter('moderate')} count={healthCounts.moderate}>Moderate (40–69)</FilterRow>
        <FilterRow active={healthFilter === 'at_risk'} onClick={() => setHealthFilter('at_risk')} count={healthCounts.at_risk}><span className="flex items-center gap-1.5"><AlertCircle size={12} className="text-red-400" />At risk (&lt;40)</span></FilterRow>
      </FilterSection>

      <FilterSection title="Last Active">
        <FilterRow active={activityFilter === 'all'} onClick={() => setActivityFilter('all')}>All time</FilterRow>
        <FilterRow active={activityFilter === 'today'} onClick={() => setActivityFilter('today')} count={activityCounts.today}>Today</FilterRow>
        <FilterRow active={activityFilter === 'week'} onClick={() => setActivityFilter('week')} count={activityCounts.week}>This week</FilterRow>
        <FilterRow active={activityFilter === 'month'} onClick={() => setActivityFilter('month')} count={activityCounts.month}>This month</FilterRow>
        <FilterRow active={activityFilter === 'dormant'} onClick={() => setActivityFilter('dormant')} count={activityCounts.dormant}><span className="flex items-center gap-1.5"><Clock size={12} className="text-gray-400" />Dormant</span></FilterRow>
      </FilterSection>

      {mode !== 'personal' && (
        <FilterSection title="Lead Score">
          <FilterRow active={leadFilter === 'all'} onClick={() => setLeadFilter('all')}>All scores</FilterRow>
          <FilterRow active={leadFilter === 'hot'} onClick={() => setLeadFilter('hot')}><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Hot (70+)</span></FilterRow>
          <FilterRow active={leadFilter === 'warm'} onClick={() => setLeadFilter('warm')}><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Warm (40–69)</span></FilterRow>
          <FilterRow active={leadFilter === 'cold'} onClick={() => setLeadFilter('cold')}><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Cold (&lt;40)</span></FilterRow>
        </FilterSection>
      )}

      <FilterSection title="AI Intelligence">
        <FilterRow active={aiFilter === 'all'} onClick={() => setAiFilter('all')}>All</FilterRow>
        <FilterRow active={aiFilter === 'profiled'} onClick={() => setAiFilter('profiled')} count={contacts.filter(c => !!c.profile?.personalitySummary).length}>
          <span className="flex items-center gap-1.5"><Brain size={12} className="text-indigo-500" />AI profiled</span>
        </FilterRow>
        <FilterRow active={aiFilter === 'with_insights'} onClick={() => setAiFilter('with_insights')} count={contacts.filter(c => (c.insightCount ?? 0) > 0).length}>
          <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-purple-500" />Has insights</span>
        </FilterRow>
        <FilterRow active={aiFilter === 'has_action'} onClick={() => setAiFilter('has_action')} count={contacts.filter(c => (c.pendingActions ?? 0) > 0).length}>
          <span className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500" />Action suggested</span>
        </FilterRow>
      </FilterSection>
    </aside>
  )

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <div className="h-7 w-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  const [showImportCsv, setShowImportCsv] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const handleBulkStageChange = async (newStage: string) => {
    if (!token || selected.size === 0 || !newStage) return
    setBulkUpdating(true)
    try {
      await apiClient('/api/contacts/bulk', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          ids: Array.from(selected),
          updates: { pipelineStage: newStage }
        })
      })
      addToast({ variant: 'success', title: `Updated pipeline stage for ${selected.size} contacts` })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update stage' })
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleBulkStatusChange = async (newStatus: string) => {
    if (!token || selected.size === 0 || !newStatus) return
    setBulkUpdating(true)
    try {
      await apiClient('/api/contacts/bulk', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          ids: Array.from(selected),
          updates: { customerStatus: newStatus }
        })
      })
      addToast({ variant: 'success', title: `Updated status for ${selected.size} contacts` })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update status' })
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleSingleStageChange = async (contactId: string, newStage: string) => {
    if (!token) return
    try {
      await apiClient(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ pipelineStage: newStage })
      })
      addToast({ variant: 'success', title: 'Pipeline stage updated' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update stage' })
    }
  }

  const exportContactsCsv = () => {
    if (processed.length === 0) return
    const headers = ['Name', 'Phone', 'Email', 'Company', 'Job Title', 'Industry', 'Status', 'Pipeline Stage', 'Health Score', 'Lead Score', 'Tags']
    const rows = processed.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.company || '').replace(/"/g, '""')}"`,
      `"${(c.jobTitle || '').replace(/"/g, '""')}"`,
      `"${(c.industry || '').replace(/"/g, '""')}"`,
      `"${c.customerStatus || c.relationship.type || ''}"`,
      `"${c.pipelineStage || ''}"`,
      c.relationship.healthScore ?? 70,
      c.leadScore ?? 0,
      `"${(c.tags || []).join(';')}"`
    ].join(','))

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `zuri_crm_contacts_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contacts & CRM Roster</h1>
            <p className="text-xs text-gray-500 mt-0.5">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} in workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportCsv(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload size={14} /> Import CSV
            </button>
            <button
              onClick={exportContactsCsv}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => setShowAddContact(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <UserPlus size={14} /> Add Contact
            </button>
          </div>
        </div>
      </div>

      {/* Search + toolbar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search contacts, phone, company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
          />
        </div>
        <div className="relative flex-shrink-0 hidden sm:block">
          <SlidersHorizontal size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
          >
            <option value="recent">Most recent</option>
            <option value="health">Relationship health</option>
            <option value="name">Name A–Z</option>
            {mode !== 'personal' && <option value="lead">Lead score</option>}
          </select>
        </div>
        <button
          onClick={() => setShowMobileFilters(true)}
          className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal size={14} /> Filters
        </button>
        <div className="flex-shrink-0 flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            title="Table View"
            className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            title="Grid View"
            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            title="Kanban Pipeline Board"
            className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CheckSquare size={15} />
          </button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex-shrink-0 bg-indigo-600 px-4 md:px-6 py-2.5 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs text-white font-medium whitespace-nowrap">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <select
              disabled={bulkUpdating}
              onChange={e => handleBulkStageChange(e.target.value)}
              defaultValue=""
              className="text-xs bg-indigo-700 text-white border border-indigo-500 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Move Stage...</option>
              <option value="lead">New Lead</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal Sent</option>
              <option value="customer">Won Customer</option>
              <option value="lost">Dormant / Lost</option>
            </select>

            <select
              disabled={bulkUpdating}
              onChange={e => handleBulkStatusChange(e.target.value)}
              defaultValue=""
              className="text-xs bg-indigo-700 text-white border border-indigo-500 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Set Status...</option>
              <option value="customer">Customer</option>
              <option value="lead">Lead</option>
              <option value="vip">VIP</option>
              <option value="partner">Partner</option>
              <option value="vendor">Vendor</option>
            </select>

            <button
              onClick={() => setShowAddTag(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white border border-white/30 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Tag size={12} /> Tag
            </button>
            <button
              onClick={archiveSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white border border-white/30 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Trash2 size={12} /> Archive
            </button>
            <button onClick={clearSelection} className="ml-1 text-white/70 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop only */}
        <div className="hidden md:block w-56 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto p-4">
          <Sidebar />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-8">
              <EmptyState icon={<AlertCircle size={36} className="text-gray-400" />} title="Couldn't load contacts" description="Make sure the API server is running." />
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Users size={36} className="text-gray-400" />}
                title="No contacts yet"
                description="Connect WhatsApp and start chatting — contacts appear automatically."
                action={
                  <a href="/onboarding" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                    Connect WhatsApp
                  </a>
                }
              />
            </div>
          ) : processed.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Search size={36} className="text-gray-400" />} title="No contacts match" description={search ? `No results for "${search}"` : 'Try adjusting your filters.'} />
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-10 px-4 py-3 text-left">
                      <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600 transition-colors">
                        {allSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Relationship</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">AI</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Profile</th>
                    {mode !== 'personal' && <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>}
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Last active</th>
                    <th className="w-16 px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {processed.map(contact => {
                    const trend = TREND_CONFIG[contact.relationship.healthTrend] ?? TREND_CONFIG.stable
                    const TrendIcon = trend.Icon
                    const badge = statusBadge(contact)
                    const isSelected = selected.has(contact.id)
                    return (
                      <tr
                        key={contact.id}
                        className={`group hover:bg-gray-50/70 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50/40' : 'bg-white'}`}
                        onClick={() => router.push(`/contacts/${contact.id}`)}
                      >
                        <td className="px-4 py-3.5" onClick={e => { e.stopPropagation(); toggleOne(contact.id) }}>
                          <button className="text-gray-300 hover:text-gray-500 group-hover:text-gray-400 transition-colors">
                            {isSelected ? <CheckSquare size={15} className="text-indigo-600" /> : <Square size={15} />}
                          </button>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{contact.name}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {contact.company ?? formatPhone(contact.phone) ?? ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <HealthBar score={contact.relationship.healthScore} size="sm" className="w-16 flex-shrink-0" />
                            <span className="text-xs text-gray-500 font-medium w-7 flex-shrink-0">{contact.relationship.healthScore}</span>
                            <TrendIcon size={12} className={`flex-shrink-0 ${trend.cls}`} />
                          </div>
                        </td>
                        <td className="px-3 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            {contact.profile?.personalitySummary ? (
                              <span title="AI profiled" className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full font-medium">
                                <Brain size={9} />
                                {contact.insightCount > 0 ? contact.insightCount : '✓'}
                              </span>
                            ) : (
                              <span title="No AI profile yet" className="inline-flex items-center gap-1 text-[11px] bg-gray-50 text-gray-400 border border-gray-100 px-1.5 py-0.5 rounded-full">
                                <Brain size={9} /> —
                              </span>
                            )}
                            {contact.pendingActions > 0 && (
                              <span title={`${contact.pendingActions} pending action${contact.pendingActions > 1 ? 's' : ''}`} className="inline-flex items-center gap-0.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                <Zap size={9} /> {contact.pendingActions}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 hidden xl:table-cell">
                          <CompletenessChip pct={calcCompleteness(contact)} />
                        </td>
                        {mode !== 'personal' && (
                          <td className="px-3 py-3.5">
                            {contact.leadScore !== undefined ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${leadBadgeCls(contact.leadScore)}`}>
                                {contact.leadScore}
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3.5">
                          <span className="text-xs text-gray-400">{formatLastSeen(contact.lastMessageAt)}</span>
                        </td>
                        <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => router.push(`/inbox`)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Message"
                            >
                              <MessageSquare size={14} />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {processed.map(contact => {
                const trend = TREND_CONFIG[contact.relationship.healthTrend] ?? TREND_CONFIG.stable
                const TrendIcon = trend.Icon
                const badge = statusBadge(contact)
                return (
                  <button
                    key={contact.id}
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                    className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{contact.name}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium mt-1 ${badge.cls}`}>{badge.label}</span>
                      </div>
                      {mode !== 'personal' && contact.leadScore !== undefined && (
                        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${leadBadgeCls(contact.leadScore)}`}>
                          {contact.leadScore}
                        </span>
                      )}
                    </div>
                    {contact.phone && <p className="text-xs text-gray-400 mb-3 truncate">{formatPhone(contact.phone)}</p>}
                    <HealthBar score={contact.relationship.healthScore} size="sm" className="mb-2" />
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium flex items-center gap-1 ${trend.cls}`}>
                        <TrendIcon size={11} /> {trend.label}
                      </span>
                      <span className="text-xs text-gray-400">{formatLastSeen(contact.lastMessageAt)}</span>
                    </div>
                    {/* AI signals row */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50">
                      {contact.profile?.personalitySummary ? (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full font-medium">
                          <Brain size={9} /> AI {contact.insightCount > 0 ? `· ${contact.insightCount}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-300 px-1.5 py-0.5 rounded-full">
                          <Brain size={9} /> learning…
                        </span>
                      )}
                      {contact.pendingActions > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium ml-auto">
                          <Zap size={9} /> {contact.pendingActions} action{contact.pendingActions > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {/* Completeness bar */}
                    <div className="pt-2">
                      <CompletenessChip pct={calcCompleteness(contact)} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowMobileFilters(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Filters</span>
              <button onClick={() => setShowMobileFilters(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <Sidebar />
            </div>
          </div>
        </div>
      )}

      {/* Add Contact modal */}
      {showAddContact && token && (
        <AddContactModal
          token={token}
          onClose={() => setShowAddContact(false)}
          onCreated={refetch}
        />
      )}

      {/* Import CSV modal */}
      {showImportCsv && token && (
        <ImportCsvModal
          token={token}
          onClose={() => setShowImportCsv(false)}
          onImported={refetch}
        />
      )}

      {/* Add Tag modal */}
      {showAddTag && token && (
        <AddTagModal
          token={token}
          selectedIds={Array.from(selected)}
          onClose={() => setShowAddTag(false)}
          onDone={() => { clearSelection(); refetch() }}
        />
      )}
    </div>
  )
}
