'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle, 
  Plus, Users, MessageSquare, ChevronLeft, ChevronRight, Check,
  Trash2, X, Sparkles, AlertCircle, Phone, Send, ShieldCheck, RefreshCw
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string | null
  allDay: boolean
  eventType: string
  source: 'user' | 'ai_extracted' | 'promise_tracker'
  isConfirmed: boolean
  isOverdue?: boolean
  promiseStatus?: 'pending' | 'fulfilled' | 'broken' | 'dismissed'
  promisedBy?: 'user' | 'contact'
  sendWaReminder?: boolean
  waReminderOffsetMinutes?: number
  waReminderStatus?: 'none' | 'scheduled' | 'sent' | 'failed'
  priority?: 'high' | 'medium' | 'low'
  contact?: { id: string; name: string; avatarUrl: string | null }
}

interface EventFormData {
  title: string
  description: string
  eventType: string
  eventDate: string
  eventTime: string
  allDay: boolean
  contactId: string
  sendWaReminder: boolean
  waReminderOffsetMinutes: number
}

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; badgeBg: string; badgeText: string }> = {
  promise:     { bg: 'bg-amber-50/80',   text: 'text-amber-900',   dot: 'bg-amber-500',   border: 'border-amber-300',   badgeBg: 'bg-amber-100',   badgeText: 'text-amber-800' },
  meeting:     { bg: 'bg-blue-50/60',    text: 'text-blue-800',    dot: 'bg-blue-500',    border: 'border-blue-200',    badgeBg: 'bg-blue-100',    badgeText: 'text-blue-700' },
  birthday:    { bg: 'bg-pink-50/60',    text: 'text-pink-800',    dot: 'bg-pink-500',    border: 'border-pink-200',    badgeBg: 'bg-pink-100',    badgeText: 'text-pink-700' },
  follow_up:   { bg: 'bg-indigo-50/60',  text: 'text-indigo-800',  dot: 'bg-indigo-500',  border: 'border-indigo-200',  badgeBg: 'bg-indigo-100',  badgeText: 'text-indigo-700' },
  deadline:    { bg: 'bg-red-50/60',     text: 'text-red-800',     dot: 'bg-red-500',     border: 'border-red-200',     badgeBg: 'bg-red-100',     badgeText: 'text-red-700' },
  reminder:    { bg: 'bg-amber-50/60',   text: 'text-amber-800',   dot: 'bg-amber-500',   border: 'border-amber-200',   badgeBg: 'bg-amber-100',   badgeText: 'text-amber-700' },
  appointment: { bg: 'bg-teal-50/60',    text: 'text-teal-800',    dot: 'bg-teal-500',    border: 'border-teal-200',    badgeBg: 'bg-teal-100',    badgeText: 'text-teal-700' },
  anniversary: { bg: 'bg-rose-50/60',    text: 'text-rose-800',    dot: 'bg-rose-500',    border: 'border-rose-200',    badgeBg: 'bg-rose-100',    badgeText: 'text-rose-700' },
  travel:      { bg: 'bg-sky-50/60',     text: 'text-sky-800',     dot: 'bg-sky-500',     border: 'border-sky-200',     badgeBg: 'bg-sky-100',     badgeText: 'text-sky-700' },
  celebration: { bg: 'bg-yellow-50/60',  text: 'text-yellow-800',  dot: 'bg-yellow-500',  border: 'border-yellow-200',  badgeBg: 'bg-yellow-100',  badgeText: 'text-yellow-700' },
  job_change:  { bg: 'bg-emerald-50/60', text: 'text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-200', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  life_event:  { bg: 'bg-violet-50/60',  text: 'text-violet-800',  dot: 'bg-violet-500',  border: 'border-violet-200',  badgeBg: 'bg-violet-100',  badgeText: 'text-violet-700' },
  loss:        { bg: 'bg-gray-100/60',   text: 'text-gray-700',    dot: 'bg-gray-400',    border: 'border-gray-200',    badgeBg: 'bg-gray-100',    badgeText: 'text-gray-600' },
  other:       { bg: 'bg-slate-50/60',   text: 'text-slate-700',   dot: 'bg-slate-400',   border: 'border-slate-200',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600' },
  default:     { bg: 'bg-slate-50/60',   text: 'text-slate-700',   dot: 'bg-slate-400',   border: 'border-slate-200',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600' },
}

const EVENT_TYPE_OPTIONS = [
  { value: 'meeting',     label: 'Meeting' },
  { value: 'follow_up',  label: 'Follow-up' },
  { value: 'deadline',   label: 'Deadline' },
  { value: 'reminder',   label: 'Reminder' },
  { value: 'appointment',label: 'Appointment' },
  { value: 'birthday',   label: 'Birthday' },
  { value: 'anniversary',label: 'Anniversary' },
  { value: 'travel',     label: 'Travel' },
  { value: 'celebration',label: 'Celebration' },
  { value: 'other',      label: 'Other' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function daysUntil(iso: string) {
  const diff = new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)
  return Math.round(diff / 86400000)
}

function toLocalDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Event Modal ─────────────────────────────────────────────────────────────

function EventModal({
  open, event, initialDate, onClose, onSave, onDelete, token,
}: {
  open: boolean
  event: CalendarEvent | null
  initialDate?: Date | null
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  token?: string
}) {
  const { addToast } = useToast()
  const isEdit = Boolean(event)
  const emptyForm: EventFormData = {
    title: '',
    description: '',
    eventType: 'meeting',
    eventDate: initialDate ? toLocalDateStr(initialDate) : toLocalDateStr(new Date()),
    eventTime: '10:00',
    allDay: false,
    contactId: '',
    sendWaReminder: false,
    waReminderOffsetMinutes: 60,
  }

  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (open) {
      // Fetch contacts for picker
      apiClient<{ contacts: Array<{ id: string; name: string }> }>('/api/contacts', { token })
        .then(res => setContacts(res.contacts || []))
        .catch(() => {})

      if (event) {
        const d = new Date(event.startDate)
        setForm({
          title: event.title,
          description: event.description || '',
          eventType: event.eventType || 'meeting',
          eventDate: toLocalDateStr(d),
          eventTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          allDay: event.allDay,
          contactId: event.contact?.id || '',
          sendWaReminder: event.sendWaReminder || false,
          waReminderOffsetMinutes: event.waReminderOffsetMinutes || 60,
        })
      } else {
        setForm({
          ...emptyForm,
          eventDate: initialDate ? toLocalDateStr(initialDate) : toLocalDateStr(new Date()),
        })
      }
    }
  }, [open, event, initialDate, token])

  const set = <K extends keyof EventFormData>(k: K, v: EventFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { addToast({ variant: 'error', title: 'Title is required' }); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || null,
        eventType: form.eventType,
        contactId: form.contactId || null,
        sendWaReminder: form.sendWaReminder,
        waReminderOffsetMinutes: form.waReminderOffsetMinutes,
      }
      if (form.allDay || !form.eventTime) {
        body.eventDate = form.eventDate
      } else {
        body.eventDatetime = `${form.eventDate}T${form.eventTime}:00`
      }

      if (isEdit && event) {
        await apiClient(`/api/calendar/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(body), token })
        addToast({ variant: 'success', title: 'Event updated' })
      } else {
        await apiClient('/api/calendar/events', { method: 'POST', body: JSON.stringify(body), token })
        addToast({ variant: 'success', title: 'Event created' })
      }
      onSave()
      onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to save event' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h2 className="text-base font-bold text-slate-900">{isEdit ? 'Edit Schedule Item' : 'New Schedule Item'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Map meetings, promises and customer touchpoints</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-all shadow-sm">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Send Invoice for 50x Solar Panels"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Associated Contact</label>
            <select
              value={form.contactId}
              onChange={e => set('contactId', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all"
            >
              <option value="">-- No Contact Attached --</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Type</label>
              <select
                value={form.eventType}
                onChange={e => set('eventType', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all"
              >
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Date</label>
                <button
                  type="button"
                  onClick={() => set('allDay', !form.allDay)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer"
                >
                  <span className={`relative w-7 h-3.5 rounded-full transition-colors flex-shrink-0 ${form.allDay ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${form.allDay ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  All day
                </button>
              </div>
              <input
                type="date"
                value={form.eventDate}
                onChange={e => set('eventDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all"
              />
            </div>
          </div>

          {!form.allDay && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Time</label>
              <input
                type="time"
                value={form.eventTime}
                onChange={e => set('eventTime', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all"
              />
            </div>
          )}

          {/* WhatsApp Reminder Toggle */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-600" />
                <span className="text-xs font-bold text-emerald-950">WhatsApp Reminder</span>
              </div>
              <button
                type="button"
                onClick={() => set('sendWaReminder', !form.sendWaReminder)}
                className={`relative w-8 h-4 rounded-full transition-colors ${form.sendWaReminder ? 'bg-emerald-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.sendWaReminder ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {form.sendWaReminder && (
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-emerald-800 mb-1">Send Confirmation</label>
                <select
                  value={form.waReminderOffsetMinutes}
                  onChange={e => set('waReminderOffsetMinutes', Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs border border-emerald-200 rounded-xl bg-white text-emerald-900 font-semibold"
                >
                  <option value={15}>15 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>24 hours before</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Context, commitments, or agenda…"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-medium transition-all resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 bg-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl disabled:opacity-50 shadow-sm"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()
  const today = new Date()

  const [view, setView] = useState<CalendarView>('month')
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(today)
  const [activeFilter, setActiveFilter] = useState<'all' | 'promises' | 'ai' | 'overdue'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const { data, loading, refetch } = useApi<{ events: CalendarEvent[] }>('/api/calendar/events', token)
  const events = data?.events ?? []

  const promiseCount = events.filter(e => e.eventType === 'promise').length
  const overdueCount = events.filter(e => e.isOverdue).length
  const aiCount = events.filter(e => e.source === 'ai_extracted').length

  const filteredEvents = useMemo(() => events.filter(e => {
    if (activeFilter === 'promises') return e.eventType === 'promise'
    if (activeFilter === 'ai') return e.source === 'ai_extracted'
    if (activeFilter === 'overdue') return e.isOverdue
    return true
  }), [events, activeFilter])

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return filteredEvents
      .filter(e => isSameDay(new Date(e.startDate), selectedDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }, [filteredEvents, selectedDate])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const handleFulfillPromise = async (id: string) => {
    setActioningId(id)
    try {
      await apiClient(`/api/calendar/promises/${id}/fulfill`, { method: 'PATCH', token: token ?? undefined })
      addToast({ variant: 'success', title: 'Promise marked fulfilled! 🎉' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update promise' })
    } finally {
      setActioningId(null)
    }
  }

  const handleDismissPromise = async (id: string) => {
    setActioningId(id)
    try {
      await apiClient(`/api/calendar/promises/${id}`, { method: 'DELETE', token: token ?? undefined })
      addToast({ variant: 'success', title: 'Promise dismissed' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to dismiss promise' })
    } finally {
      setActioningId(null)
    }
  }

  const openAddModal = (date?: Date) => {
    setEditingEvent(null)
    setSelectedDate(date || today)
    setModalOpen(true)
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <PageHeader title="Calendar Intelligence" />
        <div className="p-6 space-y-4 max-w-5xl mx-auto w-full"><SkeletonCard /><SkeletonCard /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <PageHeader
        title="Calendar & Promises"
        description="Unified temporal intelligence center tracking meetings, customer promises, and relationship deadlines."
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-6xl mx-auto w-full">

        {/* Hero Control Bar */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-950 flex items-center gap-2">
              <CalendarIcon size={20} className="text-indigo-600" />
              Relationship Calendar
            </h2>
            <p className="text-xs text-gray-500">
              {events.length} schedule items tracked · {overdueCount > 0 ? `${overdueCount} overdue commitments` : 'All promises on track'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              {(['month', 'week', 'day', 'agenda'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all ${
                    view === v ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => openAddModal()}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {([
            { id: 'all', label: 'All Items' },
            { id: 'promises', label: `🤝 Promises (${promiseCount})` },
            { id: 'overdue', label: `🔴 Overdue (${overdueCount})` },
            { id: 'ai', label: `⚡ AI Extracted (${aiCount})` },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                activeFilter === f.id
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View Rendering */}
        {view === 'month' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="md:col-span-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-4 bg-slate-50 p-2 rounded-xl">
                <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white text-slate-600"><ChevronLeft size={18} /></button>
                <span className="text-sm font-bold text-slate-900">{MONTHS[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white text-slate-600"><ChevronRight size={18} /></button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-slate-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: new Date(viewYear, viewMonth, 1).getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: new Date(viewYear, viewMonth + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
                  const date = new Date(viewYear, viewMonth, day)
                  const isToday = isSameDay(date, today)
                  const isSelected = selectedDate && isSameDay(date, selectedDate)
                  const dayEvents = filteredEvents.filter(e => isSameDay(new Date(e.startDate), date))
                  const hasOverdue = dayEvents.some(e => e.isOverdue)

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(date)}
                      onDoubleClick={() => openAddModal(date)}
                      className={`relative flex flex-col items-start p-1.5 rounded-xl border min-h-[64px] transition-all text-left ${
                        isSelected ? 'bg-indigo-50/90 border-indigo-500 ring-1 ring-indigo-500' :
                        isToday ? 'bg-indigo-50/40 border-indigo-200' :
                        hasOverdue ? 'bg-red-50/40 border-red-200' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-xs font-bold ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day}</span>
                      <div className="w-full space-y-1 mt-1">
                        {dayEvents.slice(0, 2).map(e => (
                          <div
                            key={e.id}
                            className={`text-[9px] font-bold truncate px-1 py-0.5 rounded ${
                              e.isOverdue ? 'bg-red-600 text-white animate-pulse' :
                              e.eventType === 'promise' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                              'bg-indigo-100 text-indigo-900'
                            }`}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[9px] font-bold text-slate-400 pl-1">+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sidebar Agenda for Selected Date */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {selectedDate ? selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Agenda'}
                </span>
                <button onClick={() => openAddModal(selectedDate || undefined)} className="text-xs font-bold text-indigo-600 hover:underline">+ Add</button>
              </div>

              {selectedEvents.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-medium">No items scheduled for this date</div>
              ) : (
                <div className="space-y-2.5">
                  {selectedEvents.map(e => {
                    const colors = EVENT_COLORS[e.eventType] ?? EVENT_COLORS.default
                    return (
                      <div key={e.id} className={`p-3 rounded-xl border space-y-2 ${e.isOverdue ? 'bg-red-50/80 border-red-300' : colors.bg}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{e.eventType}</span>
                            <h4 className="text-xs font-bold text-slate-900">{e.title}</h4>
                            {e.contact && <p className="text-[10px] font-semibold text-indigo-600">👤 {e.contact.name}</p>}
                          </div>
                          {e.isOverdue && <span className="text-[9px] font-black uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded">OVERDUE</span>}
                        </div>

                        {e.eventType === 'promise' && e.promiseStatus === 'pending' && (
                          <div className="flex items-center gap-2 pt-1 border-t border-black/5">
                            <button
                              onClick={() => handleFulfillPromise(e.id)}
                              disabled={actioningId === e.id}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-md"
                            >
                              ✓ Fulfill
                            </button>
                            <button
                              onClick={() => handleDismissPromise(e.id)}
                              disabled={actioningId === e.id}
                              className="text-[10px] font-bold text-slate-600 hover:bg-slate-200 px-2 py-1 rounded-md"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agenda View */}
        {view === 'agenda' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Chronological Schedule Agenda</h3>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">No matching agenda items</div>
            ) : (
              <div className="divide-y divide-gray-100 space-y-2">
                {filteredEvents.map(e => (
                  <div key={e.id} className="pt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 text-center flex-shrink-0">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">{new Date(e.startDate).toLocaleDateString([], { month: 'short' })}</span>
                        <span className="text-sm font-black text-slate-900">{new Date(e.startDate).getDate()}</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{e.title}</p>
                        <p className="text-[10px] text-slate-500">{e.description || formatTime(e.startDate, e.allDay)} {e.contact ? `· ${e.contact.name}` : ''}</p>
                      </div>
                    </div>
                    {e.eventType === 'promise' && e.promiseStatus === 'pending' && (
                      <button onClick={() => handleFulfillPromise(e.id)} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        Mark Fulfilled
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Day / Week Fallback Views */}
        {(view === 'day' || view === 'week') && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-3">
            <Clock size={24} className="mx-auto text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">{view.toUpperCase()} Timeline Grid</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Click any time cell below or switch to Agenda view for vertical layout.</p>
            <button onClick={() => setView('agenda')} className="text-xs font-bold text-indigo-600 underline">Switch to Agenda View</button>
          </div>
        )}

      </div>

      <EventModal
        open={modalOpen}
        event={editingEvent}
        initialDate={selectedDate || undefined}
        onClose={() => setModalOpen(false)}
        onSave={() => refetch()}
        token={token ?? undefined}
      />
    </div>
  )
}
