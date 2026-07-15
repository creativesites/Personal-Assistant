'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FolderKanban, Plus, Trash2, Loader2, FileText, Check, Circle, Ban, Target, X,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, SkeletonCard, useToast } from '@/components/ui'

// Zuri Neural Layer Phase 2 (docs/NEURAL_LAYER_PLAN.md §4.4) — a project
// can link to a cross-module goal (e.g. "grow monthly revenue to $20k"),
// distinct from the project's own deal_id/contact_id relationships.
interface GoalOption { id: string; title: string }

interface ProjectDetail {
  id: string
  contactId: string | null
  contactName: string | null
  dealId: string | null
  dealTitle: string | null
  title: string
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'
  startDate: string | null
  dueDate: string | null
}

interface Task {
  id: string
  projectId: string
  title: string
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  dueDate: string | null
  assignedTo: string | null
  createdAt: string
}

interface ProjectDocument {
  id: string
  documentType: string
  documentNumber: string
  title: string
  status: string
  totalCents: number
  currency: string
  createdAt: string
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'info', on_hold: 'warning', completed: 'success', cancelled: 'default',
}

const TASK_STATUSES: Task['status'][] = ['todo', 'in_progress', 'done', 'blocked']

function formatMoney(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency })
}

function nextTaskStatus(status: Task['status']): Task['status'] {
  if (status === 'todo') return 'in_progress'
  if (status === 'in_progress') return 'done'
  if (status === 'done') return 'todo'
  return 'todo'
}

function TaskStatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'done') return <Check className="w-4 h-4 text-emerald-600" />
  if (status === 'blocked') return <Ban className="w-4 h-4 text-red-500" />
  if (status === 'in_progress') return <Circle className="w-4 h-4 text-indigo-500 fill-indigo-100" />
  return <Circle className="w-4 h-4 text-gray-300" />
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([])
  const [linkingGoalId, setLinkingGoalId] = useState('')
  const [linkingGoal, setLinkingGoal] = useState(false)

  const load = () => {
    if (!token || !params.id) return
    setLoading(true)
    apiClient<{ project: ProjectDetail; tasks: Task[]; documents: ProjectDocument[] }>(`/api/projects/${params.id}`, { token })
      .then(data => {
        setProject(data.project)
        setTasks(data.tasks)
        setDocuments(data.documents)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [token, params.id])

  const addTask = async () => {
    if (!token || !newTaskTitle.trim() || !project) return
    setAddingTask(true)
    try {
      const data = await apiClient<{ task: Task }>(`/api/projects/${project.id}/tasks`, {
        method: 'POST', token, body: JSON.stringify({ title: newTaskTitle.trim() }),
      })
      setTasks(t => [...t, data.task])
      setNewTaskTitle('')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to add task', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setAddingTask(false)
    }
  }

  const cycleTaskStatus = async (task: Task) => {
    if (!token || !project) return
    setBusyTaskId(task.id)
    const status = nextTaskStatus(task.status)
    try {
      await apiClient(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ status }),
      })
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status } : t))
    } catch {
      addToast({ variant: 'error', title: 'Failed to update task' })
    } finally {
      setBusyTaskId(null)
    }
  }

  const deleteTask = async (task: Task) => {
    if (!token || !project) return
    setBusyTaskId(task.id)
    try {
      await apiClient(`/api/projects/${project.id}/tasks/${task.id}`, { method: 'DELETE', token })
      setTasks(ts => ts.filter(t => t.id !== task.id))
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete task' })
    } finally {
      setBusyTaskId(null)
    }
  }

  const setProjectStatus = async (status: ProjectDetail['status']) => {
    if (!token || !project) return
    setStatusUpdating(true)
    try {
      await apiClient(`/api/projects/${project.id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
      setProject(p => p ? { ...p, status } : p)
    } catch {
      addToast({ variant: 'error', title: 'Failed to update project status' })
    } finally {
      setStatusUpdating(false)
    }
  }

  const deleteProject = async () => {
    if (!token || !project) return
    if (!confirm('Delete this project? Tasks will be deleted too.')) return
    setDeleting(true)
    try {
      await apiClient(`/api/projects/${project.id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Project deleted' })
      router.push('/projects')
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete project' })
      setDeleting(false)
    }
  }

  const openGoalPicker = async () => {
    if (!token) return
    setShowGoalPicker(true)
    try {
      const data = await apiClient<{ goals: GoalOption[] }>('/api/goal-profiles?status=active', { token })
      setGoalOptions(data.goals)
    } catch {
      setGoalOptions([])
    }
  }

  const linkToGoal = async () => {
    if (!token || !project || !linkingGoalId) return
    setLinkingGoal(true)
    try {
      await apiClient(`/api/goal-profiles/${linkingGoalId}/link`, {
        method: 'POST', token, body: JSON.stringify({ entityType: 'project', entityId: project.id }),
      })
      addToast({ variant: 'success', title: 'Linked to goal' })
      setShowGoalPicker(false)
      setLinkingGoalId('')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to link goal', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLinkingGoal(false)
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

  if (!project) {
    return (
      <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)] p-4 md:p-6">
        <p className="text-sm text-gray-500 max-w-3xl mx-auto">Project not found.</p>
      </div>
    )
  }

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors mb-4">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Projects
          </Link>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
            <div className="flex items-start gap-3">
              {project.contactId ? (
                <Avatar name={project.contactName ?? '?'} size="md" />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><FolderKanban className="w-5 h-5" /></div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-gray-950">{project.title}</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {project.contactName ?? 'No contact'}
                  {project.dueDate && ` · due ${new Date(project.dueDate).toLocaleDateString()}`}
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[project.status] ?? 'default'}>{project.status.replace('_', ' ')}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {(['active', 'on_hold', 'completed', 'cancelled'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setProjectStatus(s)}
                  disabled={statusUpdating || project.status === s}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:cursor-default ${
                    project.status === s ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
              <button
                onClick={openGoalPicker}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <Target className="w-3.5 h-3.5" />
                Link to goal
              </button>
              <button
                onClick={deleteProject}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
            <div className="px-4 py-3.5 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">Tasks</p>
            </div>

            <div className="divide-y divide-gray-50">
              {tasks.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3.5">No tasks yet.</p>
              )}
              {tasks.map(task => {
                const overdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date()
                return (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80">
                    <button
                      onClick={() => cycleTaskStatus(task)}
                      disabled={busyTaskId === task.id}
                      className="flex-shrink-0"
                      title="Cycle status"
                    >
                      <TaskStatusIcon status={task.status} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
                      {(task.dueDate || task.assignedTo) && (
                        <p className={`text-[11px] mt-0.5 ${overdue ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                          {task.dueDate && `due ${new Date(task.dueDate).toLocaleDateString()}`}
                          {task.dueDate && task.assignedTo && ' · '}
                          {task.assignedTo}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteTask(task)}
                      disabled={busyTaskId === task.id}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 px-4 py-3.5 border-t border-gray-50">
              <input
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                placeholder="Add a task…"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                onClick={addTask}
                disabled={addingTask || !newTaskTitle.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {addingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>

          {documents.length > 0 && (
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
              <div className="px-4 py-3.5 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-900">Linked Documents</p>
              </div>
              <div className="divide-y divide-gray-50">
                {documents.map(doc => (
                  <Link
                    key={doc.id}
                    href="/business"
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-gray-400" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                      <p className="text-xs text-gray-400">{doc.documentNumber} · {doc.status}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{formatMoney(doc.totalCents, doc.currency)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showGoalPicker && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowGoalPicker(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Link to a goal</h2>
              <button onClick={() => setShowGoalPicker(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {goalOptions.length === 0 ? (
              <p className="text-xs text-gray-400">No active goals yet — create one on the Goals page first.</p>
            ) : (
              <select
                value={linkingGoalId}
                onChange={e => setLinkingGoalId(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a goal...</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            )}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowGoalPicker(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={linkToGoal}
                disabled={linkingGoal || !linkingGoalId}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {linkingGoal && <Loader2 className="w-4 h-4 animate-spin" />}
                Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
