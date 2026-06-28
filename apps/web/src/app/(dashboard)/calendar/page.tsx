'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string | null
  allDay: boolean
  eventType: string
  source: 'user' | 'ai_extracted'
  contact?: { id: string; name: string; avatarUrl: string | null }
}

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  meeting:      { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  birthday:     { bg: 'bg-pink-50 border-pink-200',    text: 'text-pink-800',    dot: 'bg-pink-500' },
  follow_up:    { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  deadline:     { bg: 'bg-red-50 border-red-200',      text: 'text-red-800',     dot: 'bg-red-500' },
  reminder:     { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-800',   dot: 'bg-amber-500' },
  default:      { bg: 'bg-gray-50 border-gray-200',    text: 'text-gray-700',    dot: 'bg-gray-400' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function MonthGrid({
  year,
  month,
  events,
  selectedDate,
  onSelectDate,
}: {
  year: number
  month: number
  events: CalendarEvent[]
  selectedDate: Date | null
  onSelectDate: (d: Date) => void
}) {
  const today = new Date()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const eventsByDay = useMemo(() => {
    const map: Record<number, number> = {}
    events.forEach(e => {
      const d = new Date(e.startDate).getDate()
      const em = new Date(e.startDate).getMonth()
      const ey = new Date(e.startDate).getFullYear()
      if (em === month && ey === year) {
        map[d] = (map[d] ?? 0) + 1
      }
    })
    return map
  }, [events, month, year])

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />
          const date = new Date(year, month, day)
          const isToday = isSameDay(date, today)
          const isSelected = selectedDate && isSameDay(date, selectedDate)
          const count = eventsByDay[day] ?? 0
          return (
            <button
              key={day}
              onClick={() => onSelectDate(date)}
              className={`relative flex flex-col items-center justify-start py-1.5 rounded-lg transition-colors min-h-[44px] ${
                isSelected ? 'bg-indigo-600' :
                isToday ? 'bg-indigo-50' :
                'hover:bg-gray-50'
              }`}
            >
              <span className={`text-sm font-medium leading-none ${
                isSelected ? 'text-white' :
                isToday ? 'text-indigo-600' :
                'text-gray-700'
              }`}>
                {day}
              </span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <span key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-indigo-400'}`} />
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

export default function CalendarPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(today)

  const { data, loading } = useApi<{ events: CalendarEvent[] }>('/api/calendar/events', token)
  const events = data?.events ?? []

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return events
      .filter(e => isSameDay(new Date(e.startDate), selectedDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }, [events, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter(e => new Date(e.startDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5)
  }, [events])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Calendar" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Calendar" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Month grid */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(today) }}
                className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
              >
                {MONTHS[viewMonth]} {viewYear}
              </button>
              <button
                onClick={nextMonth}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <MonthGrid
              year={viewYear}
              month={viewMonth}
              events={events}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          {/* Selected date events */}
          {selectedDate && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {isSameDay(selectedDate, today) ? 'Today' : selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No events on this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(event => {
                    const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
                    return (
                      <div key={event.id} className={`rounded-lg border p-3 ${colors.bg}`}>
                        <div className="flex items-start gap-3">
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm font-medium ${colors.text}`}>{event.title}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.startDate, event.allDay)}</span>
                            </div>
                            {event.description && (
                              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{event.description}</p>
                            )}
                            {event.contact && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <Avatar name={event.contact.name} src={event.contact.avatarUrl ?? undefined} size="xs" />
                                <Link href={`/contacts/${event.contact.id}`} className={`text-xs font-medium hover:underline ${colors.text}`}>
                                  {event.contact.name}
                                </Link>
                              </div>
                            )}
                            {event.source === 'ai_extracted' && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 mt-1.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                AI extracted
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming */}
          {upcomingEvents.length > 0 && !isSameDay(selectedDate ?? new Date(0), today) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming</p>
              <div className="space-y-2">
                {upcomingEvents.map(event => {
                  const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
                  const d = new Date(event.startDate)
                  return (
                    <button
                      key={event.id}
                      onClick={() => { setSelectedDate(d); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }}
                      className="w-full text-left flex items-center gap-3 py-2 hover:bg-gray-50 rounded-lg px-1 transition-colors"
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${colors.bg} flex flex-col items-center justify-center`}>
                        <span className={`text-[10px] font-bold leading-none ${colors.text}`}>{d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</span>
                        <span className={`text-xs font-bold leading-none mt-0.5 ${colors.text}`}>{d.getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                        <p className="text-xs text-gray-400">{formatTime(event.startDate, event.allDay)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {events.length === 0 && (
            <EmptyState
              icon="📅"
              title="No events yet"
              description="Events extracted from your conversations appear here. Zuri detects meetings, deadlines, and reminders automatically."
            />
          )}
        </div>
      </div>
    </div>
  )
}
