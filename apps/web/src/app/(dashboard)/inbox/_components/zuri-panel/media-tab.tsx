'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Film, Image as ImageIcon, Link2, Loader2, Mic, Play } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { mediaDownloadHref, mediaHref } from '../message-content'
import type { LightboxItem } from '../media-lightbox'

type Kind = 'media' | 'docs' | 'audio' | 'links'

interface MediaItem {
  messageId: string
  type: string
  caption: string | null
  mediaUrl: string
  mimeType: string | null
  transcription: string | null
  fromMe: boolean
  senderName: string | null
  at: string
}
interface LinkItem { messageId: string; url: string; fromMe: boolean; at: string }
interface Counts { media: number; docs: number; audio: number; links: number; unavailable: number }
interface Page { kind: Kind; counts: Counts; items: (MediaItem | LinkItem)[]; nextBefore: string | null }

const KINDS: { id: Kind; label: string; icon: React.ReactNode }[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon size={13} /> },
  { id: 'docs', label: 'Docs', icon: <FileText size={13} /> },
  { id: 'audio', label: 'Voice', icon: <Mic size={13} /> },
  { id: 'links', label: 'Links', icon: <Link2 size={13} /> },
]

function day(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function isPdf(m: MediaItem): boolean {
  return m.mimeType === 'application/pdf' || /\.pdf$/i.test(m.caption ?? '')
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/** Every photo, video, document, voice note and link in this chat. */
export function MediaTab({
  conversationId,
  token,
  contactName,
  onOpenViewer,
}: {
  conversationId: string
  token: string | null
  contactName: string
  onOpenViewer: (items: LightboxItem[], index: number) => void
}) {
  const [kind, setKind] = useState<Kind>('media')
  const [page, setPage] = useState<Page | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (k: Kind, before?: string | null) => {
    if (!token) return
    setLoading(true); setError(false)
    try {
      const q = new URLSearchParams({ kind: k, ...(before ? { before } : {}) })
      const res = await apiClient<Page>(`/api/conversations/${conversationId}/zuri/media?${q}`, { token })
      setCounts(res.counts)
      setPage(prev => before && prev && prev.kind === k ? { ...res, items: [...prev.items, ...res.items] } : res)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [conversationId, token])

  useEffect(() => { setPage(null); load(kind) }, [kind, load])
  useEffect(() => { setKind('media'); setCounts(null) }, [conversationId])

  const who = (m: { fromMe: boolean; senderName?: string | null }) => (m.fromMe ? 'You' : m.senderName || contactName.split(' ')[0])

  const viewerItems = (items: MediaItem[]): LightboxItem[] => items.map(m => ({
    id: m.messageId,
    type: m.type === 'video' ? 'video' : m.type === 'document' ? 'document' : 'image',
    url: mediaHref(m.mediaUrl, token),
    title: m.type === 'document' ? (m.caption ?? 'Document') : who(m),
    mimeType: m.mimeType ?? undefined,
    timestamp: m.at,
  }))

  const items = (page?.kind === kind ? page.items : []) as MediaItem[]
  const linkItems = (page?.kind === kind ? page.items : []) as LinkItem[]

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 grid grid-cols-4 gap-1 border-b border-gray-100 bg-white/95 p-2 backdrop-blur">
        {KINDS.map(k => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`flex min-h-9 flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors ${
              kind === k.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-1">{k.icon}{k.label}</span>
            {counts && <span className="text-[10px] font-medium tabular-nums text-gray-400">{counts[k.id]}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 p-2">
        {error && (
          <p className="p-6 text-center text-sm text-gray-500">
            Couldn&apos;t load media. <button onClick={() => load(kind)} className="font-semibold text-indigo-600">Try again</button>
          </p>
        )}

        {!error && page?.kind === kind && page.items.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-600">Nothing here yet</p>
            {kind !== 'links' && (counts?.unavailable ?? 0) > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {counts!.unavailable} older item{counts!.unavailable === 1 ? '' : 's'} from the history import can&apos;t be downloaded.
              </p>
            )}
          </div>
        )}

        {/* Photos & videos grid */}
        {kind === 'media' && items.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {items.map((m, i) => {
              const src = mediaHref(m.mediaUrl, token)
              return (
                <button
                  key={m.messageId}
                  onClick={() => onOpenViewer(viewerItems(items), i)}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title={`${who(m)} · ${day(m.at)}`}
                >
                  {m.type === 'video' ? (
                    <>
                      <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"><Play size={14} className="ml-0.5" fill="currentColor" /></span>
                      </span>
                      <Film size={11} className="absolute bottom-1 left-1 text-white drop-shadow" />
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={m.caption ?? 'Photo'} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Documents */}
        {kind === 'docs' && items.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {items.map(m => {
              const href = mediaHref(m.mediaUrl, token)
              const name = m.caption || 'Document'
              const ext = (name.includes('.') ? name.split('.').pop() : m.mimeType?.split('/')[1])?.toUpperCase().slice(0, 4)
              const pdf = isPdf(m)
              return (
                <li key={m.messageId} className="flex items-center gap-2.5 px-1 py-2">
                  <button
                    disabled={!pdf}
                    onClick={() => {
                      const pdfs = items.filter(isPdf)
                      onOpenViewer(viewerItems(pdfs), pdfs.findIndex(p => p.messageId === m.messageId))
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left enabled:hover:opacity-80"
                  >
                    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${pdf ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {ext || <FileText size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-gray-800">{name}</span>
                      <span className="block text-[11px] text-gray-400">{who(m)} · {day(m.at)}{pdf ? ' · tap to open' : ''}</span>
                    </span>
                  </button>
                  <a href={mediaDownloadHref(href)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600" title="Download">
                    <Download size={15} />
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        {/* Voice notes */}
        {kind === 'audio' && items.length > 0 && (
          <ul className="space-y-2">
            {items.map(m => {
              const href = mediaHref(m.mediaUrl, token)
              return (
                <li key={m.messageId} className="rounded-xl border border-gray-100 bg-white p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-700">{who(m)}</span>
                    <span>{day(m.at)}</span>
                  </div>
                  <audio src={href} controls preload="none" className="h-9 w-full" />
                  {m.transcription && <p className="mt-1.5 text-[12px] leading-snug text-gray-600">“{m.transcription}”</p>}
                  <a href={mediaDownloadHref(href)} className="mt-1 inline-flex min-h-7 items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-indigo-600">
                    <Download size={11} /> Download
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        {/* Links */}
        {kind === 'links' && linkItems.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {linkItems.map((l, i) => (
              <li key={`${l.messageId}-${i}`}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-1 py-2 hover:bg-gray-50">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Link2 size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-800">{host(l.url)}</span>
                    <span className="block truncate text-[11px] text-gray-400">{l.url}</span>
                  </span>
                  <ExternalLink size={13} className="flex-shrink-0 text-gray-300" />
                </a>
              </li>
            ))}
          </ul>
        )}

        {loading && (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
        )}
        {!loading && page?.kind === kind && page.nextBefore && (
          <button onClick={() => load(kind, page.nextBefore)} className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
            Load older
          </button>
        )}
      </div>
    </div>
  )
}
