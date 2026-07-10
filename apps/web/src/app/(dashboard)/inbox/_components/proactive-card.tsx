'use client'

import type { ElementType } from 'react'
import { Calendar, Bell, CheckCircle, Star, Wand2 } from 'lucide-react'
import type { ProactiveSuggestion } from '../_types/inbox'

export function ProactiveCard({
  suggestion, onSend, onSnooze,
}: {
  suggestion: ProactiveSuggestion
  onSend: (draft: string | null) => void
  onSnooze: () => void
}) {
  const isUrgent = suggestion.priority <= 2
  const ICONS: Record<string, ElementType> = {
    birthday: Calendar, dormant: Bell, follow_up: Bell,
    promise: CheckCircle, milestone: Star, check_in: Bell,
  }
  const Icon = ICONS[suggestion.suggestionType] ?? Bell

  return (
    <div className={`rounded-xl p-3.5 border ${isUrgent ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-100'}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isUrgent ? 'bg-amber-100' : 'bg-indigo-100'}`}>
          <Icon size={13} className={isUrgent ? 'text-amber-600' : 'text-indigo-600'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-tight ${isUrgent ? 'text-amber-900' : 'text-indigo-900'}`}>{suggestion.title}</p>
          {suggestion.body && (
            <p className={`text-[11px] mt-0.5 leading-relaxed ${isUrgent ? 'text-amber-700' : 'text-indigo-700'}`}>{suggestion.body}</p>
          )}
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => onSend(suggestion.draftMessage)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${isUrgent ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              <Wand2 size={10} />
              Send Now
            </button>
            <button
              onClick={onSnooze}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${isUrgent ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-100'}`}
            >
              Snooze
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
