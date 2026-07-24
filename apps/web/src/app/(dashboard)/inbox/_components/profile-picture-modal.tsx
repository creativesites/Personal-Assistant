'use client'

import { useState } from 'react'
import { X, Download, RefreshCw, User } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { apiClient } from '@/lib/api'

export function ProfilePictureModal({
  contact,
  token,
  onClose,
  onAvatarUpdated,
}: {
  contact: {
    id?: string
    name: string
    avatarUrl?: string | null
    phone?: string | null
    isGroup?: boolean
  } | null
  token?: string | null
  onClose: () => void
  onAvatarUpdated?: (newUrl: string) => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [currentUrl, setCurrentUrl] = useState<string | null>(contact?.avatarUrl ?? null)

  if (!contact) return null

  const handleRefresh = async () => {
    if (!contact.id || !token) return
    setRefreshing(true)
    try {
      const res = await apiClient<{ ok: boolean; avatarUrl?: string | null }>(
        `/api/contacts/${contact.id}/refresh-avatar`,
        { method: 'POST', token }
      )
      if (res?.avatarUrl) {
        setCurrentUrl(res.avatarUrl)
        onAvatarUpdated?.(res.avatarUrl)
      }
    } catch {
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full max-w-2xl flex items-center justify-between text-white py-3 px-5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
            <User size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-white truncate">{contact.name}</h3>
            <p className="text-xs text-slate-300 font-medium truncate">{contact.phone || (contact.isGroup ? 'WhatsApp Group' : 'Contact Profile Photo')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {contact.id && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
              title="Refresh profile picture from WhatsApp"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {currentUrl && (
            <a
              href={currentUrl}
              download={`${contact.name}-profile-photo.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Download full size photo"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Close viewer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 w-full max-w-2xl flex items-center justify-center py-6 px-2 overflow-hidden">
        {currentUrl ? (
          <div className="relative group max-h-[75vh] max-w-full rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
            <img
              src={currentUrl}
              alt={contact.name}
              referrerPolicy="no-referrer"
              className="max-h-[75vh] max-w-full object-contain rounded-2xl"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-3xl border border-white/10 text-center max-w-sm">
            <Avatar name={contact.name} size="xl" className="w-32 h-32 text-4xl mb-4 shadow-xl ring-4 ring-white/10" />
            <p className="text-sm font-bold text-white mb-1">{contact.name}</p>
            <p className="text-xs text-slate-400 mb-4">No custom profile picture set on WhatsApp</p>
            {contact.id && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Fetch from WhatsApp
              </button>
            )}
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
