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
  MoreHorizontal, 
  Bot, 
  User, 
  Sparkles,
  ChevronDown,
  Wand2,
  ShieldCheck,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  ExternalLink,
  Maximize2
} from 'lucide-react'

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
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'mixed' | 'thinking' | 'error'
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
  allMessages?: InboxMessage[]
  highlighted?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────

const SENDER_NAME_COLORS = [
  'text-emerald-600', 'text-sky-600', 'text-amber-600', 'text-rose-600',
  'text-violet-600', 'text-cyan-600', 'text-orange-600', 'text-teal-600',
  'text-indigo-600', 'text-pink-600', 'text-lime-600', 'text-fuchsia-600',
]

const GRADIENT_BGS = [
  'from-emerald-50/90 to-teal-50/90',
  'from-sky-50/90 to-blue-50/90', 
  'from-violet-50/90 to-purple-50/90',
  'from-amber-50/90 to-orange-50/90',
  'from-rose-50/90 to-pink-50/90',
  'from-cyan-50/90 to-sky-50/90',
]

// ─── Utilities ─────────────────────────────────────────────────────

function senderNameColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SENDER_NAME_COLORS[hash % SENDER_NAME_COLORS.length]
}

function senderGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return GRADIENT_BGS[hash % GRADIENT_BGS.length]
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (days < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

function formatRelativeTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatTime(ts)
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

function ConfidenceBadge({ confidence, modelName }: { confidence?: number; modelName?: string }) {
  if (!confidence && !modelName) return null

  const getColor = (c: number) => {
    if (c >= 0.9) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (c >= 0.7) return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-red-100 text-red-700 border-red-200'
  }

  return (
    <div className="flex items-center gap-1.5">
      {modelName && (
        <span className="text-[10px] font-medium text-gray-500 bg-gray-100/80 px-1.5 py-0.5 rounded-md border border-gray-200/60">
          {modelName}
        </span>
      )}
      {confidence !== undefined && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${getColor(confidence)}`}>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  )
}

function CitationPill({ citation, onClick }: { citation: Citation; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 border border-gray-200/80 
                 hover:bg-sky-50 hover:border-sky-200 transition-all duration-200 shadow-sm hover:shadow-md"
    >
      <span className="w-5 h-5 rounded-md bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-[10px] font-bold 
                       flex items-center justify-center shrink-0">
        {citation.id}
      </span>
      <span className="text-xs text-gray-700 font-medium truncate max-w-[140px] group-hover:text-sky-700">
        {citation.title}
      </span>
      {citation.url && <ExternalLink size={10} className="text-gray-400 group-hover:text-sky-500" />}
    </button>
  )
}

function AttachmentCard({ attachment, onClick }: { attachment: Attachment; onClick?: () => void }) {
  const icons = {
    image: ImageIcon,
    video: Video,
    audio: Music,
    document: FileText,
    link: ExternalLink,
  }
  const Icon = icons[attachment.type] || FileText

  const typeColors = {
    image: 'from-purple-50 to-pink-50 border-purple-200 text-purple-600',
    video: 'from-red-50 to-orange-50 border-red-200 text-red-600',
    audio: 'from-amber-50 to-yellow-50 border-amber-200 text-amber-600',
    document: 'from-blue-50 to-sky-50 border-blue-200 text-blue-600',
    link: 'from-emerald-50 to-teal-50 border-emerald-200 text-emerald-600',
  }

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r ${typeColors[attachment.type]} 
                  border hover:shadow-md transition-all duration-200 w-full text-left`}
    >
      <div className="w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center shadow-sm shrink-0">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 truncate">{attachment.name || 'Attachment'}</p>
        {attachment.size && <p className="text-[10px] text-gray-500">{attachment.size}</p>}
      </div>
      <Download size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

function ImagePreview({ url, alt, onClick }: { url: string; alt?: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="rounded-xl bg-gray-100 border border-gray-200 p-4 flex items-center gap-2 text-gray-500">
        <ImageIcon size={16} />
        <span className="text-xs">Failed to load image</span>
      </div>
    )
  }

  return (
    <div className="relative group rounded-xl overflow-hidden bg-gray-100 border border-gray-200/80">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-100 to-gray-200" />
      )}
      <img
        src={url}
        alt={alt || 'Image'}
        className={`w-full max-w-[320px] object-cover rounded-xl transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {loaded && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button 
            onClick={onClick}
            className="p-2 rounded-full bg-white/90 text-gray-700 shadow-lg hover:bg-white transition-all"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200/80 bg-[#1e1e2e] my-2 shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-[#181825] border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-2">{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[13px] leading-relaxed">
        <code className="text-gray-300 font-mono">{code}</code>
      </pre>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-gray-500 font-medium">Thinking...</span>
    </div>
  )
}

function ReactionBar({ reactions, onReact }: { 
  reactions: { emoji: string; count: number; userReacted: boolean }[]
  onReact?: (emoji: string) => void 
}) {
  const [showPicker, setShowPicker] = useState(false)
  const emojis = ['👍', '👎', '❤️', '🔥', '💡', '😂', '🎉', '🤔']

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact?.(r.emoji)}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all
            ${r.userReacted 
              ? 'bg-sky-50 border-sky-200 text-sky-700 shadow-sm' 
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium text-[10px]">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="p-0.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <ChevronDown size={12} />
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200 
                          flex gap-1 z-50 animate-in fade-in zoom-in duration-150">
            {emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onReact?.(emoji); setShowPicker(false) }}
                className="p-1 hover:bg-gray-100 rounded-lg text-sm transition-colors"
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
  onBookmark 
}: { 
  msg: InboxMessage
  onCopy?: (text: string) => void
  onRegenerate?: (msgId: string) => void
  onFeedback?: (msgId: string, type: 'positive' | 'negative') => void
  onShare?: (msgId: string) => void
  onBookmark?: (msgId: string) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [copied, setCopied] = useState(false)
  const isAssistant = msg.senderType === 'assistant'

  const handleCopy = useCallback(() => {
    if (msg.body) {
      navigator.clipboard.writeText(msg.body)
      setCopied(true)
      onCopy?.(msg.body)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [msg.body, onCopy])

  return (
    <div 
      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      onMouseEnter={() => setShowActions(true)}
    >
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Copy"
      >
        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </button>

      {isAssistant && onRegenerate && (
        <button
          onClick={() => onRegenerate(msg.id)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
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
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
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
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
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
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Share"
        >
          <Share size={14} />
        </button>
      )}

      {onBookmark && (
        <button
          onClick={() => onBookmark(msg.id)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
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
  onClick 
}: { 
  quotedId: string; 
  quotedMsg?: InboxMessage; 
  onClick?: () => void 
}) {
  const senderLabel = quotedMsg 
    ? (quotedMsg.senderType === 'user' ? 'You' : 'Contact')
    : 'Message'

  const bodyText = quotedMsg
    ? (quotedMsg.body || (quotedMsg.attachments?.length ? 'Attachment' : 'Click to view referenced message'))
    : 'Click to view referenced message'

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-2 p-1.5 px-2.5 rounded-lg bg-black/5 dark:bg-white/5 border-l-4 border-indigo-500 
                 hover:bg-black/10 dark:hover:bg-white/10 transition-all text-left w-full mb-1.5 text-xs select-none"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">{senderLabel}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 truncate leading-snug">{bodyText}</p>
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
  allMessages,
  highlighted,
}: MessageBubbleProps) {
  const isUser = msg.senderType === 'user'
  const isAssistant = msg.senderType === 'assistant'
  const isSystem = msg.senderType === 'system'
  const isApproved = msg.approvalMode === 'approved'
  const isAuto = msg.approvalMode === 'autonomous'
  const isReviewing = msg.approvalMode === 'reviewing'
  const isError = msg.messageType === 'error'

  const hasTextHighlight = !!searchQuery.trim() && 
    !['image', 'video', 'audio', 'document'].includes(msg.messageType || '')

  const [isHovered, setIsHovered] = useState(false)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Scroll into view if active search match
  useEffect(() => {
    if (activeSearchMatch && bubbleRef.current) {
      bubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSearchMatch])

  // Determine bubble styling
  const getBubbleClasses = () => {
    const base = 'relative px-4 py-3 text-[15px] leading-relaxed border transition-all duration-300'
    const radius = isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'

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
      classes += ' ring-4 ring-indigo-500/50 scale-[1.02] shadow-lg border-indigo-400 bg-indigo-50/30'
    }
    return classes
  }

  const getAvatar = () => {
    if (msg.avatarUrl) {
      return <img src={msg.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-white shadow-sm" />
    }
    if (isUser) {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white shadow-sm">
          <User size={14} />
        </div>
      )
    }
    if (isAssistant) {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
          <Bot size={14} />
        </div>
      )
    }
    return null
  }

  return (
    <div 
      ref={bubbleRef}
      className={`mb-3 animate-message-entry group ${activeSearchMatch ? 'scroll-mt-32' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2 px-3`}>
        {/* Avatar - left side for non-user */}
        {!isUser && (
          <div className="flex flex-col items-center gap-1 pt-1">
            {getAvatar()}
          </div>
        )}

        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-lg lg:max-w-xl`}>
          {/* Sender name */}
          {msg.senderDisplayName && !isUser && (
            <p className={`text-xs font-bold mb-1 ml-1 ${senderNameColor(msg.senderDisplayName)}`}>
              {msg.senderDisplayName}
            </p>
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
              {/* AI Mode badges */}
              {(isAuto || isReviewing) && (
                <div className="absolute -top-2.5 right-2 flex items-center gap-1">
                  {isAuto && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-emerald-200 
                                     rounded-full text-[9px] font-bold text-emerald-700 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      AUTO
                    </span>
                  )}
                  {isReviewing && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-200 
                                     rounded-full text-[9px] font-bold text-amber-700 shadow-sm">
                      <Clock size={8} className="animate-spin" />
                      REVIEWING
                    </span>
                  )}
                </div>
              )}

              {/* Error indicator */}
              {isError && (
                <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-red-100/50 border border-red-200/50">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-700">Something went wrong</span>
                </div>
              )}

              {/* Quoted message */}
              {msg.quotedMessageId && (() => {
                const quotedMsg = allMessages?.find(m => m.id === msg.quotedMessageId)
                return (
                  <QuotedMessage 
                    quotedId={msg.quotedMessageId} 
                    quotedMsg={quotedMsg}
                    onClick={() => onQuoteClick?.(msg.quotedMessageId!)} 
                  />
                )
              })()}

              {/* Thinking indicator */}
              {msg.isTyping && <ThinkingIndicator />}

              {/* Message body with search highlight */}
              {hasTextHighlight && msg.body ? (
                <p className="whitespace-pre-wrap text-sm text-gray-900 leading-relaxed">
                  {highlightText(msg.body, searchQuery)}
                </p>
              ) : msg.body ? (
                <p className="whitespace-pre-wrap text-sm text-gray-900 leading-relaxed">{msg.body}</p>
              ) : null}

              {/* Code blocks */}
              {msg.codeBlocks?.map((block, i) => (
                <CodeBlock key={i} language={block.language} code={block.code} />
              ))}

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {msg.attachments.map((att) => (
                    att.type === 'image' ? (
                      <ImagePreview 
                        key={att.id} 
                        url={att.url} 
                        alt={att.name}
                        onClick={() => onAttachmentClick?.(att)}
                      />
                    ) : (
                      <AttachmentCard 
                        key={att.id} 
                        attachment={att}
                        onClick={() => onAttachmentClick?.(att)}
                      />
                    )
                  ))}
                </div>
              )}

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-200/60">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((citation) => (
                      <CitationPill 
                        key={citation.id} 
                        citation={citation}
                        onClick={() => onCitationClick?.(citation)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Footer row */}
              <div className="flex items-center justify-between gap-3 mt-2 pt-1">
                <div className="flex items-center gap-2">
                  {/* Confidence & Model */}
                  <ConfidenceBadge confidence={msg.confidence} modelName={msg.modelName} />

                  {/* Approved badge */}
                  {isApproved && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-sky-700 
                                     bg-sky-50 px-1.5 py-0.5 rounded-md border border-sky-200/60 uppercase">
                      <ShieldCheck size={9} />
                      Approved
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  {/* Timestamp */}
                  <span className="text-[10px] text-gray-400 font-medium tabular-nums">
                    {formatTime(msg.timestamp)}
                  </span>

                  {/* Edited indicator */}
                  {msg.editedAt && (
                    <span className="text-[9px] text-gray-400 italic">edited</span>
                  )}

                  {/* Delivery status */}
                  {isUser && <StatusIndicator status={msg.deliveryStatus} />}
                </div>
              </div>
            </div>

            {/* Pending suggestions */}
            {msg.pendingSuggestions > 0 && (
              <div className={`mt-1.5 flex items-center gap-1.5 ${!isUser ? 'justify-start' : 'justify-end'}`}>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  !isUser ? 'text-amber-600' : 'text-sky-500'
                }`}>
                  <Zap size={10} className={selected ? '' : 'animate-pulse'} />
                  {selected ? 'Suggestions ready' : `${msg.pendingSuggestions} AI suggestion${msg.pendingSuggestions !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}

            {/* Thread indicator */}
            {msg.threadCount && msg.threadCount > 0 && (
              <button
                onClick={() => onThreadClick?.(msg.id)}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500 hover:text-sky-600 
                           transition-colors font-medium"
              >
                <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[9px]">
                  {msg.threadCount}
                </span>
                {msg.threadCount === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {/* Reactions */}
            {msg.reactions && msg.reactions.length > 0 && (
              <div className={`mt-1 ${isUser ? 'mr-1' : 'ml-1'}`}>
                <ReactionBar reactions={msg.reactions} />
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className={`mt-1 ${isUser ? 'mr-1' : 'ml-1'}`}>
            <ActionBar 
              msg={msg}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onFeedback={onFeedback}
              onShare={onShare}
              onBookmark={onBookmark}
            />
          </div>
        </div>

        {/* Avatar - right side for user */}
        {isUser && (
          <div className="flex flex-col items-center gap-1 pt-1">
            {getAvatar()}
          </div>
        )}
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