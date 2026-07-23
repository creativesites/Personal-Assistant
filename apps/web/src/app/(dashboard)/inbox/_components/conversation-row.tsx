'use client'

import { TrendingUp, Clock, Users } from 'lucide-react'
import { Avatar } from '@/components/ui'
import type { Conversation } from '../_types/inbox'
import { AI_PRIORITY, SENTIMENT_DOT } from '../_lib/constants'
import { formatTime, formatSLA } from '../_lib/utils'

export function ConvRow({ conv, active, onClick, mode, syncing = false, analysing = false }: {
  conv: Conversation
  active: boolean
  onClick: () => void
  mode: string
  syncing?: boolean
  analysing?: boolean
}) {
  const priority = conv.aiPriority ? AI_PRIORITY[conv.aiPriority] : null
  const PIcon = priority?.icon
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-all border-l-[3px] ${
        active ? 'bg-indigo-50/80 border-indigo-500' : 'hover:bg-white/70 border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar name={conv.contact.name} src={conv.contact.avatarUrl ?? undefined} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-indigo-600 border-2 border-white rounded-full flex items-center justify-center">
            <span className="text-[8px] font-bold text-white px-0.5 leading-none">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          </span>
        )}
        {conv.sentiment && SENTIMENT_DOT[conv.sentiment] && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${SENTIMENT_DOT[conv.sentiment]}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={`flex items-center gap-1 min-w-0 text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {conv.contact.isGroup && <Users size={11} className="text-gray-400 flex-shrink-0" />}
            <span className="truncate">{conv.contact.name}</span>
          </span>
          <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <p className={`text-xs truncate mb-1.5 ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
          {conv.lastMessagePreview || 'No messages yet'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {priority && PIcon && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${priority.color}`}>
              <PIcon size={9} />
              {priority.label}
            </span>
          )}
          {conv.slaMinutes != null && conv.slaMinutes > 60 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${conv.slaMinutes > 480 ? 'text-red-500' : 'text-amber-500'}`}>
              <Clock size={9} />
              {formatSLA(conv.slaMinutes)}
            </span>
          )}
          {mode !== 'personal' && (conv.leadScore ?? 0) > 70 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
              <TrendingUp size={9} />
              {conv.leadScore}
            </span>
          )}
          {(conv.assignedToName || conv.assignedToEmail) && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md" title={`Assigned to ${conv.assignedToName || conv.assignedToEmail}`}>
              👤 {(conv.assignedToName || conv.assignedToEmail || '').split('@')[0]}
            </span>
          )}
          {conv.lockedBy && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md" title="Locked by active agent">
              🔒 In use
            </span>
          )}
          {syncing && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Syncing
            </span>
          )}
          {analysing && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              Analysing
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
