'use client'

import {
  Download,
  ExternalLink,
  FileText,
  Film,
  Image,
  MapPin,
  Mic,
  Phone,
} from 'lucide-react'

interface MessageContentMessage {
  messageType?: string
  body: string | null
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function mediaHref(path: string, token?: string | null): string {
  const base = `${API_BASE}${path}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function MessageContent({
  msg,
  token,
}: {
  msg: MessageContentMessage
  token?: string | null
  isUser: boolean
}) {
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
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={msg.body ?? 'Image'} className="max-w-[220px] rounded-lg object-cover" style={{ maxHeight: 220 }} />
          {msg.body && <p className={textClass}>{msg.body}</p>}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Image size={14} />
        <span>{msg.body ?? (mType === 'sticker' ? 'Sticker' : 'Photo')}</span>
      </div>
    )
  }

  if (mType === 'video') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1">
          <video src={href} controls className="max-w-[220px] rounded-lg" style={{ maxHeight: 180 }} />
          {msg.body && <p className={textClass}>{msg.body}</p>}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Film size={14} />
        <span>{msg.body ?? 'Video'}</span>
      </div>
    )
  }

  if (mType === 'audio') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1.5">
          <audio controls src={href} className="max-w-full h-9" style={{ minWidth: 180 }} />
          {msg.transcription && <p className="text-xs italic text-gray-600">"{msg.transcription}"</p>}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Mic size={14} />
        <span>Voice message</span>
      </div>
    )
  }

  if (mType === 'document') {
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    const fileName = msg.body ?? msg.mediaMimeType?.split('/')[1] ?? 'Document'
    if (href) {
      return (
        <a
          href={href}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FileText size={14} className="flex-shrink-0" />
          <span className="truncate max-w-[160px]">{fileName}</span>
          <Download size={12} className="flex-shrink-0 ml-auto opacity-70" />
        </a>
      )
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <FileText size={14} />
        <span>{fileName}</span>
      </div>
    )
  }

  return <p className={textClass}>{msg.body ?? ''}</p>
}
