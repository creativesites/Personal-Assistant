'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Mic, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface AudioWaveformPlayerProps {
  src: string
  isUser?: boolean
  transcription?: string | null
  onTranscribe?: () => void
  transcribing?: boolean
}

const BAR_COUNT = 36

export function AudioWaveformPlayer({
  src,
  isUser = false,
  transcription,
  onTranscribe,
  transcribing = false,
}: AudioWaveformPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [error, setError] = useState(false)
  const [bars, setBars] = useState<number[]>([])
  const [showTranscription, setShowTranscription] = useState(true)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Generate real audio waveform amplitude peaks or fallback deterministic peaks
  useEffect(() => {
    let isMounted = true

    const generateFallbackPeaks = () => {
      const peaks: number[] = []
      let hash = 0
      for (let i = 0; i < src.length; i++) {
        hash = (hash << 5) - hash + src.charCodeAt(i)
        hash |= 0
      }
      for (let i = 0; i < BAR_COUNT; i++) {
        const pseudo = Math.abs(Math.sin(hash * (i + 1)))
        peaks.push(Math.max(0.18, Math.min(1.0, pseudo)))
      }
      if (isMounted) setBars(peaks)
    }

    async function extractWaveform() {
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error('Fetch failed')
        const arrayBuffer = await response.arrayBuffer()
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtx) {
          generateFallbackPeaks()
          return
        }
        const audioCtx = new AudioCtx()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)
        const blockSize = Math.floor(channelData.length / BAR_COUNT)
        const sampledPeaks: number[] = []

        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j] || 0)
          }
          const avg = sum / blockSize
          sampledPeaks.push(Math.max(0.18, Math.min(1.0, avg * 3.5)))
        }

        if (isMounted) setBars(sampledPeaks)
        audioCtx.close()
      } catch {
        generateFallbackPeaks()
      }
    }

    extractWaveform()

    return () => {
      isMounted = false
    }
  }, [src])

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

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
  }

  const handleBarClick = (index: number) => {
    if (!audioRef.current || duration <= 0) return
    const targetRatio = index / BAR_COUNT
    const targetTime = targetRatio * duration
    audioRef.current.currentTime = targetTime
    setCurrentTime(targetTime)
  }

  const toggleSpeed = () => {
    if (!audioRef.current) return
    let nextRate = 1.0
    if (playbackRate === 1.0) nextRate = 1.25
    else if (playbackRate === 1.25) nextRate = 1.5
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

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
        <Mic size={14} />
        Voice note unavailable
      </div>
    )
  }

  const progressRatio = duration > 0 ? currentTime / duration : 0
  const activeBarIndex = Math.floor(progressRatio * BAR_COUNT)

  return (
    <div className="flex flex-col gap-2 min-w-[260px] max-w-full">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Main Waveform Card */}
      <div
        className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all ${
          isUser
            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
            : 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border-slate-200/80 dark:border-slate-700/80 shadow-xs'
        }`}
      >
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
            isUser
              ? 'bg-white text-indigo-600 hover:bg-slate-100'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {isPlaying ? (
            <Pause size={15} className="fill-current" />
          ) : (
            <Play size={15} className="fill-current ml-0.5" />
          )}
        </button>

        {/* Dynamic Waveform Visualizer Bars */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex items-end gap-[2px] h-8 cursor-pointer group py-0.5" title="Click to seek">
            {bars.map((heightRatio, idx) => {
              const isActive = idx <= activeBarIndex
              return (
                <button
                  key={idx}
                  onClick={() => handleBarClick(idx)}
                  className="flex-1 flex items-end h-full focus:outline-none group/bar"
                >
                  <div
                    className={`w-full rounded-full transition-all duration-150 ${
                      isActive
                        ? isUser
                          ? 'bg-white'
                          : 'bg-indigo-600 dark:bg-indigo-400'
                        : isUser
                        ? 'bg-indigo-300/50'
                        : 'bg-slate-300 dark:bg-slate-600'
                    } group-hover/bar:brightness-125`}
                    style={{ height: `${Math.max(15, heightRatio * 100)}%` }}
                  />
                </button>
              )
            })}
          </div>

          {/* Time & Speed Controls */}
          <div
            className={`flex items-center justify-between text-[10px] font-semibold tabular-nums ${
              isUser ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration || 0)}</span>
          </div>
        </div>

        {/* Playback Speed Multiplier Pill */}
        <button
          onClick={toggleSpeed}
          className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all shrink-0 tabular-nums ${
            isUser
              ? 'bg-indigo-700/60 border-indigo-400/40 text-white hover:bg-indigo-700'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
          }`}
        >
          {playbackRate}x
        </button>
      </div>

      {/* Transcription Block */}
      {transcription ? (
        <div className="mt-0.5 bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-700 dark:text-slate-300 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              <Sparkles size={11} className="text-amber-500" />
              Zuri Voice Transcription
            </span>
            <button
              onClick={() => setShowTranscription(prev => !prev)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
            >
              {showTranscription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          {showTranscription && (
            <p className="italic leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-indigo-500/50">
              "{transcription}"
            </p>
          )}
        </div>
      ) : onTranscribe ? (
        <button
          onClick={onTranscribe}
          disabled={transcribing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold transition-all self-start shadow-2xs disabled:opacity-50"
        >
          {transcribing ? (
            <>
              <Loader2 size={13} className="animate-spin text-indigo-600" />
              <span>Transcribing voice note...</span>
            </>
          ) : (
            <>
              <Sparkles size={13} className="text-amber-500" />
              <span>Transcribe with Zuri AI</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}
