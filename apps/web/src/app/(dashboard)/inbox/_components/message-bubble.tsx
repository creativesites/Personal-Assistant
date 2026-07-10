'use client'

import { Zap } from 'lucide-react'
import { MessageContent } from './message-content'

export interface InboxMessage {
  id: string
  senderType: 'user' | 'contact'
  messageType?: string
  body: string | null
  timestamp: string
  pendingSuggestions: number
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
  quotedMessageId?: string | null
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  approvalMode?: 'manual' | 'approved' | 'autonomous'
}

function formatTime(ts: string | null) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function highlightText(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const index = lower.indexOf(needle)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-200/80 px-0.5 text-[#111b21]">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}

export function MessageBubble({
  msg,
  token,
  selected,
  activeSearchMatch,
  searchQuery,
  onSelect,
}: {
  msg: InboxMessage
  token?: string | null
  selected: boolean
  activeSearchMatch: boolean
  searchQuery: string
  onSelect: () => void
}) {
  const isUser = msg.senderType === 'user'
  const isApproved = msg.approvalMode === 'approved'
  const isAuto = msg.approvalMode === 'autonomous'
  const hasTextHighlight = !!searchQuery.trim() && msg.messageType !== 'image' && msg.messageType !== 'video' && msg.messageType !== 'audio' && msg.messageType !== 'document'

  return (
    <div className="mb-1 animate-message-entry">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-2`}>
        <div
          onClick={() => msg.pendingSuggestions > 0 && onSelect()}
          className={`max-w-[85%] md:max-w-sm ${msg.pendingSuggestions > 0 ? 'cursor-pointer' : ''}`}
        >
          <div
            className={`px-3 py-2 text-[15px] shadow-[0_1px_1px_rgba(15,23,42,0.08)] relative leading-snug border transition ${
              isUser ? 'rounded-lg rounded-tr-none' : 'rounded-lg rounded-tl-none'
            } ${
              isAuto
                ? 'bg-gradient-to-br from-emerald-50 to-lime-50 text-[#111b21] border-emerald-200'
                : isApproved
                  ? 'bg-emerald-50 text-[#111b21] border-emerald-200 border-l-2 border-l-sky-400'
                  : isUser
                    ? 'bg-[#dcf8c6] text-[#111b21] border-[#cbeeb5]'
                    : 'bg-white text-[#111b21] border-gray-100'
            } ${msg.pendingSuggestions > 0 && !selected ? 'ring-1 ring-amber-400/60' : ''}
              ${selected ? 'ring-1 ring-[#34b7f1]/60' : ''}
              ${activeSearchMatch ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]' : ''}`}
          >
            {isAuto && (
              <span className="absolute -top-2.5 right-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f0f4f9] border border-[#d8fbc2] rounded-full text-[8px] font-bold text-[#5f6368] shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                AUTO
              </span>
            )}

            {hasTextHighlight && msg.body ? (
              <p className="leading-relaxed whitespace-pre-wrap text-sm text-[#111b21]">{highlightText(msg.body, searchQuery)}</p>
            ) : (
              <MessageContent msg={msg} token={token} isUser={isUser} />
            )}

            <div className="flex items-center justify-end gap-1 mt-1 text-right ml-auto select-none">
              {isApproved && <span className="text-[10px] font-semibold text-sky-600 mr-1">approved</span>}
              <span className="text-[11px] text-[#5f6368]">{formatTime(msg.timestamp)}</span>
              {isUser && (
                <span
                  title={msg.deliveryStatus ?? 'sent'}
                  className={`text-[13px] leading-none ${msg.deliveryStatus === 'read' ? 'text-[#34b7f1]' : 'text-[#8696A0]'}`}
                >
                  {msg.deliveryStatus === 'sent' ? '✓' : '✓✓'}
                </span>
              )}
            </div>
          </div>
          {msg.pendingSuggestions > 0 && (
            <p className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${!isUser ? 'text-amber-600 justify-start' : 'text-[#34b7f1] justify-end'}`}>
              <Zap size={10} />
              {selected ? 'Suggestions ready' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
