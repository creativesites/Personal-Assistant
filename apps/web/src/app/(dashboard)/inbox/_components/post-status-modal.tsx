'use client'

import React, { useState } from 'react'
import { X, Sparkles, Send, Type, Image as ImageIcon, Palette } from 'lucide-react'
import { apiClient } from '@/lib/api'

interface PostStatusModalProps {
  open: boolean
  token?: string | null
  onClose: () => void
  onSuccess: () => void
}

const BG_COLORS = [
  { name: 'Charcoal', hex: '#1f2937' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Crimson', hex: '#dc2626' },
]

export function PostStatusModal({ open, token, onClose, onSuccess }: PostStatusModalProps) {
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('text')
  const [content, setContent] = useState('')
  const [caption, setCaption] = useState('')
  const [selectedBg, setSelectedBg] = useState(BG_COLORS[1].hex) // Emerald
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handlePost = async () => {
    if (!content.trim() && mediaType === 'text') return
    if (!content.trim() && mediaType !== 'text') return

    setLoading(true)
    setError('')

    try {
      await apiClient('/api/statuses', {
        method: 'POST',
        token: token || undefined,
        body: JSON.stringify({
          mediaType,
          content,
          caption: mediaType !== 'text' ? caption : undefined,
          backgroundColor: mediaType === 'text' ? selectedBg : undefined,
        }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to broadcast status')
    } finally {
      setLoading(false)
    }
  }

  const handleAiPolish = () => {
    if (!content.trim()) return
    setContent(`✨ ${content.trim()} 🚀`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            Post WhatsApp Status
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Media Type Selector */}
        <div className="flex p-2 bg-slate-100 dark:bg-slate-900/50 m-4 rounded-2xl gap-1">
          <button
            onClick={() => setMediaType('text')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
              mediaType === 'text'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Type size={14} />
            Text Status
          </button>
          <button
            onClick={() => setMediaType('image')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
              mediaType === 'image'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ImageIcon size={14} />
            Image / Video
          </button>
        </div>

        {/* Body Form */}
        <div className="px-5 space-y-4 pb-4">
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
              {error}
            </p>
          )}

          {mediaType === 'text' ? (
            <>
              {/* Text Preview Canvas */}
              <div
                className="w-full h-44 rounded-2xl p-4 flex items-center justify-center text-center text-white font-bold text-lg shadow-inner transition-colors"
                style={{ backgroundColor: selectedBg }}
              >
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="What's on your mind?..."
                  className="w-full h-full bg-transparent text-center text-white placeholder-white/60 focus:outline-none resize-none font-bold"
                />
              </div>

              {/* Color Palette Selector */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium">
                  <Palette size={13} /> Background Color
                </span>
                <div className="flex items-center gap-1.5">
                  {BG_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setSelectedBg(c.hex)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        selectedBg === c.hex ? 'ring-2 ring-indigo-500 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Media Direct URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/status-image.jpg"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Caption (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Add a caption..."
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleAiPolish}
            disabled={!content.trim()}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 transition-colors"
          >
            <Sparkles size={14} />
            AI Polish
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePost}
              disabled={loading || !content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl shadow-xs transition-colors"
            >
              <Send size={14} />
              {loading ? 'Broadcasting...' : 'Post Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
