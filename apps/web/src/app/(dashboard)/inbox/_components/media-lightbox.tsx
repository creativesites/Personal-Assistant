'use client'

import { useEffect, useState } from 'react'
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { mediaDownloadHref } from './message-content'

export interface LightboxItem {
  /** Message id — used to keep the viewer on the same item as the list changes. */
  id?: string
  type: 'image' | 'video' | 'document'
  url: string
  title?: string
  mimeType?: string
  timestamp?: string
}

/**
 * Full-screen viewer for a conversation's photos and videos.
 * Esc closes, ←/→ page through the chat's media, click a photo to zoom.
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  const item = index !== null ? items[index] : null
  const hasPrev = index !== null && index > 0
  const hasNext = index !== null && index < items.length - 1

  useEffect(() => { setZoomed(false) }, [index])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [index, items.length, onClose, onIndexChange])

  if (!item || index === null) return null

  const when = item.timestamp
    ? new Date(item.timestamp).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-white sm:px-5" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.title || (item.type === 'video' ? 'Video' : 'Photo')}</p>
          <p className="text-[11px] text-white/60">
            {when}{items.length > 1 ? `${when ? ' · ' : ''}${index + 1} of ${items.length}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {item.type === 'image' && (
            <button
              onClick={() => setZoomed(z => !z)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
              title={zoomed ? 'Fit to screen' : 'Actual size'}
            >
              {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
            </button>
          )}
          <a
            href={mediaDownloadHref(item.url)}
            className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Media */}
      <div className={`relative flex flex-1 min-h-0 ${zoomed ? 'overflow-auto' : 'items-center justify-center overflow-hidden'} px-2 pb-4 sm:px-16`}>
        {item.type === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.url}
            src={item.url}
            alt={item.title ?? 'Photo'}
            onClick={e => { e.stopPropagation(); setZoomed(z => !z) }}
            className={zoomed
              ? 'm-auto max-w-none cursor-zoom-out'
              : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-2xl'}
          />
        )}
        {item.type === 'video' && (
          <video
            key={item.url}
            src={item.url}
            controls
            autoPlay
            playsInline
            onClick={e => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg bg-black shadow-2xl"
          />
        )}
        {item.type === 'document' && (
          <iframe
            key={item.url}
            src={item.url}
            title={item.title ?? 'Document'}
            onClick={e => e.stopPropagation()}
            className="h-full w-full max-w-5xl rounded-lg bg-white"
          />
        )}

        {hasPrev && (
          <button
            onClick={e => { e.stopPropagation(); onIndexChange(index - 1) }}
            className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
            title="Previous (←)"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={e => { e.stopPropagation(); onIndexChange(index + 1) }}
            className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
            title="Next (→)"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  )
}
