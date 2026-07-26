'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle, 
  Plus, Users, MessageSquare, ChevronLeft, ChevronRight, Check,
  Trash2, X, Sparkles, AlertCircle, Phone, Send, ShieldCheck, RefreshCw,
  MapPin, Video, DollarSign, Tag, ListTodo, ExternalLink, ArrowUpRight,
  Heart, Zap, ChevronDown, ChevronUp, Edit3, Filter, CheckSquare
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActionItem {
  id?: string
  text: string
  done: boolean
}

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
  confidenceScore?: number
  isOverdue?: boolean
  promiseStatus?: 'pending' | 'fulfilled' | 'broken' | 'dismissed'
  promisedBy?: 'user' | 'contact'
  sendWaReminder?: boolean
  waReminderOffsetMinutes?: number
  waReminderStatus?: 'none' | 'scheduled' | 'sent' | 'failed'
  location?: string | null
  meetingLink?: string | null
  dealValue?: number | null
  tags?: string[]
  actionItems?: ActionItem[]
  metadata?: Record<string, unknown>
  contact?: {
    id: string
    name: string
    avatarUrl: string | null
    phone?: string | null
    company?: string | null
    relationshipType?: string
    healthScore?: number
  }
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
  location: string
  meetingLink: string
  dealValue: string
  tagsInput: string
  actionItems: ActionItem[]
}

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

// ─── Date Parsing & Timezone Helpers ─────────────────────────────────────────

function parseEventDate(iso: string | Date | null | undefined): Date {
  if (!iso) return new Date()
  if (typeof iso === 'object') return iso
  const str = String(iso)
  // Cleanly extract YYYY-MM-DD from ISO or date string
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const y = Number(match[1])
    const m = Number(match[2])
    const d = Number(match[3])
    if (y && m && d) {
      return new Date(y, m - 1, d)
    }
  }
  return new Date(iso)
}

function isSameDay(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
  if (!a || !b) return false
  const dateA = typeof a === 'string' ? parseEventDate(a) : a
  const dateB = typeof b === 'string' ? parseEventDate(b) : b
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return 'All day'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '10:00 AM'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_STYLES: Record<string, { bg: string; text: string; dot: string; border: string; badgeBg: string; badgeText: string; gradient: string }> = {
  promise:     { bg: 'bg-amber-50/90',   text: 'text-amber-950',   dot: 'bg-amber-500',   border: 'border-amber-200/90',   badgeBg: 'bg-amber-100',   badgeText: 'text-amber-900', gradient: 'from-amber-50/90 via-white to-orange-50/40' },
  meeting:     { bg: 'bg-indigo-50/90',  text: 'text-indigo-950',  dot: 'bg-indigo-500',  border: 'border-indigo-200/90',  badgeBg: 'bg-indigo-100',  badgeText: 'text-indigo-900', gradient: 'from-indigo-50/90 via-white to-blue-50/40' },
  birthday:    { bg: 'bg-pink-50/90',    text: 'text-pink-950',    dot: 'bg-pink-500',    border: 'border-pink-200/90',    badgeBg: 'bg-pink-100',    badgeText: 'text-pink-900', gradient: 'from-pink-50/90 via-white to-rose-50/40' },
  follow_up:   { bg: 'bg-sky-50/90',     text: 'text-sky-950',     dot: 'bg-sky-500',     border: 'border-sky-200/90',     badgeBg: 'bg-sky-100',     badgeText: 'text-sky-900', gradient: 'from-sky-50/90 via-white to-cyan-50/40' },
  deadline:    { bg: 'bg-red-50/90',     text: 'text-red-950',     dot: 'bg-red-500',     border: 'border-red-200/90',     badgeBg: 'bg-red-100',     badgeText: 'text-red-900', gradient: 'from-red-50/90 via-white to-amber-50/40' },
  reminder:    { bg: 'bg-amber-50/90',   text: 'text-amber-950',   dot: 'bg-amber-500',   border: 'border-amber-200/90',   badgeBg: 'bg-amber-100',   badgeText: 'text-amber-900', gradient: 'from-amber-50/90 via-white to-yellow-50/40' },
  appointment: { bg: 'bg-teal-50/90',    text: 'text-teal-950',    dot: 'bg-teal-500',    border: 'border-teal-200/90',    badgeBg: 'bg-teal-100',    badgeText: 'text-teal-900', gradient: 'from-teal-50/90 via-white to-emerald-50/40' },
  anniversary: { bg: 'bg-rose-50/90',    text: 'text-rose-950',    dot: 'bg-rose-500',    border: 'border-rose-200/90',    badgeBg: 'bg-rose-100',    badgeText: 'text-rose-900', gradient: 'from-rose-50/90 via-white to-pink-50/40' },
  travel:      { bg: 'bg-blue-50/90',    text: 'text-blue-950',    dot: 'bg-blue-500',    border: 'border-blue-200/90',    badgeBg: 'bg-blue-100',    badgeText: 'text-blue-900', gradient: 'from-blue-50/90 via-white to-sky-50/40' },
  celebration: { bg: 'bg-purple-50/90',  text: 'text-purple-950',  dot: 'bg-purple-500',  border: 'border-purple-200/90',  badgeBg: 'bg-purple-100',  badgeText: 'text-purple-900', gradient: 'from-purple-50/90 via-white to-indigo-50/40' },
  job_change:  { bg: 'bg-emerald-50/90', text: 'text-emerald-950', dot: 'bg-emerald-500', border: 'border-emerald-200/90', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-900', gradient: 'from-emerald-50/90 via-white to-teal-50/40' },
  default:     { bg: 'bg-slate-50/90',   text: 'text-slate-950',   dot: 'bg-slate-500',   border: 'border-slate-200/90',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-900', gradient: 'from-slate-50/90 via-white to-gray-50/40' },
}

const EVENT_TYPE_OPTIONS = [
  { value: 'meeting',     label: 'Meeting / Call' },
  { value: 'follow_up',  label: 'Follow-up' },
  { value: 'deadline',   label: 'Deadline / Promise' },
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

// ─── Interactive Event Card Component ───────────────────────────────────────

function EventCard({
  event,
  onConfirm,
  onFulfillPromise,
  onDismissPromise,
  onEdit,
  onToggleActionItem,
  token,
}: {
  event: CalendarEvent
  onConfirm: (id: string) => void
  onFulfillPromise: (id: string) => void
  onDismissPromise: (id: string) => void
  onEdit: (event: CalendarEvent) => void
  onToggleActionItem: (eventId: string, itemIdx: number) => void
  token?: string
}) {
  const styles = EVENT_STYLES[event.eventType] ?? EVENT_STYLES.default
  const isAiPending = event.source === 'ai_extracted' && !event.isConfirmed
  const isPromise = event.eventType === 'promise'

  return (
    <div
      className={`group relative rounded-2xl md:rounded-3xl border p-3.5 md:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl bg-gradient-to-br ${styles.gradient} ${
        event.isOverdue ? 'border-red-300 ring-2 ring-red-400/30 bg-red-50/50' :
        isAiPending ? 'border-dashed border-amber-300 shadow-sm bg-amber-50/40' :
        `${styles.border} shadow-sm`
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 md:gap-3 min-w-0">
          {/* Contact Avatar */}
          {event.contact ? (
            <div className="relative shrink-0 mt-0.5">
              <Avatar
                name={event.contact.name}
                src={event.contact.avatarUrl ?? undefined}
                size="md"
              />
              {event.contact.healthScore !== undefined && (
                <span className={`absolute -bottom-1 -right-1 text-[9px] font-black px-1 rounded-full border border-white text-white ${
                  event.contact.healthScore >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}>
                  {event.contact.healthScore}
                </span>
              )}
            </div>
          ) : (
            <div className={`w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center shrink-0 ${styles.badgeBg} ${styles.badgeText} font-bold text-xs shadow-xs mt-0.5`}>
              <CalendarIcon size={16} />
            </div>
          )}

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[9px] md:text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles.badgeBg} ${styles.badgeText} ${styles.border}`}>
                {event.eventType}
              </span>

              {event.isOverdue && (
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse shadow-2xs">
                  🚨 OVERDUE
                </span>
              )}

              {isAiPending && (
                <span className="text-[9px] md:text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles size={10} className="text-amber-600 animate-spin" />
                  AI Suggested ({Math.round((event.confidenceScore || 0.9) * 100)}%)
                </span>
              )}

              {event.dealValue && (
                <span className="text-[9px] md:text-[10px] font-extrabold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs">
                  <DollarSign size={10} />
                  {event.dealValue.toLocaleString()} Deal
                </span>
              )}
            </div>

            <h3 className="text-sm md:text-base font-bold text-gray-950 leading-snug group-hover:text-indigo-600 transition-colors">
              {event.title}
            </h3>

            {event.contact && (
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 pt-0.5">
                <span>👤 {event.contact.name}</span>
                {event.contact.company && <span className="text-gray-400">· {event.contact.company}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Time & Quick Edit */}
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="text-xs font-bold text-gray-800 bg-white/90 border border-gray-200 px-2 py-0.5 md:px-2.5 md:py-1 rounded-xl shadow-2xs flex items-center gap-1">
            <Clock size={11} className="text-indigo-600" />
            {formatTime(event.startDate, event.allDay)}
          </span>

          <button
            onClick={() => onEdit(event)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-colors"
            title="Edit event details"
          >
            <Edit3 size={14} />
          </button>
        </div>
      </div>

      {/* Description / Context Note */}
      {event.description && (
        <p className="mt-2 text-xs text-gray-700 font-medium leading-relaxed bg-white/70 p-2.5 rounded-xl border border-black/5">
          {event.description}
        </p>
      )}

      {/* Metadata Pills Row (Location, Virtual Link, Tags) */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-xs">
        {event.meetingLink && (
          <a
            href={event.meetingLink.startsWith('http') ? event.meetingLink : `https://${event.meetingLink}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs transition-all"
          >
            <Video size={11} />
            Join Call
            <ExternalLink size={10} />
          </a>
        )}

        {event.location && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/90 border border-gray-200 text-gray-800 font-semibold text-[11px] shadow-2xs">
            <MapPin size={11} className="text-red-500" />
            {event.location}
          </span>
        )}

        {event.tags && event.tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-700 font-bold text-[10px] border border-gray-200/80">
            <Tag size={9} />
            #{tag}
          </span>
        ))}
      </div>

      {/* Interactive Action Items Checklist */}
      {event.actionItems && event.actionItems.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-black/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <ListTodo size={10} />
              Preparation ({event.actionItems.filter(a => a.done).length}/{event.actionItems.length})
            </span>
          </div>

          <div className="space-y-1">
            {event.actionItems.map((item, idx) => (
              <label
                key={idx}
                className="flex items-center gap-2 text-xs font-medium text-gray-800 hover:bg-white/80 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => onToggleActionItem(event.id, idx)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span className={item.done ? 'line-through text-gray-400' : ''}>{item.text}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Action Footer Bar */}
      <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {event.contact && (
            <Link
              href={`/inbox?contactId=${event.contact.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/90 hover:bg-white border border-gray-200 text-gray-800 font-bold text-xs transition-all shadow-2xs"
            >
              <MessageSquare size={11} className="text-emerald-600" />
              Chat on WhatsApp
            </Link>
          )}

          {event.sendWaReminder && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-[10px]">
              <MessageSquare size={9} />
              WA Reminder Set
            </span>
          )}
        </div>

        {/* State Action Buttons */}
        <div className="flex items-center gap-1.5">
          {isAiPending && (
            <button
              onClick={() => onConfirm(event.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all"
            >
              <Check size={11} />
              Confirm
            </button>
          )}

          {isPromise && event.promiseStatus === 'pending' && (
            <>
              <button
                onClick={() => onFulfillPromise(event.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all"
              >
                <CheckCircle2 size={11} />
                Fulfilled
              </button>
              <button
                onClick={() => onDismissPromise(event.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white/80 hover:bg-white text-gray-600 font-semibold text-xs border border-gray-200 transition-all"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Event Modal Component ──────────────────────────────────────────────────

function EventModal({
  open, event, initialDate, onClose, onSave, token,
}: {
  open: boolean
  event: CalendarEvent | null
  initialDate?: Date | null
  onClose: () => void
  onSave: (savedDateStr: string) => void
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
    sendWaReminder: true,
    waReminderOffsetMinutes: 60,
    location: '',
    meetingLink: '',
    dealValue: '',
    tagsInput: '',
    actionItems: [],
  }

  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; avatarUrl: string | null }>>([])
  const [newItemText, setNewItemText] = useState('')

  useEffect(() => {
    if (open) {
      apiClient<{ contacts: Array<{ id: string; name: string; avatarUrl: string | null }> }>('/api/contacts', { token })
        .then(res => setContacts(res.contacts || []))
        .catch(() => {})

      if (event) {
        const rawDateStr = event.startDate ? event.startDate.slice(0, 10) : toLocalDateStr(new Date())
        let rawTimeStr = '10:00'
        if (event.startDate && event.startDate.includes('T')) {
          const timePart = event.startDate.split('T')[1]
          if (timePart && timePart.length >= 5) {
            rawTimeStr = timePart.slice(0, 5)
          }
        }

        setForm({
          title: event.title,
          description: event.description || '',
          eventType: event.eventType || 'meeting',
          eventDate: rawDateStr,
          eventTime: rawTimeStr,
          allDay: event.allDay,
          contactId: event.contact?.id || '',
          sendWaReminder: event.sendWaReminder || false,
          waReminderOffsetMinutes: event.waReminderOffsetMinutes || 60,
          location: event.location || '',
          meetingLink: event.meetingLink || '',
          dealValue: event.dealValue ? String(event.dealValue) : '',
          tagsInput: event.tags ? event.tags.join(', ') : '',
          actionItems: event.actionItems || [],
        })
      } else {
        setForm({
          ...emptyForm,
          eventDate: initialDate ? toLocalDateStr(initialDate) : toLocalDateStr(new Date()),
        })
      }
    }
  }, [open, event, initialDate, token])

  const set = (key: keyof EventFormData, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  const handleAddActionItem = () => {
    if (!newItemText.trim()) return
    setForm(f => ({
      ...f,
      actionItems: [...f.actionItems, { text: newItemText.trim(), done: false }],
    }))
    setNewItemText('')
  }

  const handleRemoveActionItem = (idx: number) => {
    setForm(f => ({
      ...f,
      actionItems: f.actionItems.filter((_, i) => i !== idx),
    }))
  }

  const handleSave = async () => {
    if (!form.title.trim()) { addToast({ variant: 'error', title: 'Title is required' }); return }
    setSaving(true)
    try {
      const tags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || null,
        eventType: form.eventType,
        contactId: form.contactId || null,
        sendWaReminder: form.sendWaReminder,
        waReminderOffsetMinutes: form.waReminderOffsetMinutes,
        location: form.location || null,
        meetingLink: form.meetingLink || null,
        dealValue: form.dealValue ? parseFloat(form.dealValue) : null,
        tags,
        actionItems: form.actionItems,
        eventDate: form.eventDate,
      }

      if (!form.allDay && form.eventTime) {
        body.eventDatetime = `${form.eventDate}T${form.eventTime}:00`
      }

      if (isEdit && event) {
        await apiClient(`/api/calendar/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(body), token })
        addToast({ variant: 'success', title: 'Schedule item updated' })
      } else {
        await apiClient('/api/calendar/events', { method: 'POST', body: JSON.stringify(body), token })
        addToast({ variant: 'success', title: 'Schedule item created' })
      }
      onSave(form.eventDate)
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
      addToast({ variant: 'success', title: 'Schedule item deleted' })
      onSave(form.eventDate)
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
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-right duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50">
          <div>
            <h2 className="text-base font-bold text-gray-950">{isEdit ? 'Edit Schedule Item' : 'New Schedule Item'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Add rich metadata, checklists, and automated reminders</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 shadow-2xs">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Contract Sign-off Call for 50x Units"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Associated Contact</label>
            <select
              value={form.contactId}
              onChange={e => set('contactId', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all"
            >
              <option value="">-- No Contact Attached --</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Type</label>
              <select
                value={form.eventType}
                onChange={e => set('eventType', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all"
              >
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Date</label>
                <button
                  type="button"
                  onClick={() => set('allDay', !form.allDay)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 cursor-pointer"
                >
                  <span className={`relative w-6 h-3 rounded-full transition-colors flex-shrink-0 ${form.allDay ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${form.allDay ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  All day
                </button>
              </div>
              <input
                type="date"
                value={form.eventDate}
                onChange={e => set('eventDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all"
              />
            </div>
          </div>

          {!form.allDay && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Time</label>
              <input
                type="time"
                value={form.eventTime}
                onChange={e => set('eventTime', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all"
              />
            </div>
          )}

          {/* Location & Virtual Meeting Link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                <MapPin size={11} className="text-red-500" /> Location
              </label>
              <input
                type="text"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Office / Cape Town"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                <Video size={11} className="text-indigo-600" /> Virtual Link
              </label>
              <input
                type="text"
                value={form.meetingLink}
                onChange={e => set('meetingLink', e.target.value)}
                placeholder="e.g. meet.google.com/abc"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 font-medium"
              />
            </div>
          </div>

          {/* Deal Value & Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                <DollarSign size={11} className="text-emerald-600" /> Deal Value ($)
              </label>
              <input
                type="number"
                value={form.dealValue}
                onChange={e => set('dealValue', e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                <Tag size={11} className="text-purple-600" /> Tags
              </label>
              <input
                type="text"
                value={form.tagsInput}
                onChange={e => set('tagsInput', e.target.value)}
                placeholder="Contract, VIP"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50/50 font-medium"
              />
            </div>
          </div>

          {/* Preparation Checklist */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide flex items-center gap-1">
              <ListTodo size={11} className="text-indigo-600" /> Preparation Checklist
            </label>
            <div className="space-y-2">
              {form.actionItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                  <span>{item.text}</span>
                  <button onClick={() => handleRemoveActionItem(idx)} className="text-gray-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  placeholder="Add preparation item…"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddActionItem())}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-gray-50/50"
                />
                <button type="button" onClick={handleAddActionItem} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-xl">
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* WhatsApp Reminder Toggle */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-emerald-600" />
                <span className="text-xs font-bold text-emerald-950">WhatsApp Auto-Reminder</span>
              </div>
              <button
                type="button"
                onClick={() => set('sendWaReminder', !form.sendWaReminder)}
                className={`relative w-8 h-4 rounded-full transition-colors ${form.sendWaReminder ? 'bg-emerald-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.sendWaReminder ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {form.sendWaReminder && (
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-emerald-800 mb-1">Send Reminder</label>
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
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Context Notes</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Commitment context, quotation details, or agenda…"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium transition-all resize-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
          {isEdit ? (
            <button onClick={handleDelete} disabled={deleting} className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl transition-all">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-4 py-2 rounded-xl border border-gray-200 bg-white">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Calendar Page Component ─────────────────────────────────────────────

export default function CalendarPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()
  const today = useMemo(() => new Date(), [])

  const [view, setView] = useState<CalendarView>('month')
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [activeFilter, setActiveFilter] = useState<'all' | 'promises' | 'ai' | 'overdue'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  const { data, loading, refetch } = useApi<{ events: CalendarEvent[] }>('/api/calendar/events', token)
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    if (data?.events) setEvents(data.events)
  }, [data])

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
      .filter(e => isSameDay(e.startDate, selectedDate))
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

  const handleConfirm = async (id: string) => {
    try {
      await apiClient(`/api/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify({ isConfirmed: true }), token: token ?? undefined })
      addToast({ variant: 'success', title: 'Schedule item confirmed!' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to confirm item' })
    }
  }

  const handleFulfillPromise = async (id: string) => {
    try {
      await apiClient(`/api/calendar/promises/${id}/fulfill`, { method: 'PATCH', token: token ?? undefined })
      addToast({ variant: 'success', title: 'Promise marked fulfilled! 🎉' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to update promise' })
    }
  }

  const handleDismissPromise = async (id: string) => {
    try {
      await apiClient(`/api/calendar/promises/${id}`, { method: 'DELETE', token: token ?? undefined })
      addToast({ variant: 'success', title: 'Promise dismissed' })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to dismiss promise' })
    }
  }

  const handleToggleActionItem = async (eventId: string, itemIdx: number) => {
    const ev = events.find(e => e.id === eventId)
    if (!ev || !ev.actionItems) return

    const updatedItems = ev.actionItems.map((item, idx) =>
      idx === itemIdx ? { ...item, done: !item.done } : item
    )

    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, actionItems: updatedItems } : e))

    try {
      await apiClient(`/api/calendar/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ actionItems: updatedItems }),
        token: token ?? undefined,
      })
    } catch {
      refetch()
    }
  }

  const openAddModal = (date?: Date) => {
    setEditingEvent(null)
    setSelectedDate(date || today)
    setModalOpen(true)
  }

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event)
    setModalOpen(true)
  }

  const handleSavedEvent = (savedDateStr: string) => {
    const targetDate = parseEventDate(savedDateStr)
    setSelectedDate(targetDate)
    setViewYear(targetDate.getFullYear())
    setViewMonth(targetDate.getMonth())
    setActiveFilter('all')
    refetch()
  }

  // Mobile horizontal week strip days (14 days centered around selectedDate)
  const mobileStripDays = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate) : new Date()
    const days: Date[] = []
    for (let i = -6; i <= 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      days.push(d)
    }
    return days
  }, [selectedDate])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <PageHeader title="Calendar Intelligence" />
        <div className="p-6 space-y-4 max-w-6xl mx-auto w-full"><SkeletonCard /><SkeletonCard /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 pb-20 md:pb-6">
      <PageHeader
        title="Calendar & Promises"
        description="Unified temporal intelligence center tracking meetings, deal commitments, and relationship deadlines."
      />

      <div className="flex-1 overflow-y-auto p-3.5 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto w-full">

        {/* Hero Control & Stats Bar */}
        <div className="rounded-2xl md:rounded-3xl bg-white border border-gray-200/80 shadow-xs p-4 md:p-6 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg md:text-2xl font-black text-gray-950 flex items-center gap-2">
              <CalendarIcon size={22} className="text-indigo-600" />
              Relationship Control Center
            </h2>
            <p className="text-xs font-medium text-gray-500">
              {events.length} schedule items tracked · {overdueCount > 0 ? `${overdueCount} overdue commitments` : 'All commitments on track'}
            </p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* View Switcher */}
            <div className="flex items-center bg-gray-100 p-1 rounded-2xl border border-gray-200/80">
              {(['month', 'week', 'day', 'agenda'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 md:px-3.5 md:py-1.5 text-[11px] md:text-xs font-extrabold rounded-xl uppercase tracking-wider transition-all ${
                    view === v ? 'bg-white text-indigo-600 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => openAddModal()}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 md:px-4 md:py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.02]"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Add Schedule Item</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 no-scrollbar">
          {([
            { id: 'all', label: 'All Items' },
            { id: 'promises', label: `🤝 Promises (${promiseCount})` },
            { id: 'overdue', label: `🔴 Overdue (${overdueCount})` },
            { id: 'ai', label: `⚡ AI Extracted (${aiCount})` },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 md:px-3.5 md:py-2 text-xs font-bold rounded-2xl border transition-all whitespace-nowrap ${
                activeFilter === f.id
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* MOBILE HORIZONTAL DATE STRIP (Visible on Mobile < 768px when Month View is selected) */}
        {view === 'month' && (
          <div className="block md:hidden bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-gray-950">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} className="p-1 rounded-lg border bg-gray-50 text-gray-600"><ChevronLeft size={16} /></button>
                <button onClick={nextMonth} className="p-1 rounded-lg border bg-gray-50 text-gray-600"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {mobileStripDays.map((d, idx) => {
                const isSelected = isSameDay(d, selectedDate)
                const isTod = isSameDay(d, today)
                const count = filteredEvents.filter(e => isSameDay(e.startDate, d)).length
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedDate(d)
                      setViewMonth(d.getMonth())
                      setViewYear(d.getFullYear())
                    }}
                    className={`flex flex-col items-center justify-center min-w-[48px] py-2 px-1.5 rounded-2xl border transition-all shrink-0 ${
                      isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30' :
                      isTod ? 'bg-indigo-50 text-indigo-900 border-indigo-200 font-black' :
                      'bg-gray-50/80 text-gray-700 border-gray-200/80'
                    }`}
                  >
                    <span className={`text-[10px] font-extrabold uppercase ${isSelected ? 'text-indigo-100' : 'text-gray-400'}`}>
                      {DAYS[d.getDay()]}
                    </span>
                    <span className="text-sm font-black mt-0.5">{d.getDate()}</span>
                    {count > 0 && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-indigo-600'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Main Month Layout */}
        {view === 'month' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 items-start">
            {/* Desktop Month Grid */}
            <div className="hidden md:block lg:col-span-2 rounded-3xl border border-gray-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
                <button onClick={prevMonth} className="p-1.5 rounded-xl hover:bg-white text-gray-600 shadow-2xs"><ChevronLeft size={20} /></button>
                <span className="text-base font-black text-gray-950">{MONTHS[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} className="p-1.5 rounded-xl hover:bg-white text-gray-600 shadow-2xs"><ChevronRight size={20} /></button>
              </div>

              {/* Day Labels */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => <div key={d} className="text-center text-[11px] font-extrabold text-gray-400 uppercase tracking-wider py-1">{d}</div>)}
              </div>

              {/* Month Cells */}
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: new Date(viewYear, viewMonth, 1).getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: new Date(viewYear, viewMonth + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
                  const date = new Date(viewYear, viewMonth, day)
                  const isToday = isSameDay(date, today)
                  const isSelected = selectedDate && isSameDay(date, selectedDate)
                  const dayEvents = filteredEvents.filter(e => isSameDay(e.startDate, date))
                  const hasOverdue = dayEvents.some(e => e.isOverdue)

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(date)}
                      onDoubleClick={() => openAddModal(date)}
                      className={`relative flex flex-col items-start p-2 rounded-2xl border min-h-[82px] transition-all text-left ${
                        isSelected ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/40 shadow-xs' :
                        isToday ? 'bg-indigo-50/30 border-indigo-300' :
                        hasOverdue ? 'bg-red-50/30 border-red-300' : 'border-gray-100 hover:bg-gray-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-black ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>{day}</span>
                        {dayEvents.length > 0 && (
                          <span className="text-[9px] font-extrabold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Day Event Micro-Cards */}
                      <div className="w-full space-y-1 mt-1.5">
                        {dayEvents.slice(0, 2).map(e => (
                          <div
                            key={e.id}
                            className={`flex items-center gap-1 text-[9px] font-extrabold truncate px-1.5 py-0.5 rounded-lg border shadow-2xs ${
                              e.isOverdue ? 'bg-red-600 text-white border-red-700 animate-pulse' :
                              e.eventType === 'promise' ? 'bg-amber-100 text-amber-950 border-amber-200' :
                              'bg-indigo-100 text-indigo-950 border-indigo-200'
                            }`}
                          >
                            {e.contact && (
                              <Avatar name={e.contact.name} src={e.contact.avatarUrl ?? undefined} size="xs" />
                            )}
                            <span className="truncate">{e.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[9px] font-bold text-gray-400 pl-1 block">+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selected Date Detail Panel / Mobile Agenda Panel */}
            <div className="rounded-2xl md:rounded-3xl border border-gray-200 bg-white p-4 md:p-5 shadow-xs space-y-4 lg:col-span-1">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {selectedDate ? selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Agenda'}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedEvents.length} scheduled item{selectedEvents.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => openAddModal(selectedDate || undefined)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl transition-all"
                >
                  + Add Item
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <p className="text-sm font-bold text-gray-400">Clear slate for this date</p>
                  <p className="text-xs text-gray-400">Click "+ Add Item" above to schedule an event</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(e => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onConfirm={handleConfirm}
                      onFulfillPromise={handleFulfillPromise}
                      onDismissPromise={handleDismissPromise}
                      onEdit={openEditModal}
                      onToggleActionItem={handleToggleActionItem}
                      token={token ?? undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agenda View */}
        {view === 'agenda' && (
          <div className="rounded-2xl md:rounded-3xl border border-gray-200 bg-white p-4 md:p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-gray-950">Chronological Relationship Timeline</h3>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">No matching agenda items found</div>
            ) : (
              <div className="space-y-3.5">
                {filteredEvents.map(e => (
                  <EventCard
                    key={e.id}
                    event={e}
                    onConfirm={handleConfirm}
                    onFulfillPromise={handleFulfillPromise}
                    onDismissPromise={handleDismissPromise}
                    onEdit={openEditModal}
                    onToggleActionItem={handleToggleActionItem}
                    token={token ?? undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Week / Day Timeline Grid View */}
        {(view === 'day' || view === 'week') && (
          <div className="rounded-2xl md:rounded-3xl border border-gray-200 bg-white p-6 md:p-8 text-center space-y-3 shadow-xs">
            <Clock size={28} className="mx-auto text-indigo-600" />
            <h3 className="text-base font-bold text-gray-950">{view.toUpperCase()} Timeline Overview</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
              Full vertical hourly timeline. Use Month or Agenda view for detailed interactive cards.
            </p>
            <button onClick={() => setView('month')} className="text-xs font-bold text-indigo-600 hover:underline">
              Switch to Month View
            </button>
          </div>
        )}

      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => openAddModal()}
        className="fixed bottom-6 right-6 md:hidden z-40 w-14 h-14 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-all"
        title="Add Schedule Item"
      >
        <Plus size={24} />
      </button>

      <EventModal
        open={modalOpen}
        event={editingEvent}
        initialDate={selectedDate || undefined}
        onClose={() => setModalOpen(false)}
        onSave={handleSavedEvent}
        token={token ?? undefined}
      />
    </div>
  )
}
