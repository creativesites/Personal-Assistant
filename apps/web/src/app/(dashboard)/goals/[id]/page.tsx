'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Target, Plus, Trash2, Loader2, Link2, Briefcase, FolderKanban,
  Package, User, FileText, X,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, BadgeVariant, SkeletonCard, useToast } from '@/components/ui'

interface GoalDetail {
  id: string
  title: string
  goalType: 'business' | 'personal'
  targetValue: { metric?: string; target?: number; byDate?: string } | null
  status: 'active' | 'achieved' | 'abandoned' | 'paused'
}

interface LinkedEntity {
  linkId: string
  entityType: 'deal' | 'project' | 'product' | 'contact' | 'document'
  entityId: string
  entityName: string | null
}

interface ProgressEntry { id: string; metricValue: Record<string, unknown>; note: string | null; recordedAt: string }
interface GoalEvent { id: string; eventType: string; description: string; createdAt: string }
interface GoalMemory { id: string; sourceType: string; summary: string; createdAt: string }

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'info', achieved: 'success', abandoned: 'default', paused: 'warning',
}

const ENTITY_TYPES: { key: LinkedEntity['entityType']; label: string; icon: typeof Briefcase; endpoint: string; nameKey: string }[] = [
  { key: 'deal', label: 'Deal', icon: Briefcase, endpoint: '/api/deals', nameKey: 'title' },
  { key: 'project', label: 'Project', icon: FolderKanban, endpoint: '/api/projects', nameKey: 'title' },
  { key: 'product', label: 'Product', icon: Package, endpoint: '/api/products', nameKey: 'name' },
  { key: 'contact', label: 'Contact', icon: User, endpoint: '/api/contacts', nameKey: 'name' },
  { key: 'document', label: 'Document', icon: FileText, endpoint: '/api/documents', nameKey: 'title' },
]

const ENTITY_ICON: Record<LinkedEntity['entityType'], typeof Briefcase> = {
  deal: Briefcase, project: FolderKanban, product: Package, contact: User, document: FileText,
}

function LinkEntityModal({ token, onClose, onLinked }: { token: string; onClose: () => void; onLinked: (entityType: string, entityId: string) => void }) {
  const [entityType, setEntityType] = useState<LinkedEntity['entityType']>('deal')
  const [options, setOptions] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    const config = ENTITY_TYPES.find(e => e.key === entityType)!
    setLoading(true)
    setSelectedId('')
    apiClient<any>(config.endpoint, { token })
      .then(data => {
        const list = data[Object.keys(data).find(k => Array.isArray(data[k])) ?? ''] ?? []
        setOptions(list.map((item: any) => ({ id: item.id, name: item[config.nameKey] ?? item.displayName ?? item.title ?? 'Untitled' })))
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [entityType, token])

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Link an entity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-gray-50 p-1.5 mb-4">
          {ENTITY_TYPES.map(e => (
            <button
              key={e.key}
              onClick={() => setEntityType(e.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${entityType === e.key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {e.label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : options.length === 0 ? (
          <p className="text-xs text-gray-400">No {entityType}s found.</p>
        ) : (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a {entityType}...</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => selectedId && onLinked(entityType, selectedId)}
            disabled={!selectedId}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Link
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [goal, setGoal] = useState<GoalDetail | null>(null)
  const [linked, setLinked] = useState<LinkedEntity[]>([])
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [events, setEvents] = useState<GoalEvent[]>([])
  const [memories, setMemories] = useState<GoalMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    if (!token || !params.id) return
    setLoading(true)
    apiClient<{ goal: GoalDetail; linkedEntities: LinkedEntity[]; progress: ProgressEntry[]; events: GoalEvent[]; memories: GoalMemory[] }>(
      `/api/goal-profiles/${params.id}`, { token },
    )
      .then(data => {
        setGoal(data.goal)
        setLinked(data.linkedEntities)
        setProgress(data.progress)
        setEvents(data.events)
        setMemories(data.memories)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [token, params.id])

  const setStatus = async (status: GoalDetail['status']) => {
    if (!token || !goal) return
    setStatusUpdating(true)
    try {
      await apiClient(`/api/goal-profiles/${goal.id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
      setGoal(g => g ? { ...g, status } : g)
      load()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update goal status' })
    } finally {
      setStatusUpdating(false)
    }
  }

  const linkEntity = async (entityType: string, entityId: string) => {
    if (!token || !goal) return
    try {
      await apiClient(`/api/goal-profiles/${goal.id}/link`, {
        method: 'POST', token, body: JSON.stringify({ entityType, entityId }),
      })
      addToast({ variant: 'success', title: 'Linked' })
      setShowLinkModal(false)
      load()
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to link', description: err instanceof ApiError ? err.message : undefined })
    }
  }

  const unlinkEntity = async (linkId: string) => {
    if (!token || !goal) return
    try {
      await apiClient(`/api/goal-profiles/${goal.id}/link/${linkId}`, { method: 'DELETE', token })
      load()
    } catch {
      addToast({ variant: 'error', title: 'Failed to unlink' })
    }
  }

  const deleteGoal = async () => {
    if (!token || !goal) return
    if (!confirm('Delete this goal?')) return
    setDeleting(true)
    try {
      await apiClient(`/api/goal-profiles/${goal.id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Goal deleted' })
      router.push('/goals')
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete goal' })
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)] p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)] p-4 md:p-6">
        <p className="text-sm text-gray-500 max-w-3xl mx-auto">Goal not found.</p>
      </div>
    )
  }

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/goals" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors mb-4">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Goals
          </Link>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
            <div className="flex items-start gap-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${goal.goalType === 'business' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                <Target className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-gray-950">{goal.title}</h1>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {goal.goalType} goal{goal.targetValue?.metric && ` · ${goal.targetValue.metric}`}
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[goal.status] ?? 'default'}>{goal.status}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {(['active', 'paused', 'achieved', 'abandoned'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={statusUpdating || goal.status === s}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:cursor-default ${
                    goal.status === s ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={deleteGoal}
                disabled={deleting}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">Linked Entities</p>
              <button
                onClick={() => setShowLinkModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                <Link2 className="w-3.5 h-3.5" />Link
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {linked.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3.5">Nothing linked yet — link a deal, project, product, contact, or document to this goal.</p>
              )}
              {linked.map(l => {
                const Icon = ENTITY_ICON[l.entityType]
                return (
                  <div key={l.linkId} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-gray-400" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{l.entityName ?? 'Untitled'}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{l.entityType}</p>
                    </div>
                    <button onClick={() => unlinkEntity(l.linkId)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {events.length > 0 && (
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
              <div className="px-4 py-3.5 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-900">Timeline</p>
              </div>
              <div className="divide-y divide-gray-50">
                {events.map(e => (
                  <div key={e.id} className="px-4 py-3">
                    <p className="text-sm text-gray-800">{e.description}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {memories.length > 0 && (
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
              <div className="px-4 py-3.5 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-900">What Zuri Knows</p>
              </div>
              <div className="divide-y divide-gray-50">
                {memories.map(m => (
                  <div key={m.id} className="px-4 py-3">
                    <p className="text-sm text-gray-800">{m.summary}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{m.sourceType.replace('_', ' ')} · {new Date(m.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showLinkModal && token && (
        <LinkEntityModal token={token} onClose={() => setShowLinkModal(false)} onLinked={linkEntity} />
      )}
    </div>
  )
}
