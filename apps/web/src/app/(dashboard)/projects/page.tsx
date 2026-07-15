'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FolderKanban, Plus, Loader2, ChevronRight, ListChecks, FileWarning, Receipt,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, EmptyState, Input, SkeletonCard, useToast } from '@/components/ui'

// Business OS Phase F — lightweight project management (docs/BUSINESS_OS_PLAN.md
// §11). Deliberately mirrors /business's hero -> filter -> list layout so
// Studio's ERP surfaces stay visually consistent; this is not a dedicated
// project-management product, just enough structure to track fulfillment
// work tied to a deal/contact.

interface ProjectSummary {
  id: string
  contactId: string | null
  contactName: string | null
  dealId: string | null
  dealTitle: string | null
  title: string
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'
  startDate: string | null
  dueDate: string | null
  taskCount: number
  doneTaskCount: number
  overdueTaskCount: number
  unpaidInvoiceCount: number
  pendingQuotationCount: number
  createdAt: string
  updatedAt: string
}

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'info',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'default',
}

export default function ProjectsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContactId, setNewContactId] = useState('')
  const [newDueDate, setNewDueDate] = useState('')

  const loadProjects = () => {
    if (!token) return
    setLoading(true)
    const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    apiClient<{ projects: ProjectSummary[] }>(`/api/projects${query}`, { token })
      .then(data => { setProjects(data.projects); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(loadProjects, [token, statusFilter])

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: Contact[] }>('/api/contacts', { token }).then(d => setContacts(d.contacts)).catch(() => {})
  }, [token])

  const stats = useMemo(() => ({
    active: projects.filter(p => p.status === 'active').length,
    overdueTasks: projects.reduce((sum, p) => sum + p.overdueTaskCount, 0),
    behind: projects.filter(p => p.status === 'active' && p.dueDate && new Date(p.dueDate) < new Date()).length,
  }), [projects])

  const createProject = async () => {
    if (!token || !newTitle.trim()) return
    setCreating(true)
    try {
      const data = await apiClient<{ project: ProjectSummary }>('/api/projects', {
        method: 'POST', token,
        body: JSON.stringify({
          title: newTitle.trim(),
          contactId: newContactId || null,
          dueDate: newDueDate || null,
        }),
      })
      addToast({ variant: 'success', title: 'Project created' })
      setShowNew(false)
      setNewTitle('')
      setNewContactId('')
      setNewDueDate('')
      loadProjects()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create project', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6 pb-0">
        <div className="relative rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-5 md:p-6 max-w-5xl mx-auto w-full">
          <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
          </div>
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                AI Project Manager
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950">Projects</h1>
            <p className="text-sm text-gray-600 max-w-xl mt-1 leading-relaxed">
              Track fulfillment work tied to a deal or contact — tasks, due dates, and linked invoices/quotations
              in one place. Overdue tasks and behind-schedule projects also surface in your AI Daily Brief.
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.active}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">active</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.overdueTasks}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">overdue tasks</span>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-gray-100">
                <span className="text-lg font-black text-gray-950 tabular-nums">{stats.behind}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-gray-500">behind schedule</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
              <button
                onClick={() => setShowNew(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-500 active:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />New Project
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 pt-4">
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="w-10 h-10 text-indigo-500" />}
            title="No projects yet"
            description="Create a project to track tasks and fulfillment work tied to a deal or contact."
            action={
              <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />New Project
              </button>
            }
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {projects.map(p => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 px-4 py-3.5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  {p.contactId ? (
                    <Avatar name={p.contactName ?? '?'} size="sm" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><FolderKanban className="w-4 h-4 text-gray-400" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{p.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {p.contactName ?? 'No contact'}
                      {p.dueDate && ` · due ${new Date(p.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[p.status] ?? 'default'}>{p.status.replace('_', ' ')}</Badge>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>

                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                    {p.doneTaskCount}/{p.taskCount} tasks
                  </span>
                  {p.overdueTaskCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <FileWarning className="w-3.5 h-3.5" />
                      {p.overdueTaskCount} overdue
                    </span>
                  )}
                  {p.unpaidInvoiceCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                      <Receipt className="w-3.5 h-3.5" />
                      {p.unpaidInvoiceCount} unpaid invoice{p.unpaidInvoiceCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {p.pendingQuotationCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                      {p.pendingQuotationCount} pending quotation{p.pendingQuotationCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New Project</h2>
            <div className="space-y-4">
              <Input label="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Office fit-out — Acme Ltd" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact (optional)</label>
                <select
                  value={newContactId}
                  onChange={e => setNewContactId(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">No contact</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Input label="Due date (optional)" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={creating || !newTitle.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
