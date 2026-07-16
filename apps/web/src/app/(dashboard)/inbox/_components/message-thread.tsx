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

// Rough shapes of a real conversation — alternating sides, varied widths,
// the occasional two-line bubble — so the loading state reads as "your
// messages are on their way" rather than a generic grey rectangle grid.
const SKELETON_ROWS: { side: 'user' | 'contact'; width: number; lines: 1 | 2 }[] = [
  { side: 'contact', width: 190, lines: 1 },
  { side: 'user', width: 130, lines: 1 },
  { side: 'contact', width: 240, lines: 2 },
  { side: 'contact', width: 150, lines: 1 },
  { side: 'user', width: 200, lines: 1 },
  { side: 'contact', width: 170, lines: 1 },
]

const SHIMMER_BAR = 'h-2.5 rounded-full bg-gradient-to-r from-gray-300/70 via-gray-200/70 to-gray-300/70 bg-[length:200%_100%] animate-shimmer'

function ThreadLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-center pb-1">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm ring-1 ring-gray-200/70 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Loading conversation…
        </span>
      </div>
      {SKELETON_ROWS.map((row, i) => (
        <div key={i} className={`flex ${row.side === 'user' ? 'justify-end' : 'justify-start'} px-2`}>
          <div
            className={`space-y-1.5 px-3 py-2.5 rounded-lg shadow-[0_1px_1px_rgba(15,23,42,0.06)] border ${
              row.side === 'user' ? 'rounded-tr-none bg-[#dcf8c6]/40 border-[#cbeeb5]/50' : 'rounded-tl-none bg-white/70 border-gray-100'
            }`}
            style={{ width: row.width }}
          >
            <div className={SHIMMER_BAR} style={{ animationDelay: `${i * 90}ms` }} />
            {row.lines > 1 && (
              <div className={SHIMMER_BAR} style={{ width: '60%', animationDelay: `${i * 90 + 60}ms` }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
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
          <ThreadLoadingSkeleton />
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
