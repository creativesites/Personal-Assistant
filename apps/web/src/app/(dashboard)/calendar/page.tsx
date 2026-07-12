'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
  source: 'user' | 'ai_extracted'
  isConfirmed: boolean
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; badgeBg: string; badgeText: string }> = {
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
  { value: 'job_change', label: 'Job Change' },
  { value: 'life_event', label: 'Life Event' },
  { value: 'other',      label: 'Other' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Month Grid Component ─────────────────────────────────────────────────────

function MonthGrid({
  year, month, events, selectedDate, onSelectDate,
}: {
  year: number; month: number; events: CalendarEvent[]
  selectedDate: Date | null; onSelectDate: (d: Date) => void
}) {
  const today = new Date()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const eventsByDay = useMemo(() => {
    const map: Record<number, { count: number; hasUnconfirmed: boolean }> = {}
    events.forEach(e => {
      const d = new Date(e.startDate)
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate()
        map[day] = {
          count: (map[day]?.count ?? 0) + 1,
          hasUnconfirmed: (map[day]?.hasUnconfirmed ?? false) || !e.isConfirmed,
        }
      }
    })
    return map
  }, [events, month, year])

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="p-1" />
          const date = new Date(year, month, day)
          const isToday = isSameDay(date, today)
          const isSelected = selectedDate && isSameDay(date, selectedDate)
          const info = eventsByDay[day]
          return (
            <button
              key={day}
              onClick={() => onSelectDate(date)}
              className={`relative flex flex-col items-center justify-between p-2 rounded-xl transition-all min-h-[48px] ${
                isSelected ? 'bg-indigo-600 shadow-md shadow-indigo-200' :
                isToday ? 'bg-indigo-50 border border-indigo-200' :
                'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <span className={`text-sm font-semibold leading-none ${
                isSelected ? 'text-white' : isToday ? 'text-indigo-600' : 'text-slate-700'
              }`}>
                {day}
              </span>
              {info && info.count > 0 && (
                <div className="flex gap-0.5 mt-1.5 justify-center w-full">
                  {Array.from({ length: Math.min(info.count, 3) }, (_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white/90' : (info.hasUnconfirmed && i === 0) ? 'bg-amber-400' : 'bg-indigo-500'
                    }`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Event Card Component ─────────────────────────────────────────────────────

function EventCard({
  event, onConfirm, onDismiss, onEdit, confirming, dismissing,
}: {
  event: CalendarEvent
  onConfirm: (id: string) => void
  onDismiss: (id: string) => void
  onEdit: (event: CalendarEvent) => void
  confirming: boolean
  dismissing: boolean
}) {
  const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
  const isAiPending = event.source === 'ai_extracted' && !event.isConfirmed
  const typeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === event.eventType)?.label ?? event.eventType

  return (
    <div className={`rounded-xl border p-3.5 transition-all hover:scale-[1.01] shadow-sm ${
      isAiPending ? 'border-dashed border-amber-300 bg-amber-50/50' : `${colors.border} ${colors.bg}`
    }`}>
      {isAiPending && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-md px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
          AI Suggested — Awaiting Confirmation
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isAiPending ? 'bg-amber-400' : colors.dot}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-xs font-bold leading-tight ${isAiPending ? 'text-amber-900' : colors.text}`}>{event.title}</p>
            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-white/80 border border-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
              {formatTime(event.startDate, event.allDay)}
            </span>
          </div>

          {event.description && (
            <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{event.description}</p>
          )}

          {event.contact && (
            <div className="flex items-center gap-1.5 pt-1">
              <Avatar name={event.contact.name} src={event.contact.avatarUrl ?? undefined} size="xs" />
              <Link href={`/contacts/${event.contact.id}`} className={`text-[11px] font-bold hover:underline ${isAiPending ? 'text-amber-700' : colors.text}`}>
                {event.contact.name}
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100/60 mt-2 gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isAiPending ? 'bg-amber-100 text-amber-700' : `${colors.badgeBg} ${colors.badgeText}`
            }`}>
              {typeLabel}
            </span>

            {isAiPending ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onDismiss(event.id)}
                  disabled={dismissing}
                  className="text-[10px] bg-white hover:bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-lg border border-red-200 transition-all shadow-sm disabled:opacity-50"
                >
                  {dismissing ? '…' : 'Dismiss'}
                </button>
                <button
                  onClick={() => onConfirm(event.id)}
                  disabled={confirming}
                  className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg transition-all shadow-sm disabled:opacity-50"
                >
                  {confirming ? '…' : '✓ Confirm'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onEdit(event)}
                  className="text-[10px] bg-white hover:bg-slate-50 text-slate-600 font-bold px-2 py-1 rounded border border-slate-200 transition-all shadow-sm"
                >
                  Edit
                </button>
                <button className="text-[10px] bg-white hover:bg-slate-50 text-slate-700 font-bold px-2 py-1 rounded border border-slate-200 transition-all shadow-sm">
                  {event.eventType === 'meeting' ? 'Join' : 'Done'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Slide-over Modal ─────────────────────────────────────────────────────────

function EventModal({
  open, event, onClose, onSave, onDelete, token,
}: {
  open: boolean
  event: CalendarEvent | null
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  token: string | undefined
}) {
  const { addToast } = useToast()
  const isEdit = !!event

  const emptyForm: EventFormData = {
    title: '', description: '', eventType: 'meeting',
    eventDate: toLocalDateStr(new Date()), eventTime: '', allDay: true,
  }

  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event) {
      const d = new Date(event.startDate)
      setForm({
        title: event.title,
        description: event.description ?? '',
        eventType: event.eventType,
        eventDate: toLocalDateStr(d),
        eventTime: event.allDay ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
        allDay: event.allDay,
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, event])

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

  const handleDelete = async () => {
    if (!event) return
    setDeleting(true)
    try {
      await apiClient(`/api/calendar/events/${event.id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Event deleted' })
      if (onDelete) onDelete()
      onClose()
    } catch {
      addToast({ variant: 'error', title: 'Failed to delete event' })
    } finally {
      setDeleting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white shadow-2xl flex flex-col h-full" style={{ animation: 'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h2 className="text-base font-bold text-slate-900">{isEdit ? 'Edit Event' : 'Add Event'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{isEdit ? 'Update this calendar event' : 'Create a new calendar event'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-all shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What is this event about?"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 placeholder:text-slate-400 text-slate-900 font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Type</label>
            <select
              value={form.eventType}
              onChange={e => set('eventType', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-900 font-medium transition-all"
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
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer"
              >
                <span className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${form.allDay ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.allDay ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </span>
                All day
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.eventDate}
                onChange={e => set('eventDate', e.target.value)}
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-900 font-medium transition-all"
              />
              {!form.allDay && (
                <input
                  type="time"
                  value={form.eventTime}
                  onChange={e => set('eventTime', e.target.value)}
                  className="w-28 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-900 font-medium transition-all"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Add context, agenda, or notes…"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 placeholder:text-slate-400 text-slate-900 font-medium transition-all resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          {isEdit ? (
            <button onClick={handleDelete} disabled={deleting} className="text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl transition-all disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm font-semibold text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-xl transition-all border border-slate-200 bg-white">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl transition-all disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()
  const today = new Date()

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(today)
  const [activeFilter, setActiveFilter] = useState<'all' | 'ai' | 'confirmed' | 'pending' | 'high_priority'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  const { data, loading, refetch } = useApi<{ events: CalendarEvent[] }>('/api/calendar/events', token)
  const events = data?.events ?? []

  const aiCount = events.filter(e => e.source === 'ai_extracted').length
  const pendingCount = events.filter(e => e.source === 'ai_extracted' && !e.isConfirmed).length
  const highPriorityCount = events.filter(e => e.priority === 'high').length

  const filteredEvents = useMemo(() => events.filter(e => {
    if (activeFilter === 'ai') return e.source === 'ai_extracted'
    if (activeFilter === 'confirmed') return e.isConfirmed
    if (activeFilter === 'pending') return !e.isConfirmed
    if (activeFilter === 'high_priority') return e.priority === 'high'
    return true
  }), [events, activeFilter])

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return filteredEvents
      .filter(e => isSameDay(new Date(e.startDate), selectedDate))
      .sort((a, b) => {
        if (!a.isConfirmed && b.isConfirmed) return -1
        if (a.isConfirmed && !b.isConfirmed) return 1
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      })
  }, [filteredEvents, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return filteredEvents
      .filter(e => new Date(e.startDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5)
  }, [filteredEvents])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const handleConfirm = useCallback(async (id: string) => {
    setConfirmingId(id)
    try {
      await apiClient(`/api/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify({ isConfirmed: true }), token: token ?? undefined })
      addToast({ variant: 'success', title: 'Event confirmed and added to your calendar' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to confirm event' })
    } finally {
      setConfirmingId(null)
    }
  }, [token, addToast, refetch])

  const handleDismiss = useCallback(async (id: string) => {
    setDismissingId(id)
    try {
      await apiClient(`/api/calendar/events/${id}`, { method: 'DELETE', token: token ?? undefined })
      addToast({ variant: 'success', title: 'Event dismissed' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to dismiss event' })
    } finally {
      setDismissingId(null)
    }
  }, [token, addToast, refetch])

  const openAddModal = () => { setEditingEvent(null); setModalOpen(true) }
  const openEditModal = (event: CalendarEvent) => { setEditingEvent(event); setModalOpen(true) }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full bg-slate-50/50">
        <PageHeader title="Calendar Intelligence" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
          <SkeletonCard />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2"><SkeletonCard /></div>
            <div><SkeletonCard /></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/30">
      <PageHeader
        title="Calendar"
        description="AI-enriched contextual events and deal pipeline actions mapped directly from WhatsApp streams."
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Intelligence Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-6 -translate-y-6">
              <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div className="relative z-10 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-indigo-500/30 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Zuri Schedule Intelligence
                </span>
                {pendingCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    {pendingCount} awaiting review
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold tracking-tight">
                {events.length === 0
                  ? 'No events yet — start a WhatsApp conversation to extract your first event'
                  : `${events.length} event${events.length !== 1 ? 's' : ''} across your relationship network`}
              </h3>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                Zuri continuously extracts meetings, deadlines, follow-ups, and milestones from your WhatsApp conversations in real time.
              </p>
              <div className="flex flex-wrap gap-4 pt-1.5 text-xs text-slate-400">
                <div>⚡ <strong className="text-slate-100">{aiCount}</strong> AI Extracted</div>
                <div>🎯 <strong className="text-slate-100">{highPriorityCount}</strong> High Priority</div>
                <div>⏳ <strong className="text-slate-100">{pendingCount}</strong> Pending</div>
              </div>
            </div>
          </div>

          {/* Filters + Add Button */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
              {([
                { value: 'all' as const,          label: 'All' },
                { value: 'ai' as const,           label: '✨ AI' },
                { value: 'pending' as const,      label: '⏳ Pending' },
                { value: 'confirmed' as const,    label: '✓ Confirmed' },
                { value: 'high_priority' as const,label: '🔥 Priority' },
              ]).map(f => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1 ${
                    activeFilter === f.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                  {f.value === 'pending' && pendingCount > 0 && (
                    <span className="bg-amber-400 text-white text-[9px] font-black px-1 py-0.5 rounded-full leading-none">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={openAddModal}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Event
            </button>
          </div>

          {/* Calendar Grid + Sidebar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4 bg-slate-50 p-2 rounded-xl">
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(today) }}
                  className="text-sm font-bold text-slate-800 hover:text-indigo-600 transition-colors tracking-tight px-3 py-1 rounded-md"
                >
                  {MONTHS[viewMonth]} {viewYear}
                </button>
                <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <MonthGrid
                year={viewYear}
                month={viewMonth}
                events={filteredEvents}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px] font-semibold text-slate-500">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Confirmed</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> AI Pending</div>
              </div>
            </div>

            <div className="space-y-4">
              {selectedDate && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {isSameDay(selectedDate, today) ? "🔥 Today's Agenda" : `🗓️ ${selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">{selectedEvents.length}</span>
                      <button
                        onClick={openAddModal}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                        title="Add event"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {selectedEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium text-slate-400">Clear slate for this date</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">WhatsApp conversations will auto-populate events here</p>
                      <button onClick={openAddModal} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                        + Add manual event
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedEvents.map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onConfirm={handleConfirm}
                          onDismiss={handleDismiss}
                          onEdit={openEditModal}
                          confirming={confirmingId === event.id}
                          dismissing={dismissingId === event.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {upcomingEvents.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🚀 Fast Pipeline Horizon</p>
                  <div className="divide-y divide-slate-100">
                    {upcomingEvents.map(event => {
                      const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
                      const d = new Date(event.startDate)
                      const du = daysUntil(event.startDate)
                      const isAiPending = event.source === 'ai_extracted' && !event.isConfirmed
                      return (
                        <button
                          key={event.id}
                          onClick={() => { setSelectedDate(d); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }}
                          className="w-full text-left flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-xl px-1.5 transition-all group"
                        >
                          <div className={`flex-shrink-0 w-9 h-9 rounded-xl border flex flex-col items-center justify-center transition-all group-hover:scale-95 ${
                            isAiPending ? 'bg-amber-50 border-amber-200' : `${colors.bg} ${colors.border}`
                          }`}>
                            <span className={`text-[9px] font-extrabold tracking-wide uppercase leading-none ${isAiPending ? 'text-amber-600' : colors.text}`}>
                              {d.toLocaleDateString([], { month: 'short' })}
                            </span>
                            <span className={`text-xs font-black leading-none mt-0.5 ${isAiPending ? 'text-amber-700' : colors.text}`}>{d.getDate()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 truncate transition-colors">{event.title}</p>
                            <p className="text-[10px] font-semibold text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>{du === 0 ? 'Today' : du === 1 ? 'Tomorrow' : `in ${du} days`}</span>
                              {isAiPending && <span className="text-amber-500 font-extrabold">⏳ Pending</span>}
                              {event.priority === 'high' && !isAiPending && <span className="text-red-500 font-extrabold">🚨 HIGH</span>}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {events.length === 0 && (
            <EmptyState
              icon="📅"
              title="No active workspace events found"
              description="Contextual pipeline triggers extracted from WhatsApp will populate here automatically. You can also add events manually."
            />
          )}

        </div>
      </div>

      <EventModal
        open={modalOpen}
        event={editingEvent}
        onClose={() => setModalOpen(false)}
        onSave={() => refetch()}
        onDelete={() => refetch()}
        token={token ?? undefined}
      />
    </div>
  )
}
