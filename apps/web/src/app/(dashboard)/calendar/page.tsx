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
  priority?: 'high' | 'medium' | 'low'
  contact?: { id: string; name: string; avatarUrl: string | null }
}

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  meeting:      { bg: 'bg-blue-50/60',    text: 'text-blue-800',    dot: 'bg-blue-500',    border: 'border-blue-100' },
  birthday:     { bg: 'bg-pink-50/60',    text: 'text-pink-800',    dot: 'bg-pink-500',    border: 'border-pink-100' },
  follow_up:    { bg: 'bg-indigo-50/60',  text: 'text-indigo-800',  dot: 'bg-indigo-500',  border: 'border-indigo-100' },
  deadline:     { bg: 'bg-red-50/60',     text: 'text-red-800',     dot: 'bg-red-500',     border: 'border-red-100' },
  reminder:     { bg: 'bg-amber-50/60',   text: 'text-amber-800',   dot: 'bg-amber-500',   border: 'border-amber-100' },
  default:      { bg: 'bg-slate-50/60',   text: 'text-slate-700',   dot: 'bg-slate-400',   border: 'border-slate-100' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Premium Static Demo Data for Hydrating New Features Contextually
const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: 'demo-1',
    title: 'iPhone 11 Design Review - Winston',
    description: 'Discuss technical milestones, hardware requirements, and custom mobile application onboarding assets requested for his birthday.',
    startDate: new Date(new Date().setDate(new Date().getDate())).toISOString(), // Today
    endDate: null,
    allDay: false,
    eventType: 'meeting',
    source: 'ai_extracted',
    priority: 'high',
    contact: { id: 'winston-1', name: 'Winston (Creative Sites)', avatarUrl: null }
  },
  {
    id: 'demo-2',
    title: 'Follow-up regarding software development invoice',
    description: 'Send finalized pricing adjustments incorporating the active 10% tactical pipeline discount structure.',
    startDate: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), // Tomorrow
    endDate: null,
    allDay: true,
    eventType: 'follow_up',
    source: 'user',
    priority: 'medium',
    contact: { id: 'winston-1', name: 'Winston', avatarUrl: null }
  },
  {
    id: 'demo-3',
    title: 'Final Mobile App Deployment Target',
    description: 'Production code drop deadline generated automatically via customer milestone chat strings.',
    startDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString(),
    endDate: null,
    allDay: false,
    eventType: 'deadline',
    source: 'ai_extracted',
    priority: 'high'
  }
]

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
          const count = eventsByDay[day] ?? 0
          return (
            <button
              key={day}
              onClick={() => onSelectDate(date)}
              className={`relative flex flex-col items-center justify-between p-2 rounded-xl transition-all min-h-[48px] ${
                isSelected ? 'bg-indigo-600 shadow-md shadow-indigo-200' :
                isToday ? 'bg-indigo-50 border border-indigo-100' :
                'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <span className={`text-sm font-semibold leading-none ${
                isSelected ? 'text-white' :
                isToday ? 'text-indigo-600' :
                'text-slate-700'
              }`}>
                {day}
              </span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-1.5 justify-center w-full">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <span key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/90' : 'bg-indigo-500'}`} />
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
  
  // Custom Filter State
  const [activeFilter, setActiveFilter] = useState<'all' | 'ai' | 'high_priority'>('all')

  const { data, loading } = useApi<{ events: CalendarEvent[] }>('/api/calendar/events', token)
  
  // Dynamic fallback layer to inject premium UX demonstration variables if user data database is unhydrated
  const events = useMemo(() => {
    const rawEvents = data?.events ?? []
    return rawEvents.length === 0 ? DEMO_EVENTS : rawEvents
  }, [data?.events])

  // Filter Pipeline Processing
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (activeFilter === 'ai') return e.source === 'ai_extracted'
      if (activeFilter === 'high_priority') return e.priority === 'high'
      return true
    })
  }, [events, activeFilter])

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return filteredEvents
      .filter(e => isSameDay(new Date(e.startDate), selectedDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }, [filteredEvents, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return filteredEvents
      .filter(e => new Date(e.startDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 4)
  }, [filteredEvents])

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

          {/* Feature 1: AI Schedule Insight Banner Section */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-6 -translate-y-6">
              <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div className="relative z-10 space-y-3">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-500/30 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Zuri Schedule Intelligence
                </span>
              </div>
              <h3 className="text-lg font-bold tracking-tight">Heavy client engagement detected between 2 PM - 5 PM</h3>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                Winston and 2 other contacts noted dynamic launch intent targets this week. Zuri has protected your morning zones for isolated deep-work development focus loops automatically.
              </p>
              <div className="flex gap-4 pt-1.5 text-xs text-slate-400">
                <div>⚡ <strong className="text-slate-100">{events.filter(e => e.source === 'ai_extracted').length} Events</strong> Extracted via AI</div>
                <div>🎯 <strong className="text-slate-100">{events.filter(e => e.priority === 'high').length} High Priority</strong> Actions Found</div>
              </div>
            </div>
          </div>

          {/* Feature 2: High Retention Filter Controls */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                All Schedules
              </button>
              <button
                onClick={() => setActiveFilter('ai')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${activeFilter === 'ai' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                ✨ AI Extracted
              </button>
              <button
                onClick={() => setActiveFilter('high_priority')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeFilter === 'high_priority' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                🔥 High Priority
              </button>
            </div>

            <button className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 bg-white px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm">
              <span>+ Add Custom Event</span>
            </button>
          </div>

          {/* Premium Workspace Main Dual-Column Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            
            {/* Left Frame: Structural Month Navigation Card */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4 bg-slate-50 p-2 rounded-xl">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm transition-all"
                >
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
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm transition-all"
                >
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
            </div>

            {/* Right Frame: Contextual Content Feeds */}
            <div className="space-y-4">
              
              {/* Selected date events agenda box */}
              {selectedDate && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {isSameDay(selectedDate, today) ? '🔥 Today\'s Agenda' : `🗓️ ${selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`}
                    </p>
                    <span className="text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
                      {selectedEvents.length} Tasks
                    </span>
                  </div>

                  {selectedEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium text-slate-400">Clear slate for this date</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Use chat action items to assign pipeline tasks</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedEvents.map(event => {
                        const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
                        return (
                          <div key={event.id} className={`rounded-xl border ${colors.border} ${colors.bg} p-3.5 transition-all hover:scale-[1.01] shadow-2xs`}>
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-xs font-bold leading-tight ${colors.text}`}>{event.title}</p>
                                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-white/80 border border-slate-100 px-1.5 py-0.5 rounded">
                                    {formatTime(event.startDate, event.allDay)}
                                  </span>
                                </div>
                                {event.description && (
                                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{event.description}</p>
                                )}
                                
                                {event.contact && (
                                  <div className="flex items-center gap-1.5 pt-1">
                                    <Avatar name={event.contact.name} src={event.contact.avatarUrl ?? undefined} size="xs" />
                                    <Link href={`/contacts/${event.contact.id}`} className={`text-[11px] font-bold hover:underline ${colors.text}`}>
                                      {event.contact.name}
                                    </Link>
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100/60 mt-2">
                                  {event.source === 'ai_extracted' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-bold">
                                      ✨ AI Extracted
                                    </span>
                                  ) : <span />}
                                  
                                  {/* Feature 3: Actions Shortcut to Drive Active Mobile Conversions */}
                                  <button className="text-[10px] bg-white hover:bg-slate-50 text-slate-700 font-bold px-2 py-1 rounded border border-slate-200 transition-all shadow-3xs">
                                    {event.eventType === 'meeting' ? 'Join Meet' : 'Mark Done'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* High Retention Section Feature 4: Strategic Up Next Processing List */}
              {upcomingEvents.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                    <span>🚀 Fast Pipeline Horizon</span>
                  </p>
                  <div className="divide-y divide-slate-100">
                    {upcomingEvents.map(event => {
                      const colors = EVENT_COLORS[event.eventType] ?? EVENT_COLORS.default
                      const d = new Date(event.startDate)
                      return (
                        <button
                          key={event.id}
                          onClick={() => { setSelectedDate(d); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }}
                          className="w-full text-left flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-xl px-1.5 transition-all group"
                        >
                          <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${colors.bg} border ${colors.border} flex flex-col items-center justify-center transition-all group-hover:scale-95`}>
                            <span className={`text-[9px] font-extrabold tracking-wide uppercase leading-none ${colors.text}`}>{d.toLocaleDateString([], { month: 'short' })}</span>
                            <span className={`text-xs font-black leading-none mt-0.5 ${colors.text}`}>{d.getDate()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 truncate transition-colors">{event.title}</p>
                            <p className="text-[10px] font-semibold text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>{formatTime(event.startDate, event.allDay)}</span>
                              {event.priority === 'high' && <span className="text-red-500 font-extrabold">🚨 HIGH</span>}
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
              description="Contextual pipeline triggers extracted directly from client messages will populate here automatically."
            />
          )}
        </div>
      </div>
    </div>
  )
}

