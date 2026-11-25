'use client'

import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X, StickyNote } from 'lucide-react'
import { InlineAICard, type AIInsight } from './inline-ai-card'
import { MessageBubble, type InboxMessage } from './message-bubble'
import { PinnedMessageBanner, type PinnedMessage } from './pinned-message-banner'

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
  onCardAction,
  onCardDismiss,
  lockInfo,
  onReply,
  onForward,
  onReact,
  onStar,
  onPin,
  onDelete,
  internalNotes,
  onMediaClick,
  conversationId,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onOpenMedia,
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
  onCardAction?: (insight: AIInsight) => void
  onCardDismiss?: (insight: AIInsight) => void
  lockInfo?: { lockedBy: string | null; lockedByName?: string } | null
  onReply?: (msg: InboxMessage) => void
  onForward?: (msg: InboxMessage) => void
  onReact?: (msgId: string, emoji: string) => void
  onStar?: (msgId: string) => void
  onPin?: (msgId: string) => void
  onDelete?: (msg: InboxMessage, deleteForEveryone: boolean) => void
  internalNotes?: Array<{ id: string; text: string; author: string; createdAt: string }>
  onMediaClick?: (item: { type: 'image' | 'video' | 'document'; url: string; title?: string }) => void
  /** Scroll position resets to the latest message only when this changes. */
  conversationId?: string | null
  hasMore?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  onOpenMedia?: (messageId: string) => void
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const activeMatchId = searchMatches[activeSearchIndex] ?? null
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      })
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior })
    }
  }

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const t1 = new Date(a.timestamp).getTime()
      const t2 = new Date(b.timestamp).getTime()
      if (t1 !== t2) return t1 - t2
      return a.id.localeCompare(b.id)
    })
  }, [messages])
  const sortedMessagesRef = useRef(sortedMessages)
  sortedMessagesRef.current = sortedMessages

  // Scroll behaviour, WhatsApp-style:
  //  - opening a conversation jumps to the latest message;
  //  - a new message scrolls into view only if you're already at the bottom
  //    or you sent it; otherwise the Bottom button counts it;
  //  - loading older history keeps your place.
  const nearBottomRef = useRef(true)
  const initialScrollFor = useRef<string | null>(null)
  const edgeIds = useRef<{ first: string | null; last: string | null }>({ first: null, last: null })
  const heightBeforePrepend = useRef<number | null>(null)
  const [unseenCount, setUnseenCount] = useState(0)

  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (loading || !el || messages.length === 0) return
    const sorted = sortedMessagesRef.current
    const first = sorted[0]?.id ?? null
    const last = sorted[sorted.length - 1]
    const prevEdges = edgeIds.current
    edgeIds.current = { first, last: last?.id ?? null }

    if (initialScrollFor.current !== (conversationId ?? '')) {
      initialScrollFor.current = conversationId ?? ''
      el.scrollTop = el.scrollHeight
      nearBottomRef.current = true
      setUnseenCount(0)
      return
    }
    if (heightBeforePrepend.current !== null && prevEdges.first !== first) {
      el.scrollTop += el.scrollHeight - heightBeforePrepend.current
      heightBeforePrepend.current = null
      return
    }
    if (last && prevEdges.last !== last.id) {
      if (nearBottomRef.current || last.senderType === 'user') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        setUnseenCount(n => n + 1)
      }
    }
  }, [loading, messages, conversationId])

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const distance = scrollHeight - scrollTop - clientHeight
    nearBottomRef.current = distance < 120
    setShowScrollBottom(distance > 120)
    if (distance < 120) setUnseenCount(0)
    if (scrollTop < 300 && hasMore && !loadingOlder && onLoadOlder && heightBeforePrepend.current === null) {
      heightBeforePrepend.current = scrollHeight
      onLoadOlder()
    }
  }

  // If a load-older request finishes without prepending anything, stop waiting for it.
  useEffect(() => {
    if (!loadingOlder && heightBeforePrepend.current !== null && edgeIds.current.first === sortedMessagesRef.current[0]?.id) {
      const t = setTimeout(() => { heightBeforePrepend.current = null }, 100)
      return () => clearTimeout(t)
    }
  }, [loadingOlder])

  useEffect(() => {
    if (!activeMatchId) return
    rowRefs.current[activeMatchId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeMatchId])

  const handleQuoteClick = (quotedId: string) => {
    const element = rowRefs.current[quotedId]
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMsgId(quotedId)
      setTimeout(() => {
        setHighlightedMsgId(null)
      }, 2000)
    }
  }



  const pinnedMessages: PinnedMessage[] = useMemo(() => {
    return sortedMessages
      .filter(m => m.isPinned)
      .map(m => ({
        id: m.id,
        body: m.body || '',
        senderDisplayName: m.senderDisplayName,
        senderType: m.senderType === 'user' ? 'user' : 'contact',
        messageType: m.messageType || 'text',
      }))
  }, [sortedMessages])

  const cardsByMessageId = useMemo(() => {
    const map: Record<string, AIInsight[]> = {}
    if (!timelineInsights.length || sortedMessages.length === 0) return map

    const contactMsgs = sortedMessages.filter(m => m.senderType === 'contact')

    timelineInsights.forEach((insight, idx) => {
      let targetId: string | null = insight.id && sortedMessages.some(m => m.id === insight.id) ? insight.id : null

      if (!targetId) {
        if (contactMsgs.length > 0) {
          const msgIdx = Math.min(
            Math.floor(((idx + 1) / (timelineInsights.length + 1)) * contactMsgs.length),
            contactMsgs.length - 1
          )
          targetId = contactMsgs[msgIdx]?.id ?? contactMsgs[contactMsgs.length - 1]?.id ?? null
        } else {
          targetId = sortedMessages[sortedMessages.length - 1]?.id ?? null
        }
      }

      if (targetId) {
        if (!map[targetId]) map[targetId] = []
        map[targetId].push(insight)
      }
    })

    return map
  }, [sortedMessages, timelineInsights])

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {lockInfo?.lockedBy && (
        <div className="sticky top-0 z-30 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800 shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping flex-shrink-0" />
            <span>🔒 Currently viewed/edited by <strong className="font-semibold text-amber-950">{lockInfo.lockedByName || 'another team member'}</strong>. Be cautious to avoid overlapping replies.</span>
          </div>
        </div>
      )}

      {/* Pinned Messages Banner */}
      {pinnedMessages.length > 0 && (
        <PinnedMessageBanner
          pinnedMessages={pinnedMessages}
          onJumpToMessage={(id) => handleQuoteClick(id)}
          onUnpinMessage={(id) => onPin?.(id)}
        />
      )}

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

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto px-1 sm:px-4 py-4 z-10 relative ${searchOpen ? 'pt-20' : ''}`}
      >
        {loading ? (
          <ThreadLoadingSkeleton />
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={() => {
                    if (loadingOlder || !onLoadOlder) return
                    heightBeforePrepend.current = scrollContainerRef.current?.scrollHeight ?? null
                    onLoadOlder()
                  }}
                  className="min-h-9 rounded-full bg-white/85 px-4 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-gray-200/70 hover:text-indigo-600"
                >
                  {loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {/* Internal Team Yellow Sticky Notes */}
            {internalNotes && internalNotes.length > 0 && (
              <div className="my-3 space-y-2">
                {internalNotes.map(note => (
                  <div key={note.id} className="mx-auto max-w-lg bg-amber-50/95 border-2 border-amber-300/80 rounded-2xl p-3 shadow-sm backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1 pb-1 border-b border-amber-200/80">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950">
                        <StickyNote size={14} className="text-amber-600 fill-amber-300" />
                        Internal Team Note • {note.author}
                      </span>
                      <span className="text-[10px] font-medium text-amber-700">
                        {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 font-semibold leading-relaxed whitespace-pre-wrap">{note.text}</p>
                  </div>
                ))}
              </div>
            )}

            {sortedMessages.map((msg, idx) => {
              const prev = sortedMessages[idx - 1]
              const showDate = !prev || dayKey(prev.timestamp) !== dayKey(msg.timestamp)
              // Consecutive messages from the same sender within 5 minutes stack tightly.
              const sameSender = !!prev && prev.senderType === msg.senderType &&
                (prev.senderDisplayName ?? null) === (msg.senderDisplayName ?? null)
              const firstInRun = showDate || !sameSender ||
                new Date(msg.timestamp).getTime() - new Date(prev!.timestamp).getTime() > 5 * 60_000
              const msgCards = cardsByMessageId[msg.id] ?? []

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
                    allMessages={messages}
                    highlighted={highlightedMsgId === msg.id}
                    onOpenMedia={onOpenMedia}
                    firstInRun={firstInRun}
                    showSenderName={firstInRun}
                    onQuoteClick={handleQuoteClick}
                    onReply={onReply}
                    onForward={onForward}
                    onReact={onReact}
                    onStar={onStar}
                    onPin={onPin}
                    onDelete={onDelete}
                    onAttachmentClick={(att) => {
                      if (onMediaClick && att.url) {
                        onMediaClick({
                          type: att.type === 'image' ? 'image' : att.type === 'video' ? 'video' : 'document',
                          url: att.url,
                          title: att.name,
                        })
                      }
                    }}
                  />
                  {msgCards.length > 0 && (
                    <div className="py-2.5 px-2 space-y-2">
                      {msgCards.map((card, cIdx) => (
                        <InlineAICard
                          key={card.id || `card-${msg.id}-${cIdx}`}
                          insight={card}
                          onAction={onCardAction}
                          onDismiss={onCardDismiss}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-5 right-6 z-40 p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl border border-indigo-400/40 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-200"
          title="Scroll to bottom"
        >
          <ChevronDown size={18} strokeWidth={2.5} />
          {unseenCount > 0
            ? <span>{unseenCount} new</span>
            : <span className="hidden sm:inline">Bottom</span>}
        </button>
      )}
    </div>
  )
}
