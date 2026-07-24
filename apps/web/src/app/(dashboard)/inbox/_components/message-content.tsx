'use client'

import { useState, useRef, useEffect } from 'react'
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
  Pause,
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

function mediaHref(path: string, token?: string | null): string {
  // Supabase-stored media is already an absolute public URL — no token needed.
  if (/^https?:\/\//i.test(path)) return path
  const base = `${API_BASE}${path}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

function CustomAudioPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration || 0)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const handleError = () => setError(true)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    // Set initial values if media is cached/loaded
    if (audio.readyState >= 1) {
      setDuration(audio.duration || 0)
    }

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [src])

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
        <Mic size={14} />
        Voice note unavailable
      </div>
    )
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return
    const val = parseFloat(e.target.value)
    audioRef.current.currentTime = val
    setCurrentTime(val)
  }

  const toggleSpeed = () => {
    if (!audioRef.current) return
    let nextRate = 1.0
    if (playbackRate === 1.0) nextRate = 1.5
    else if (playbackRate === 1.5) nextRate = 2.0
    else nextRate = 1.0

    audioRef.current.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  const formatAudioTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100/50 rounded-xl px-3 py-2 min-w-[240px] max-w-full shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 hover:bg-indigo-700 transition shadow-sm active:scale-95"
      >
        {isPlaying ? <Pause size={14} className="fill-white" /> : <Play size={14} className="fill-white ml-0.5" />}
      </button>

      {/* Slider / Progress */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
        />
        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-medium tabular-nums">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration || 0)}</span>
        </div>
      </div>

      {/* Speed Multiplier Button */}
      <button
        onClick={toggleSpeed}
        className="text-[10px] font-bold px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 border border-neutral-200/80 hover:bg-neutral-200/50 hover:text-neutral-700 transition flex-shrink-0 tabular-nums"
      >
        {playbackRate}x
      </button>
    </div>
  )
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <Image size={14} />
        <span>Photo unavailable</span>
      </div>
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setError(true)}
        loading="lazy"
        className="max-w-[220px] rounded-lg object-cover"
        style={{ maxHeight: 220 }}
      />
    </a>
  )
}

export function MessageContent({
  msg,
  token,
  isUser,
}: {
  msg: MessageContentMessage
  token?: string | null
  isUser: boolean
}) {
  const [transcriptionText, setTranscriptionText] = useState<string | null>(msg.transcription ?? null)
  const [transcribing, setTranscribing] = useState(false)

  const handleTranscribe = async () => {
    if (!msg.id || transcribing) return
    setTranscribing(true)
    try {
      const res = await apiClient<{ transcription: string }>(`/api/conversations/messages/${msg.id}/transcribe`, {
        method: 'POST',
        token: token || undefined,
      })
      if (res.transcription) {
        setTranscriptionText(res.transcription)
      }
    } catch (err) {
      console.error('Failed to transcribe audio:', err)
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
    const href = msg.mediaUrl ? mediaHref(msg.mediaUrl, token) : null
    if (href) {
      return (
        <div className="space-y-1">
          <ImagePreview src={href} alt={msg.body ?? 'Image'} />
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
          <video src={href} controls preload="metadata" className="max-w-[220px] rounded-lg bg-black" style={{ maxHeight: 180 }} />
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
        <AudioWaveformPlayer
          src={href}
          isUser={isUser}
          transcription={transcriptionText}
          onTranscribe={msg.id ? handleTranscribe : undefined}
          transcribing={transcribing}
        />
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
