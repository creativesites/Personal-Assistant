'use client'

import { Pin, PinOff, ChevronRight } from 'lucide-react'

export interface PinnedMessage {
  id: string
  body: string
  senderDisplayName?: string | null
  senderType: 'user' | 'contact'
  messageType: string
}

interface PinnedMessageBannerProps {
  pinnedMessages: PinnedMessage[]
  onJumpToMessage: (id: string) => void
  onUnpinMessage: (id: string) => void
}

export function PinnedMessageBanner({
  pinnedMessages,
  onJumpToMessage,
  onUnpinMessage,
}: PinnedMessageBannerProps) {
  if (!pinnedMessages || pinnedMessages.length === 0) return null

  const latestPinned = pinnedMessages[pinnedMessages.length - 1]

  return (
    <div className="sticky top-0 z-20 px-4 py-2 bg-amber-50/90 dark:bg-amber-950/40 backdrop-blur-md border-b border-amber-200/80 dark:border-amber-800/50 flex items-center justify-between gap-3 text-xs shadow-sm transition-all">
      <div 
        onClick={() => onJumpToMessage(latestPinned.id)}
        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
      >
        <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
          <Pin size={13} className="rotate-45" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
            <span>Pinned Message</span>
            {pinnedMessages.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200/70 dark:bg-amber-800/60 font-mono">
                +{pinnedMessages.length - 1} more
              </span>
            )}
          </div>
          <p className="text-amber-800/80 dark:text-amber-300/80 truncate font-normal">
            {latestPinned.body || (latestPinned.messageType === 'audio' ? 'Voice note' : 'Attachment')}
          </p>
        </div>
        <ChevronRight size={14} className="text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onUnpinMessage(latestPinned.id)
        }}
        className="p-1.5 text-amber-700 hover:text-amber-950 dark:text-amber-400 dark:hover:text-amber-100 hover:bg-amber-200/50 dark:hover:bg-amber-900/50 rounded-lg transition-all"
        title="Unpin message"
      >
        <PinOff size={14} />
      </button>
    </div>
  )
}
