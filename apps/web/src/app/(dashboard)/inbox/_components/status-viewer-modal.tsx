'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Send, Sparkles, Eye } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ContactStatusGroup, WhatsAppStatus } from '@zuri/types'
import { apiClient } from '@/lib/api'

interface StatusViewerModalProps {
  group: ContactStatusGroup | null
  token?: string | null
  onClose: () => void
}

export function StatusViewerModal({ group, token, onClose }: StatusViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMessage, setSendingMessage] = useState('')

  const statuses = group?.statuses || []
  const currentStatus: WhatsAppStatus | undefined = statuses[currentIndex]

  const handleNext = useCallback(() => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      onClose()
    }
  }, [currentIndex, statuses.length, onClose])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') handleNext()
      if (e.key === 'ArrowLeft') handlePrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, onClose])

  // Timer auto-advance (5s per story)
  useEffect(() => {
    if (!currentStatus) return
    const timer = setTimeout(() => {
      handleNext()
    }, 5000)
    return () => clearTimeout(timer)
  }, [currentIndex, currentStatus, handleNext])

  if (!group || !currentStatus) return null

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      await apiClient(`/api/statuses/${currentStatus.id}/reply`, {
        method: 'POST',
        token: token || undefined,
        body: JSON.stringify({ text: replyText }),
      })
      setSendingMessage('Reply sent to WhatsApp!')
      setReplyText('')
      setTimeout(() => setSendingMessage(''), 3000)
    } catch (err: any) {
      setSendingMessage(`Error: ${err.message || 'Failed to send'}`)
    } finally {
      setSending(false)
    }
  }

  const handleAiReplyDraft = () => {
    if (currentStatus.caption) {
      setReplyText(`Hey! Loved your update: "${currentStatus.caption.slice(0, 30)}..." 🎉`)
    } else {
      setReplyText(`Hey! Awesome update! 🔥`)
    }
  }

  const bgStyle = currentStatus.backgroundColor
    ? { backgroundColor: currentStatus.backgroundColor }
    : { backgroundColor: '#111827' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div
        className="relative w-full max-w-md h-[80vh] rounded-3xl overflow-hidden flex flex-col justify-between shadow-2xl border border-slate-800"
        style={bgStyle}
      >
        {/* Story Progress Bars */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1.5">
          {statuses.map((s, idx) => (
            <div
              key={s.id}
              className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden"
            >
              <div
                className={`h-full bg-white transition-all duration-300 ${
                  idx < currentIndex
                    ? 'w-full'
                    : idx === currentIndex
                    ? 'w-full animate-pulse'
                    : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Top Header */}
        <div className="relative z-20 px-4 pt-7 pb-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <Avatar
              name={group.contactName}
              src={group.avatarUrl ?? undefined}
              size="sm"
            />
            <div>
              <h4 className="text-sm font-semibold text-white leading-tight">
                {group.contactName}
              </h4>
              <p className="text-[10px] text-slate-300">
                {new Date(currentStatus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Story Media / Text Content */}
        <div className="relative flex-1 flex items-center justify-center p-6 text-center z-10 overflow-hidden">
          {currentStatus.mediaType === 'image' && currentStatus.mediaUrl && (
            <img
              src={currentStatus.mediaUrl}
              alt="Status image"
              className="max-h-full max-w-full object-contain rounded-2xl shadow-lg"
            />
          )}

          {currentStatus.mediaType === 'video' && currentStatus.mediaUrl && (
            <video
              src={currentStatus.mediaUrl}
              controls
              autoPlay
              className="max-h-full max-w-full object-contain rounded-2xl"
            />
          )}

          {currentStatus.mediaType === 'text' && (
            <div className="p-6 text-white text-2xl font-bold leading-relaxed break-words">
              {currentStatus.caption || 'No text content'}
            </div>
          )}

          {/* Caption overlay for media */}
          {currentStatus.mediaType !== 'text' && currentStatus.caption && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-2xl text-white text-sm">
              {currentStatus.caption}
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-30 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-xs transition-all"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {currentIndex < statuses.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-xs transition-all"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* AI Insight Chip & Reply Composer */}
        <div className="relative z-20 p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent flex flex-col gap-2">
          {currentStatus.aiInsight && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-indigo-950/80 border border-indigo-500/40 rounded-xl text-indigo-200 text-xs backdrop-blur-md">
              <div className="flex items-center gap-1.5 truncate">
                <Sparkles size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">{currentStatus.aiInsight}</span>
              </div>
              <button
                onClick={handleAiReplyDraft}
                className="text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded-lg shrink-0 transition-colors"
              >
                AI Draft
              </button>
            </div>
          )}

          {sentMessage && (
            <p className="text-xs text-emerald-400 font-medium text-center">{sentMessage}</p>
          )}

          {!group.isFromMe ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`Reply to ${group.contactName}...`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendReply()}
                className="flex-1 bg-white/10 text-white placeholder-white/50 text-sm px-4 py-2.5 rounded-2xl border border-white/20 focus:outline-none focus:border-white/50 backdrop-blur-md"
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyText.trim()}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl transition-colors shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/70 py-1">
              <Eye size={14} />
              <span>{currentStatus.viewsCount} views</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
