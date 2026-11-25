'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Zap,
  Check,
  CheckCheck,
  Clock,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Share,
  Bookmark,
  User,
  ShieldCheck,
  AlertCircle,
  Video,
  CornerUpLeft,
  CornerUpRight,
  Smile,
  Star,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import { MessageContent } from './message-content'

/** Types rendered as plain text; anything else (media, location, contact card…) goes through MessageContent. */
const TEXT_LIKE_TYPES = new Set(['text', 'mixed', 'thinking', 'error'])

// ─── Types ─────────────────────────────────────────────────────────

export interface Attachment {
  id: string
  type: 'image' | 'video' | 'audio' | 'document' | 'link'
  url: string
  name?: string
  size?: string
  mimeType?: string
  thumbnailUrl?: string
  duration?: string
}

export interface Citation {
  id: string
  title: string
  url?: string
  snippet?: string
  source?: string
}

export interface InboxMessage {
  id: string
  senderType: 'user' | 'contact' | 'assistant' | 'system'
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact_card' | 'deleted' | 'mixed' | 'thinking' | 'error'
  body: string | null
  timestamp: string
  editedAt?: string | null
  pendingSuggestions: number

  // Media
  mediaUrl?: string | null
  mediaMimeType?: string | null
  attachments?: Attachment[]

  // Content features
  transcription?: string | null
  quotedMessageId?: string | null
  isForwarded?: boolean
  citations?: Citation[]
  codeBlocks?: { language: string; code: string }[]

  // Status & delivery
  deliveryStatus?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isTyping?: boolean

  // AI features
  approvalMode?: 'manual' | 'approved' | 'autonomous' | 'reviewing'
  confidence?: number // 0-1
  modelName?: string
  tokensUsed?: number

  // User features
  senderDisplayName?: string | null
  avatarUrl?: string | null
  isStarred?: boolean
  isPinned?: boolean

  // Reactions & feedback
  reactions?: { emoji: string; count: number; userReacted: boolean }[]
  userFeedback?: 'positive' | 'negative' | null

  // Threading
  threadCount?: number
  isThreadRoot?: boolean
}

export interface MessageBubbleProps {
  msg: InboxMessage
  token?: string | null
  selected: boolean
  activeSearchMatch: boolean
  searchQuery: string
  onSelect: () => void
  onCopy?: (text: string) => void
  onRegenerate?: (msgId: string) => void
  onFeedback?: (msgId: string, type: 'positive' | 'negative') => void
  onShare?: (msgId: string) => void
  onBookmark?: (msgId: string) => void
  onCitationClick?: (citation: Citation) => void
  onAttachmentClick?: (attachment: Attachment) => void
  onThreadClick?: (msgId: string) => void
  onQuoteClick?: (quotedId: string) => void
  onReply?: (msg: InboxMessage) => void
  onForward?: (msg: InboxMessage) => void
  onReact?: (msgId: string, emoji: string) => void
  onStar?: (msgId: string) => void
  onPin?: (msgId: string) => void
  onDelete?: (msg: InboxMessage, deleteForEveryone: boolean) => void
  allMessages?: InboxMessage[]
  highlighted?: boolean
  /** Open this message's photo/video/PDF in the full-screen viewer. */
  onOpenMedia?: (messageId: string) => void
  /** First message of a consecutive run from the same sender (gets the tail and spacing). */
  firstInRun?: boolean
  /** Group chats: show the sender's name (first message of a run only). */
  showSenderName?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────

const SENDER_NAME_COLORS = [
  'text-emerald-600', 'text-sky-600', 'text-amber-600', 'text-rose-600',
  'text-violet-600', 'text-cyan-600', 'text-orange-600', 'text-teal-600',
  'text-indigo-600', 'text-pink-600', 'text-lime-600', 'text-fuchsia-600',
]

// ─── Utilities ─────────────────────────────────────────────────────

function senderNameColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SENDER_NAME_COLORS[hash % SENDER_NAME_COLORS.length]
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** WhatsApp-style one-line label for a message (reply previews, quotes). */
export function messagePreviewLabel(m: Pick<InboxMessage, 'body' | 'messageType'>): string {
  const t = m.messageType as string | undefined
  const label: Record<string, string> = {
    image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message', sticker: 'Sticker',
    location: '📍 Location', contact_card: '👤 Contact', deleted: 'This message was deleted',
  }
  if (t === 'document') return `📄 ${m.body || 'Document'}`
  if (t && label[t]) return m.body && t !== 'deleted' && t !== 'audio' ? `${label[t]} · ${m.body}` : label[t]
  return m.body || ''
}

function highlightText(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let index = lower.indexOf(needle)

  while (index !== -1) {
    parts.push(text.slice(lastIndex, index))
    parts.push(
      <mark 
        key={index} 
        className="rounded-sm bg-amber-300/70 px-0.5 font-medium text-amber-900 dark:bg-amber-400/60 dark:text-amber-950"
      >
        {text.slice(index, index + q.length)}
      </mark>
    )
    lastIndex = index + q.length
    index = lower.indexOf(needle, lastIndex)
  }
  parts.push(text.slice(lastIndex))
  return <>{parts}</>
}

// ─── Sub-Components ────────────────────────────────────────────────

function StatusIndicator({ status }: { status?: string }) {
  const config = {
    sending: { icon: Clock, color: 'text-gray-400', animate: true },
    sent: { icon: Check, color: 'text-gray-400', animate: false },
    delivered: { icon: CheckCheck, color: 'text-gray-400', animate: false },
    read: { icon: CheckCheck, color: 'text-sky-500', animate: false },
    failed: { icon: AlertCircle, color: 'text-red-500', animate: false },
  }

  const cfg = config[status as keyof typeof config] || config.sent
  const Icon = cfg.icon

  return (
    <span className={`${cfg.color} ${cfg.animate ? 'animate-pulse' : ''}`} title={status}>
      <Icon size={14} strokeWidth={2.5} />
    </span>
  )
}

function ReactionBar({ reactions, onReact }: { 
  reactions: { emoji: string; count: number; userReacted: boolean }[]
  onReact?: (emoji: string) => void 
}) {
  const [showPicker, setShowPicker] = useState(false)
  const emojis = ['👍', '❤️', '😂', '🔥', '💡', '🎉', '🙏', '😮']

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact?.(r.emoji)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95 shadow-2xs
            ${r.userReacted 
              ? 'bg-sky-100 border-sky-300 text-sky-900 dark:bg-sky-950 dark:border-sky-700 dark:text-sky-200 ring-1 ring-sky-400/50' 
              : 'bg-white/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] tabular-nums font-bold">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="p-1 rounded-full hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-500 transition-colors"
          title="Add reaction"
        >
          <Smile size={13} />
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1.5 p-1.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 
                          flex gap-1 z-50 animate-in fade-in zoom-in duration-150">
            {emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onReact?.(emoji); setShowPicker(false) }}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-base transition-transform active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBar({ 
  msg, 
  onCopy, 
  onRegenerate, 
  onFeedback, 
  onShare, 
  onBookmark,
  onReply,
  onForward,
  onReact,
  onStar,
  onPin,
  onDelete,
  forceVisible,
}: { 
  msg: InboxMessage
  forceVisible?: boolean
  onCopy?: (text: string) => void
  onRegenerate?: (msgId: string) => void
  onFeedback?: (msgId: string, type: 'positive' | 'negative') => void
  onShare?: (msgId: string) => void
  onBookmark?: (msgId: string) => void
  onReply?: (msg: InboxMessage) => void
  onForward?: (msg: InboxMessage) => void
  onReact?: (msgId: string, emoji: string) => void
  onStar?: (msgId: string) => void
  onPin?: (msgId: string) => void
  onDelete?: (msg: InboxMessage, deleteForEveryone: boolean) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const isAssistant = msg.senderType === 'assistant'
  const isUser = msg.senderType === 'user'
  const quickEmojis = ['👍', '❤️', '😂', '🔥', '🎉']

  const handleCopy = useCallback(() => {
    if (msg.body) {
      navigator.clipboard.writeText(msg.body)
      setCopied(true)
      onCopy?.(msg.body)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [msg.body, onCopy])

  return (
    <div className={`relative flex items-center gap-0.5 ${forceVisible ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'} transition-opacity duration-150 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs`}>
      {/* Star button */}
      {onStar && (
        <button
          onClick={() => onStar(msg.id)}
          className={`p-1.5 rounded-lg transition-colors ${
            msg.isStarred
              ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
              : 'text-slate-600 hover:text-amber-500 dark:text-slate-300 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title={msg.isStarred ? 'Unstar message' : 'Star message'}
        >
          <Star size={14} className={msg.isStarred ? 'fill-amber-400' : ''} />
        </button>
      )}

      {/* Pin button */}
      {onPin && (
        <button
          onClick={() => onPin(msg.id)}
          className={`p-1.5 rounded-lg transition-colors ${
            msg.isPinned
              ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/50'
              : 'text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title={msg.isPinned ? 'Unpin message' : 'Pin message'}
        >
          {msg.isPinned ? <PinOff size={14} /> : <Pin size={14} className="rotate-45" />}
        </button>
      )}

      {/* Reply button */}
      {onReply && (
        <button
          onClick={() => onReply(msg)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors"
          title="Reply to message"
        >
          <CornerUpLeft size={14} />
        </button>
      )}

      {/* Forward button */}
      {onForward && (
        <button
          onClick={() => onForward(msg)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors"
          title="Forward message"
        >
          <CornerUpRight size={14} />
        </button>
      )}

      {/* Quick Reaction Button */}
      {onReact && (
        <div className="relative">
          <button
            onClick={() => { setShowPicker(!showPicker); setShowDeleteMenu(false) }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 transition-colors"
            title="React"
          >
            <Smile size={14} />
          </button>
          {showPicker && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 p-1 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex gap-1 z-50">
              {quickEmojis.map(e => (
                <button
                  key={e}
                  onClick={() => { onReact(msg.id, e); setShowPicker(false) }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-sm transition-transform active:scale-125"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-200 transition-colors"
        title="Copy text"
      >
        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </button>

      {/* Delete button */}
      {onDelete && (
        <div className="relative">
          <button
            onClick={() => { setShowDeleteMenu(!showDeleteMenu); setShowPicker(false) }}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 transition-colors"
            title="Delete message"
          >
            <Trash2 size={14} />
          </button>
          {showDeleteMenu && (
            <div className="absolute bottom-full right-0 mb-1.5 w-44 p-1 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-0.5 z-50 animate-in fade-in zoom-in duration-150">
              <button
                onClick={() => { onDelete(msg, false); setShowDeleteMenu(false) }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                Delete for me
              </button>
              {isUser && (
                <button
                  onClick={() => { onDelete(msg, true); setShowDeleteMenu(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 transition-colors"
                >
                  Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isAssistant && onRegenerate && (
        <button
          onClick={() => onRegenerate(msg.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-200 transition-colors"
          title="Regenerate"
        >
          <RotateCcw size={14} />
        </button>
      )}

      {isAssistant && onFeedback && (
        <>
          <button
            onClick={() => onFeedback(msg.id, 'positive')}
            className={`p-1.5 rounded-lg transition-colors ${
              msg.userFeedback === 'positive' 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800'
            }`}
            title="Helpful"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => onFeedback(msg.id, 'negative')}
            className={`p-1.5 rounded-lg transition-colors ${
              msg.userFeedback === 'negative' 
                ? 'bg-red-50 text-red-600' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800'
            }`}
            title="Not helpful"
          >
            <ThumbsDown size={14} />
          </button>
        </>
      )}

      {onShare && (
        <button
          onClick={() => onShare(msg.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-200 transition-colors"
          title="Share"
        >
          <Share size={14} />
        </button>
      )}

      {onBookmark && (
        <button
          onClick={() => onBookmark(msg.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-200 transition-colors"
          title="Bookmark"
        >
          <Bookmark size={14} />
        </button>
      )}
    </div>
  )
}

function QuotedMessage({ 
  quotedId, 
  quotedMsg, 
  onClick,
  isUserBubble
}: { 
  quotedId: string; 
  quotedMsg?: InboxMessage; 
  onClick?: () => void;
  isUserBubble?: boolean;
}) {
  const senderLabel = quotedMsg 
    ? (quotedMsg.senderDisplayName || (quotedMsg.senderType === 'user' ? 'You' : 'Contact'))
    : 'Referenced Message'

  const bodyText = quotedMsg
    ? (messagePreviewLabel(quotedMsg) || 'Message')
    : 'Earlier message'

  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-2 p-2 px-3 rounded-xl border-l-[4px] 
                 transition-all text-left w-full max-w-full min-w-0 overflow-hidden mb-2 text-xs select-none shadow-2xs group/quote ${
                   isUserBubble 
                     ? 'bg-black/10 dark:bg-black/35 border-l-emerald-800 dark:border-l-emerald-400 hover:bg-black/15'
                     : 'bg-slate-100 dark:bg-slate-800/80 border-l-indigo-600 dark:border-l-indigo-400 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                 }`}
    >
      <div className="flex-1 min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
          <p className={`text-[11px] font-extrabold tracking-wide uppercase truncate min-w-0 ${
            isUserBubble ? 'text-emerald-950 dark:text-emerald-200' : 'text-indigo-900 dark:text-indigo-300'
          }`}>
            {senderLabel}
          </p>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono opacity-0 group-hover/quote:opacity-100 transition-opacity shrink-0">
            Jump →
          </span>
        </div>
        <p className={`text-xs font-semibold leading-snug line-clamp-2 break-words max-w-full ${
          isUserBubble ? 'text-slate-950 dark:text-emerald-50' : 'text-slate-900 dark:text-slate-100'
        }`}>
          {bodyText}
        </p>
      </div>
    </button>
  )
}

// ─── Main Component ────────────────────────────────────────────────

export function MessageBubble({
  msg,
  token,
  selected,
  activeSearchMatch,
  searchQuery,
  onSelect,
  onCopy,
  onRegenerate,
  onFeedback,
  onShare,
  onBookmark,
  onCitationClick,
  onAttachmentClick,
  onThreadClick,
  onQuoteClick,
  onReply,
  onForward,
  onReact,
  onStar,
  onPin,
  onDelete,
  allMessages,
  highlighted,
  onOpenMedia,
  firstInRun = true,
  showSenderName = true,
}: MessageBubbleProps) {
  const isUser = msg.senderType === 'user'
  const isAssistant = msg.senderType === 'assistant'
  const isSystem = msg.senderType === 'system'
  const isApproved = msg.approvalMode === 'approved'
  const isAuto = msg.approvalMode === 'autonomous'
  const isReviewing = msg.approvalMode === 'reviewing'
  const isError = msg.messageType === 'error'
  const isRichMessage = !!msg.messageType && !TEXT_LIKE_TYPES.has(msg.messageType as string)

  const hasTextHighlight = !!searchQuery.trim() && 
    !['image', 'video', 'audio', 'document'].includes(msg.messageType || '')

  const bubbleRef = useRef<HTMLDivElement>(null)

  // Scroll into view if active search match
  useEffect(() => {
    if (activeSearchMatch && bubbleRef.current) {
      bubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSearchMatch])

  // Determine bubble styling
  const getBubbleClasses = () => {
    const base = 'relative px-3 pt-1.5 pb-1 text-sm leading-relaxed border transition-all duration-300'
    const radius = !firstInRun ? 'rounded-2xl' : isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'

    let classes = ''
    if (isError) {
      classes = `${base} ${radius} bg-red-50/90 text-red-900 border-red-200 shadow-sm`
    } else if (isSystem) {
      classes = `${base} ${radius} bg-gray-50/90 text-gray-600 border-gray-200 shadow-sm text-center text-sm`
    } else if (isAuto) {
      classes = `${base} ${radius} bg-gradient-to-br from-emerald-50/95 to-lime-50/95 text-gray-900 border-emerald-200/80 shadow-sm`
    } else if (isApproved) {
      classes = `${base} ${radius} bg-emerald-50/95 text-gray-900 border-emerald-200/80 border-l-[3px] border-l-sky-400 shadow-sm`
    } else if (isUser) {
      classes = `${base} ${radius} bg-gradient-to-br from-[#dcf8c6] to-[#d4f5b8] text-gray-900 border-[#cbeeb5]/80 shadow-sm`
    } else {
      classes = `${base} ${radius} bg-white/95 text-gray-900 border-gray-200/80 shadow-sm hover:shadow-md`
    }

    if (highlighted) {
      classes += ' ring-4 ring-indigo-500/50 shadow-lg border-indigo-400'
    }
    return classes
  }

  // Touch: long-press (contextmenu) or tap the bubble's menu to show actions.
  const [actionsOpen, setActionsOpen] = useState(false)
  useEffect(() => {
    if (!actionsOpen) return
    const close = (e: Event) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) setActionsOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [actionsOpen])

  return (
    <div
      ref={bubbleRef}
      className={`${firstInRun ? 'mt-2' : 'mt-0.5'} animate-message-entry group ${activeSearchMatch ? 'scroll-mt-32' : ''}`}
      onContextMenu={e => {
        if (window.matchMedia?.('(pointer: coarse)').matches) { e.preventDefault(); setActionsOpen(true) }
      }}
    >
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3`}>
        <div className={`relative flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-lg lg:max-w-xl`}>
          {/* Floating action menu (hover on desktop, long-press on touch) */}
          {!isSystem && (
            <div className={`absolute -top-4 z-20 ${isUser ? 'right-1' : 'left-1'}`}>
              <ActionBar
                msg={msg}
                forceVisible={actionsOpen}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
                onShare={onShare}
                onBookmark={onBookmark}
                onReply={onReply ? (m) => { setActionsOpen(false); onReply(m) } : undefined}
                onForward={onForward ? (m) => { setActionsOpen(false); onForward(m) } : undefined}
                onReact={onReact ? (id, e) => { setActionsOpen(false); onReact(id, e) } : undefined}
                onStar={onStar}
                onPin={onPin}
                onDelete={onDelete}
              />
            </div>
          )}

          {/* Main bubble */}
          <div
            onClick={() => msg.pendingSuggestions > 0 && onSelect()}
            className={`${msg.pendingSuggestions > 0 ? 'cursor-pointer' : ''}`}
          >
            <div
              className={`${getBubbleClasses()} ${
                msg.pendingSuggestions > 0 && !selected ? 'ring-1 ring-amber-400/50' : ''
              } ${selected ? 'ring-2 ring-sky-400/60 shadow-lg' : ''} ${
                activeSearchMatch ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]' : ''
              }`}
            >
              {/* AI mode badges */}
              {(isAuto || isReviewing) && (
                <div className="absolute -top-2.5 right-2 flex items-center gap-1">
                  {isAuto && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-emerald-200 rounded-full text-[9px] font-bold text-emerald-700 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      AUTO
                    </span>
                  )}
                  {isReviewing && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-200 rounded-full text-[9px] font-bold text-amber-700 shadow-sm">
                      <Clock size={8} className="animate-spin" />
                      REVIEWING
                    </span>
                  )}
                </div>
              )}

              {/* Group sender name (first message of a run) */}
              {showSenderName && msg.senderDisplayName && !isUser && (
                <p className={`text-xs font-bold mb-0.5 ${senderNameColor(msg.senderDisplayName)}`}>
                  {msg.senderDisplayName}
                </p>
              )}

              {isError && (
                <div className="flex items-center gap-2 mb-1 p-2 rounded-lg bg-red-100/50 border border-red-200/50">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-700">Something went wrong</span>
                </div>
              )}

              {msg.isForwarded && (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-0.5">
                  <CornerUpRight size={10} className="text-slate-400" />
                  <span className="italic">Forwarded</span>
                </div>
              )}

              {msg.quotedMessageId && (() => {
                const quotedMsg = allMessages?.find(m => m.id === msg.quotedMessageId)
                return (
                  <div className="w-full max-w-full min-w-0 overflow-hidden">
                    <QuotedMessage
                      quotedId={msg.quotedMessageId}
                      quotedMsg={quotedMsg}
                      onClick={() => onQuoteClick?.(msg.quotedMessageId!)}
                      isUserBubble={isUser}
                    />
                  </div>
                )
              })()}

              {isRichMessage ? (
                <MessageContent msg={msg} token={token} isUser={isUser} onOpenMedia={onOpenMedia} />
              ) : msg.body ? (
                <p className="whitespace-pre-wrap break-words text-sm text-gray-900 leading-relaxed">
                  {hasTextHighlight ? highlightText(msg.body, searchQuery) : msg.body}
                  {/* Spacer so the floating time never overlaps the last line */}
                  <span className="inline-block w-[4.5rem]" aria-hidden />
                </p>
              ) : null}

              {/* Time + status, WhatsApp-style bottom-right */}
              <div className={`flex items-center justify-end gap-1 ${isRichMessage || !msg.body ? 'mt-0.5' : '-mt-4'} float-right relative`}>
                {isApproved && <ShieldCheck size={10} className="text-sky-600" aria-label="Approved suggestion" />}
                {msg.isPinned && <Pin size={10} className="rotate-45 text-amber-600" aria-label="Pinned" />}
                {msg.isStarred && <Star size={10} className="fill-amber-400 text-amber-500" aria-label="Starred" />}
                {msg.editedAt && <span className="text-[9px] italic text-gray-400">edited</span>}
                <span className="text-[10px] font-medium tabular-nums text-gray-500">{formatTime(msg.timestamp)}</span>
                {isUser && <StatusIndicator status={msg.deliveryStatus} />}
              </div>
              <div className="clear-both" />
            </div>

            {msg.pendingSuggestions > 0 && (
              <div className={`mt-1 flex items-center gap-1.5 ${!isUser ? 'justify-start' : 'justify-end'}`}>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${!isUser ? 'text-amber-600' : 'text-sky-500'}`}>
                  <Zap size={10} className={selected ? '' : 'animate-pulse'} />
                  {selected ? 'Suggestions ready' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}

            {msg.reactions && msg.reactions.length > 0 && (
              <div className={`-mt-1 relative z-10 ${isUser ? 'mr-2 flex justify-end' : 'ml-2'}`}>
                <ReactionBar reactions={msg.reactions} onReact={(emoji) => onReact?.(msg.id, emoji)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Animation Keyframes (add to your globals.css) ─────────────────
/*
@keyframes message-entry {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.animate-message-entry {
  animation: message-entry 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
*/