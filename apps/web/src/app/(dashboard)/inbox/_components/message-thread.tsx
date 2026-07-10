'use client'

import { RefObject, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { InlineAICard, type AIInsight } from './inline-ai-card'
import { MessageBubble, type InboxMessage } from './message-bubble'

function dayKey(ts: string) {
  return new Date(ts).toDateString()
}

function formatDateSeparator(ts: string) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function MessageThread({
  messages,
  loading,
  token,
  selectedMsgId,
  searchOpen,
  searchQuery,
  searchMatches,
  activeSearchIndex,
  messagesEndRef,
  timelineInsights,
  onSearchChange,
  onCloseSearch,
  onPrevSearch,
  onNextSearch,
  onSelectMessage,
}: {
  messages: InboxMessage[]
  loading: boolean
  token?: string | null
  selectedMsgId: string | null
  searchOpen: boolean
  searchQuery: string
  searchMatches: string[]
  activeSearchIndex: number
  messagesEndRef: RefObject<HTMLDivElement | null>
  timelineInsights: AIInsight[]
  onSearchChange: (value: string) => void
  onCloseSearch: () => void
  onPrevSearch: () => void
  onNextSearch: () => void
  onSelectMessage: (id: string) => void
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const activeMatchId = searchMatches[activeSearchIndex] ?? null

  useEffect(() => {
    if (!activeMatchId) return
    rowRefs.current[activeMatchId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeMatchId])

  const insightAfterId = useMemo(() => {
    if (!timelineInsights.length || messages.length < 2) return null
    const target = [...messages].reverse().find(m => m.senderType === 'contact')
    return target?.id ?? null
  }, [messages, timelineInsights.length])

  return (
    <div className="relative flex-1 min-h-0">
      {searchOpen && (
        <div className="absolute left-3 right-3 top-3 z-30 rounded-2xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search this conversation..."
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            <span className="text-[11px] font-medium text-gray-400 tabular-nums">
              {searchQuery.trim() ? `${searchMatches.length ? activeSearchIndex + 1 : 0}/${searchMatches.length}` : '0/0'}
            </span>
            <button onClick={onPrevSearch} disabled={!searchMatches.length} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30">
              <ChevronUp size={14} />
            </button>
            <button onClick={onNextSearch} disabled={!searchMatches.length} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30">
              <ChevronDown size={14} />
            </button>
            <button onClick={onCloseSearch} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className={`h-full overflow-y-auto px-4 py-4 space-y-2 z-10 relative ${searchOpen ? 'pt-20' : ''}`}>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`h-10 rounded-2xl animate-pulse bg-gray-200 ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1]
              const showDate = !prev || dayKey(prev.timestamp) !== dayKey(msg.timestamp)
              const showInsight = msg.id === insightAfterId && timelineInsights[0]

              return (
                <div
                  key={msg.id}
                  ref={node => {
                    rowRefs.current[msg.id] = node
                  }}
                >
                  {showDate && (
                    <div className="sticky top-2 z-10 my-3 flex justify-center pointer-events-none">
                      <span className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm ring-1 ring-gray-200/70 backdrop-blur">
                        {formatDateSeparator(msg.timestamp)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    msg={msg}
                    token={token}
                    selected={selectedMsgId === msg.id}
                    activeSearchMatch={activeMatchId === msg.id}
                    searchQuery={searchQuery}
                    onSelect={() => onSelectMessage(msg.id)}
                  />
                  {showInsight && (
                    <div className="py-2 px-2">
                      <InlineAICard insight={timelineInsights[0]} />
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  )
}
