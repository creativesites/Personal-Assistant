'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { apiClient } from '@/lib/api'

// Lifted out of documents/new/page.tsx (the create wizard) verbatim so both
// the create wizard and the /documents/[id]/edit page share one contact-
// search implementation instead of two copies.

export interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  jobTitle?: string
}

export function ContactPicker({ token, onSelect }: { token?: string; onSelect: (c: Contact | null) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    const q = query ? `?q=${encodeURIComponent(query)}` : ''
    apiClient<{ contacts: Contact[] }>(`/api/contacts${q}`, { token })
      .then(d => setResults(d.contacts?.slice(0, 10) ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [open, query, token])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:border-indigo-300 bg-white transition-colors min-h-11"
      >
        <Search className="w-4 h-4 flex-shrink-0 text-gray-400" />
        <span className="flex-1 text-left">Search contacts…</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Type a name…"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-indigo-400" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? <p className="text-xs text-center py-4 text-gray-400">Searching…</p>
              : results.length === 0 ? <p className="text-xs text-center py-4 text-gray-400">No contacts found</p>
              : results.map(c => (
                <button key={c.id} onClick={() => { onSelect(c); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {c.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                  </div>
                </button>
              ))}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button onClick={() => { onSelect(null); setOpen(false) }}
              className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-semibold text-center py-1.5">
              + Enter client details manually ↓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
