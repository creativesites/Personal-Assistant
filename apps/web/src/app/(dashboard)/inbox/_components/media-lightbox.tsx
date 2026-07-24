'use client'

import { useState } from 'react'
import { X, Download, FileText, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

export interface LightboxItem {
  type: 'image' | 'video' | 'document'
  url: string
  title?: string
  mimeType?: string
}

export function MediaLightbox({
  item,
  onClose,
}: {
  item: LightboxItem | null
  onClose: () => void
}) {
  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between text-white py-2 px-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-indigo-400 shrink-0" />
          <span className="text-sm font-semibold truncate">{item.title || 'Media Preview'}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={item.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Download file"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Close viewer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Media Content */}
      <div className="flex-1 w-full max-w-5xl flex items-center justify-center py-6 px-2 overflow-hidden">
        {item.type === 'image' && (
          <img
            src={item.url}
            alt={item.title || 'Image Preview'}
            className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
          />
        )}

        {item.type === 'video' && (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-h-[82vh] max-w-full rounded-2xl shadow-2xl ring-1 ring-white/10"
          />
        )}

        {item.type === 'document' && (
          <div className="w-full h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-200">
            <iframe
              src={`${item.url}#toolbar=1`}
              className="w-full flex-1 border-none"
              title={item.title || 'Document Preview'}
            />
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-xs text-white/60 text-center pb-2">
        Press <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-white font-mono">Esc</kbd> or click X to close
      </div>
    </div>
  )
}
