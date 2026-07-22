'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FolderKanban, Plus, Trash2, Loader2, FileText, Check, Circle, Ban, Target, X,
  Flag, Clock, Play, Square, Wallet,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, SkeletonCard, useToast } from '@/components/ui'

// Zuri Neural Layer Phase 2 (docs/NEURAL_LAYER_PLAN.md §4.4) — a project
// can link to a cross-module goal (e.g. "grow monthly revenue to $20k"),
// distinct from the project's own deal_id/contact_id relationships.
interface GoalOption { id: string; title: string }

interface LinkedGoal {
  id: string
  title: string
  goalType: 'business' | 'personal'
  status: 'active' | 'achieved' | 'abandoned' | 'paused'
}

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
  estimatedBudgetCents: number | null
  budgetCurrency: string | null
  careerOpportunityId: string | null
}

// Project Management Phase 1 (docs/SERVICES_PROJECTS_PLAN.md §11.3/§11.4/§11.5)
interface Milestone {
  id: string
  title: string
  description: string | null
  targetDate: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  completionPct: number
  paymentAmountCents: number | null
  currency: string | null
  requiresClientApproval: boolean
  approvedAt: string | null
  completedAt: string | null
}

interface TimeEntry {
  id: string
  taskId: string | null
  personLabel: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  isBillable: boolean
  note: string | null
  createdAt: string
}

interface Budget {
  estimatedCents: number | null
  currency: string | null
  invoicedCents: number
  paidCents: number
  purchaseCostCents: number
  laborMinutes: number
  billableMinutes: number
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

const MILESTONE_STATUS_VARIANTS: Record<Milestone['status'], BadgeVariant> = {
  pending: 'default', in_progress: 'info', completed: 'success', cancelled: 'default',
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
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
  const [linkedGoal, setLinkedGoal] = useState<LinkedGoal | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [budget, setBudget] = useState<Budget | null>(null)
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
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState('')
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null)
  const [timerBusy, setTimerBusy] = useState(false)
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [addingTimeEntry, setAddingTimeEntry] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docType, setDocType] = useState('quotation')
  const [docDescription, setDocDescription] = useState('')
  const [docAmount, setDocAmount] = useState('')
  const [generatingDoc, setGeneratingDoc] = useState(false)

  const load = () => {
    if (!token || !params.id) return
    setLoading(true)
    apiClient<{
      project: ProjectDetail; tasks: Task[]; documents: ProjectDocument[]; linkedGoal: LinkedGoal | null
      milestones: Milestone[]; timeEntries: TimeEntry[]; budget: Budget
    }>(`/api/projects/${params.id}`, { token })
      .then(data => {
        setProject(data.project)
        setTasks(data.tasks)
        setDocuments(data.documents)
        setLinkedGoal(data.linkedGoal ?? null)
        setMilestones(data.milestones ?? [])
        setTimeEntries(data.timeEntries ?? [])
        setBudget(data.budget ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [token, params.id])

  const runningEntry = timeEntries.find(e => e.startedAt && !e.endedAt) ?? null

  const addMilestone = async () => {
    if (!token || !project || !newMilestoneTitle.trim()) return
    setAddingMilestone(true)
    try {
      const data = await apiClient<{ milestone: Milestone }>(`/api/projects/${project.id}/milestones`, {
        method: 'POST', token,
        body: JSON.stringify({ title: newMilestoneTitle.trim(), targetDate: newMilestoneDate || undefined }),
      })
      setMilestones(m => [...m, data.milestone])
      setNewMilestoneTitle('')
      setNewMilestoneDate('')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to add milestone', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setAddingMilestone(false)
    }
  }

  const toggleMilestoneComplete = async (m: Milestone) => {
    if (!token || !project) return
    setBusyMilestoneId(m.id)
    const status = m.status === 'completed' ? 'pending' : 'completed'
    try {
      await apiClient(`/api/projects/${project.id}/milestones/${m.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ status, completionPct: status === 'completed' ? 100 : m.completionPct }),
      })
      setMilestones(ms => ms.map(x => x.id === m.id ? { ...x, status, completedAt: status === 'completed' ? new Date().toISOString() : null } : x))
    } catch {
      addToast({ variant: 'error', title: 'Failed to update milestone' })
    } finally {
      setBusyMilestoneId(null)
    }
  }

  const deleteMilestone = async (m: Milestone) => {
    if (!token || !project) return
    setBusyMilestoneId(m.id)
    try {
      await apiClient(`/api/projects/${project.id}/milestones/${m.id}`, { method: 'DELETE', token })
      setMilestones(ms => ms.filter(x => x.id !== m.id))
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete milestone' })
    } finally {
      setBusyMilestoneId(null)
    }
  }

  const startTimer = async () => {
    if (!token || !project) return
    setTimerBusy(true)
    try {
      const data = await apiClient<{ timeEntry: TimeEntry }>(`/api/projects/${project.id}/time-entries/start`, { method: 'POST', token })
      setTimeEntries(t => [data.timeEntry, ...t])
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to start timer', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setTimerBusy(false)
    }
  }

  const stopTimer = async () => {
    if (!token || !project || !runningEntry) return
    setTimerBusy(true)
    try {
      const data = await apiClient<{ timeEntry: TimeEntry }>(`/api/projects/${project.id}/time-entries/${runningEntry.id}/stop`, { method: 'POST', token })
      setTimeEntries(t => t.map(e => e.id === data.timeEntry.id ? data.timeEntry : e))
    } catch {
      addToast({ variant: 'error', title: 'Failed to stop timer' })
    } finally {
      setTimerBusy(false)
    }
  }

  const addManualTimeEntry = async () => {
    if (!token || !project || !manualMinutes) return
    setAddingTimeEntry(true)
    try {
      const data = await apiClient<{ timeEntry: TimeEntry }>(`/api/projects/${project.id}/time-entries`, {
        method: 'POST', token,
        body: JSON.stringify({ durationMinutes: parseInt(manualMinutes, 10), note: manualNote || undefined }),
      })
      setTimeEntries(t => [data.timeEntry, ...t])
      setManualMinutes('')
      setManualNote('')
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to log time', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setAddingTimeEntry(false)
    }
  }

  const generateDocument = async () => {
    if (!token || !project || !docDescription.trim() || !docAmount) return
    setGeneratingDoc(true)
    try {
      const data = await apiClient<{ document: ProjectDocument }>(`/api/projects/${project.id}/documents`, {
        method: 'POST', token,
        body: JSON.stringify({
          documentType: docType,
          items: [{ description: docDescription.trim(), quantity: 1, unitPriceCents: Math.round(parseFloat(docAmount) * 100) }],
        }),
      })
      setDocuments(d => [data.document, ...d])
      setShowDocForm(false)
      setDocDescription('')
      setDocAmount('')
      addToast({ variant: 'success', title: 'Document created', description: 'Open it from Business → Documents to finish and send it.' })
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to generate document', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setGeneratingDoc(false)
    }
  }

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
      load()
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
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-lg font-bold text-gray-950">{project.title}</h1>
                    {project.careerOpportunityId && (
                      <Link href={`/career/jobs/${project.careerOpportunityId}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200">
                        <Briefcase className="w-3 h-3" /> Job Application
                      </Link>
                    )}
                  </div>
                </div>
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

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
            <div className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-sm font-semibold text-gray-900">Milestones</p>
            </div>

            <div className="divide-y divide-gray-50">
              {milestones.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3.5">No milestones yet.</p>
              )}
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80">
                  <button
                    onClick={() => toggleMilestoneComplete(m)}
                    disabled={busyMilestoneId === m.id}
                    className="flex-shrink-0"
                    title="Toggle complete"
                  >
                    {m.status === 'completed'
                      ? <Check className="w-4 h-4 text-emerald-600" />
                      : <Circle className="w-4 h-4 text-gray-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${m.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{m.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {m.targetDate && <span className="text-[11px] text-gray-400">due {new Date(m.targetDate).toLocaleDateString()}</span>}
                      {m.completionPct > 0 && m.completionPct < 100 && (
                        <span className="text-[11px] text-indigo-600 font-medium">{m.completionPct}%</span>
                      )}
                      {m.paymentAmountCents != null && (
                        <span className="text-[11px] text-gray-500">{formatMoney(m.paymentAmountCents, m.currency ?? 'USD')}</span>
                      )}
                      {m.requiresClientApproval && (
                        <Badge variant={m.approvedAt ? 'success' : MILESTONE_STATUS_VARIANTS[m.status]}>
                          {m.approvedAt ? 'approved' : 'needs approval'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMilestone(m)}
                    disabled={busyMilestoneId === m.id}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 px-4 py-3.5 border-t border-gray-50">
              <input
                value={newMilestoneTitle}
                onChange={e => setNewMilestoneTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMilestone() }}
                placeholder="Add a milestone…"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <input
                type="date"
                value={newMilestoneDate}
                onChange={e => setNewMilestoneDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                onClick={addMilestone}
                disabled={addingMilestone || !newMilestoneTitle.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {addingMilestone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
            <div className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-sm font-semibold text-gray-900">Time</p>
              </div>
              {runningEntry ? (
                <button
                  onClick={stopTimer}
                  disabled={timerBusy}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {timerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3 h-3" />}
                  Stop
                </button>
              ) : (
                <button
                  onClick={startTimer}
                  disabled={timerBusy}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {timerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3 h-3" />}
                  Start
                </button>
              )}
            </div>

            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {timeEntries.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3.5">No time logged yet.</p>
              )}
              {timeEntries.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900">
                      {!e.endedAt ? 'Running…' : e.durationMinutes != null ? formatMinutes(e.durationMinutes) : '—'}
                      {e.note && <span className="text-gray-400"> · {e.note}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(e.createdAt).toLocaleDateString()}{!e.isBillable && ' · non-billable'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 px-4 py-3.5 border-t border-gray-50">
              <input
                type="number" min="1"
                value={manualMinutes}
                onChange={e => setManualMinutes(e.target.value)}
                placeholder="Minutes"
                className="w-24 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <input
                value={manualNote}
                onChange={e => setManualNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addManualTimeEntry() }}
                placeholder="Note (optional)"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                onClick={addManualTimeEntry}
                disabled={addingTimeEntry || !manualMinutes}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {addingTimeEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Log
              </button>
            </div>
            {(budget?.laborMinutes ?? 0) > 0 && (
              <p className="text-[11px] text-gray-400 px-4 pb-3">
                Total: {formatMinutes(budget?.laborMinutes ?? 0)} ({formatMinutes(budget?.billableMinutes ?? 0)} billable)
              </p>
            )}
          </div>

          {budget && (budget.estimatedCents != null || budget.invoicedCents > 0 || budget.purchaseCostCents > 0) && (
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Wallet className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-sm font-semibold text-gray-900">Budget</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-gray-50/90 px-3 py-2.5 ring-1 ring-gray-100">
                  <p className="text-[11px] font-semibold text-gray-500">Estimated</p>
                  <p className="text-sm font-bold text-gray-950 tabular-nums">
                    {budget.estimatedCents != null ? formatMoney(budget.estimatedCents, budget.currency ?? 'USD') : '—'}
                  </p>
                </div>
                <div className="rounded-2xl bg-indigo-50/70 px-3 py-2.5 ring-1 ring-indigo-100">
                  <p className="text-[11px] font-semibold text-indigo-700">Invoiced</p>
                  <p className="text-sm font-bold text-gray-950 tabular-nums">{formatMoney(budget.invoicedCents, budget.currency ?? 'USD')}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/70 px-3 py-2.5 ring-1 ring-emerald-100">
                  <p className="text-[11px] font-semibold text-emerald-700">Paid</p>
                  <p className="text-sm font-bold text-gray-950 tabular-nums">{formatMoney(budget.paidCents, budget.currency ?? 'USD')}</p>
                </div>
                <div className="rounded-2xl bg-amber-50/70 px-3 py-2.5 ring-1 ring-amber-100">
                  <p className="text-[11px] font-semibold text-amber-700">Purchases</p>
                  <p className="text-sm font-bold text-gray-950 tabular-nums">{formatMoney(budget.purchaseCostCents, budget.currency ?? 'USD')}</p>
                </div>
              </div>
              {budget.estimatedCents != null && budget.invoicedCents > budget.estimatedCents && (
                <p className="text-[11px] text-red-600 font-medium mt-2.5">Invoiced total is over the estimated budget.</p>
              )}
            </div>
          )}

          {linkedGoal && (
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
              <div className="px-4 py-3.5 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-900">Linked Goal</p>
              </div>
              <Link href="/goals" className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0"><Target className="w-4 h-4 text-indigo-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{linkedGoal.title}</p>
                  <p className="text-xs text-gray-400 capitalize">{linkedGoal.goalType} goal · {linkedGoal.status}</p>
                </div>
              </Link>
            </div>
          )}

          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 mt-4">
            <div className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Linked Documents</p>
              <button
                onClick={() => setShowDocForm(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Generate
              </button>
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3.5">No documents yet.</p>
            ) : (
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
            )}
          </div>
        </div>
      </div>

      {showDocForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDocForm(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Generate a document</h2>
              <button onClick={() => setShowDocForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="quotation">Quotation</option>
                  <option value="invoice">Invoice</option>
                  <option value="proposal">Proposal</option>
                  <option value="contract">Contract</option>
                  <option value="statement_of_work">Statement of Work</option>
                  <option value="service_agreement">Service Agreement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  value={docDescription}
                  onChange={e => setDocDescription(e.target.value)}
                  placeholder={`${project.title} — milestone 1`}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <input
                  type="number" min="0" step="0.01"
                  value={docAmount}
                  onChange={e => setDocAmount(e.target.value)}
                  placeholder="0.00"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {!project.contactId && (
                <p className="text-xs text-amber-600">This project has no linked contact — the document will be created without one.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowDocForm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={generateDocument}
                disabled={generatingDoc || !docDescription.trim() || !docAmount}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {generatingDoc && <Loader2 className="w-4 h-4 animate-spin" />}
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

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
