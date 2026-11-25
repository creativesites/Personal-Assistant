'use client'

import { useState, type ReactNode } from 'react'
import {
  Download,
  ExternalLink,
  FileText,
  Film,
  Image,
  MapPin,
  Mic,
  Phone,
  Play,
} from 'lucide-react'

import { AudioWaveformPlayer } from './audio-waveform-player'
import { apiClient } from '@/lib/api'

interface MessageContentMessage {
  id?: string
  messageType?: string
  body: string | null
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export function mediaHref(path: string, token?: string | null): string {
  // Absolute URLs (Supabase public media) and local previews (blob:/data:) need no API base or token.
  if (/^(https?:|blob:|data:)/i.test(path)) return path
  const base = `${API_BASE}${path}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

/** Same URL, but the API answers with Content-Disposition: attachment so the browser saves it. */
export function mediaDownloadHref(url: string): string {
  if (!/\/api\/messages\/[^/]+\/media/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

function MediaUnavailable({ kind, icon, caption, textClass, unavailableText = 'Not available — imported from history' }: { kind: string; icon: ReactNode; caption?: string | null; textClass: string; unavailableText?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex w-56 max-w-full items-center gap-3 rounded-xl bg-gray-100/80 px-3 py-3 text-gray-500 ring-1 ring-gray-200/70">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-gray-400">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-600">{kind}</p>
          <p className="text-[11px] leading-tight">{unavailableText}</p>
        </div>
      </div>
      {caption && <p className={textClass}>{caption}</p>}
    </div>
  )
}

function ImagePreview({ src, alt, onOpen }: { src: string; alt: string; onOpen?: () => void }) {
  const [error, setError] = useState(false)
  if (error) {
    return <MediaUnavailable kind="Photo" icon={<Image size={20} />} textClass="" unavailableText="Couldn't load this photo" />
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen?.() }}
      className="block cursor-zoom-in overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      title="View photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setError(true)}
        loading="lazy"
        className="max-w-[260px] rounded-lg object-cover transition hover:brightness-95"
        style={{ maxHeight: 320 }}
      />
    </button>
  )
}

/** Poster frame with a play button; playback happens in the full-screen viewer (full controls). */
function VideoPreview({ src, onOpen }: { src: string; onOpen?: () => void }) {
  const [error, setError] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  if (error) {
    return <MediaUnavailable kind="Video" icon={<Film size={20} />} textClass="" unavailableText="Couldn't load this video" />
  }
  if (!onOpen) {
    return <video src={src} controls playsInline preload="metadata" onError={() => setError(true)} className="max-w-[260px] rounded-lg bg-black" style={{ maxHeight: 320 }} />
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen() }}
      className="group relative block overflow-hidden rounded-lg bg-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
      title="Play video"
    >
      <video
        src={`${src}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        onError={() => setError(true)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        className="pointer-events-none max-w-[260px] object-cover"
        style={{ maxHeight: 320, minHeight: 120, minWidth: 160 }}
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/30">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
          <Play size={22} className="ml-0.5" fill="currentColor" />
        </span>
      </span>
      {duration !== null && Number.isFinite(duration) && (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </span>
      )}
    </button>
  )
}

export function MessageContent({
  msg,
  token,
  isUser,
  onOpenMedia,
}: {
  msg: MessageContentMessage
  token?: string | null
  isUser: boolean
  /** Opens the full-screen viewer for this message's photo/video/PDF. */
  onOpenMedia?: (messageId: string) => void
}) {
  const [transcriptionText, setTranscriptionText] = useState<string | null>(
    // '[Audio voice message]' was stored by older code when transcription failed.
    msg.transcription && msg.transcription !== '[Audio voice message]' ? msg.transcription : null,
  )
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)

  const handleTranscribe = async () => {
    if (!msg.id || transcribing) return
    setTranscribing(true)
    setTranscribeError(null)
    try {
      const res = await apiClient<{ transcription: string }>(`/api/conversations/messages/${msg.id}/transcribe`, {
        method: 'POST',
        token: token || undefined,
      })
      if (res.transcription) {
        setTranscriptionText(res.transcription)
      }
    } catch (err) {
      setTranscribeError((err as { data?: { error?: string } })?.data?.error || (err as Error)?.message || 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  const mType = msg.messageType ?? 'text'
  const textClass = 'leading-relaxed whitespace-pre-wrap text-sm text-[#111b21]'

  if (mType === 'deleted') {
    return <p className="italic text-sm text-gray-500">This message was deleted</p>
  }

  if (mType === 'location' && msg.body) {
    try {
      const loc = JSON.parse(msg.body) as { lat: number; lng: number; name?: string; address?: string }
      const mapsUrl = `https://maps.google.com/?q=${loc.lat},${loc.lng}`
      return (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          <MapPin size={14} className="flex-shrink-0" />
          <span>{loc.name ?? loc.address ?? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}</span>
          <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
        </a>
      )
    } catch {
      return <p className={textClass}>{msg.body}</p>
    }
  }

  if (mType === 'contact_card') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
          <Phone size={13} className="text-gray-500" />
        </div>
        <span>{msg.body ?? 'Contact card'}</span>
      </div>
    )
  }

  if (mType === 'image' || mType === 'sticker') {
    const isSticker = mType === 'sticker'
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (!href) return <MediaUnavailable kind={isSticker ? 'Sticker' : 'Photo'} icon={<Image size={20} />} caption={msg.body} textClass={textClass} />
    if (isSticker) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href} alt="Sticker" loading="lazy" className="h-32 w-32 object-contain" />
      )
    }
    return (
      <div className="space-y-1">
        <ImagePreview src={href} alt={msg.body ?? 'Photo'} onOpen={onOpenMedia && msg.id ? () => onOpenMedia(msg.id!) : undefined} />
        {msg.body && <p className={textClass}>{msg.body}</p>}
      </div>
    )
  }

  if (mType === 'video') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (!href) return <MediaUnavailable kind="Video" icon={<Film size={20} />} caption={msg.body} textClass={textClass} />
    return (
      <div className="space-y-1">
        <VideoPreview src={href} onOpen={onOpenMedia && msg.id ? () => onOpenMedia(msg.id!) : undefined} />
        {msg.body && <p className={textClass}>{msg.body}</p>}
      </div>
    )
  }

  if (mType === 'audio') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (!href) return <MediaUnavailable kind="Voice message" icon={<Mic size={20} />} textClass={textClass} />
    return (
      <div className="space-y-1">
        <AudioWaveformPlayer
          src={href}
          isUser={isUser}
          transcription={transcriptionText}
          onTranscribe={msg.id ? handleTranscribe : undefined}
          transcribing={transcribing}
        />
        {transcribeError && <p className="text-[11px] text-rose-600">{transcribeError}</p>}
        <a href={mediaDownloadHref(href)} className="inline-flex min-h-8 items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600">
          <Download size={11} /> Download
        </a>
      </div>
    )
  }

  if (mType === 'document') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    const fileName = msg.body ?? msg.mediaMimeType?.split('/')[1] ?? 'Document'
    if (!href) return <MediaUnavailable kind="Document" icon={<FileText size={20} />} caption={fileName} textClass={textClass} />
    const ext = (fileName.includes('.') ? fileName.split('.').pop() : msg.mediaMimeType?.split('/')[1])?.toUpperCase().slice(0, 4)
    const isPdf = msg.mediaMimeType === 'application/pdf' || /\.pdf$/i.test(fileName)
    return (
      <div className="flex w-64 max-w-full items-center gap-3 rounded-xl border border-gray-200 bg-white/80 p-2.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600">
          {ext || <FileText size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-800" title={fileName}>{fileName}</p>
          {isPdf && onOpenMedia && msg.id && (
            <button onClick={() => onOpenMedia(msg.id!)} className="text-[11px] font-semibold text-indigo-600 hover:underline">Open</button>
          )}
        </div>
        <a
          href={mediaDownloadHref(href)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
          title="Download"
        >
          <Download size={16} />
        </a>
      </div>
    )
  }

  return <p className={textClass}>{msg.body ?? ''}</p>
}
