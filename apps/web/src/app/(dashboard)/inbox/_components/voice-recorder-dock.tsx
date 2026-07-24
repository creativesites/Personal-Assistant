'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Pause, Play, Square, Trash2, Send, RotateCcw } from 'lucide-react'

interface VoiceRecorderDockProps {
  onSendVoiceNote: (audioFile: File) => void
  onCancel: () => void
}

export function VoiceRecorderDock({ onSendVoiceNote, onCancel }: VoiceRecorderDockProps) {
  const [recordingState, setRecordingState] = useState<'recording' | 'paused' | 'stopped'>('recording')
  const [recordingTime, setRecordingStateTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Start recording on mount
  useEffect(() => {
    let isMounted = true

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream

        // Detect supported MIME type
        let mimeType = 'audio/webm'
        if (MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) {
          mimeType = 'audio/ogg; codecs=opus'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        }

        const recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder
        audioChunksRef.current = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data)
          }
        }

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          setAudioBlob(blob)
          const url = URL.createObjectURL(blob)
          setAudioUrl(url)
        }

        recorder.start(100)
        setRecordingState('recording')

        // Timer
        timerRef.current = setInterval(() => {
          setRecordingStateTime(t => t + 1)
        }, 1000)

        // Live Audio Visualizer Canvas
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          audioCtxRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 64
          source.connect(analyser)

          const bufferLength = analyser.frequencyBinCount
          const dataArray = new Uint8Array(bufferLength)

          const draw = () => {
            if (!canvasRef.current || !isMounted) return
            const canvas = canvasRef.current
            const canvasCtx = canvas.getContext('2d')
            if (!canvasCtx) return

            analyser.getByteFrequencyData(dataArray)

            canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
            const barWidth = (canvas.width / bufferLength) * 1.5
            let x = 0

            for (let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * canvas.height
              canvasCtx.fillStyle = '#6366f1' // Indigo
              canvasCtx.beginPath()
              canvasCtx.roundRect(x, canvas.height - barHeight, barWidth - 1, barHeight, 2)
              canvasCtx.fill()
              x += barWidth + 1
            }

            animationFrameRef.current = requestAnimationFrame(draw)
          }

          draw()
        }
      } catch (err) {
        console.error('Failed to access microphone:', err)
        onCancel()
      }
    }

    startRecording()

    return () => {
      isMounted = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [onCancel])

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.pause()
      setRecordingState('paused')
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      mediaRecorderRef.current.resume()
      setRecordingState('recording')
      timerRef.current = setInterval(() => {
        setRecordingStateTime(t => t + 1)
      }, 1000)
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && (recordingState === 'recording' || recordingState === 'paused')) {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }

  const handleTogglePreview = () => {
    if (!previewAudioRef.current) return
    if (isPreviewPlaying) {
      previewAudioRef.current.pause()
      setIsPreviewPlaying(false)
    } else {
      previewAudioRef.current.play().catch(() => {})
      setIsPreviewPlaying(true)
    }
  }

  const handleSend = () => {
    if (mediaRecorderRef.current && recordingState !== 'stopped') {
      mediaRecorderRef.current.stop()
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }

    setTimeout(() => {
      const blob = audioBlob || new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const mime = blob.type || 'audio/webm'
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `voice_note_${Date.now()}.${ext}`, { type: mime })
      onSendVoiceNote(file)
    }, 150)
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-indigo-50/90 dark:bg-indigo-950/90 border border-indigo-200 dark:border-indigo-800 rounded-2xl w-full shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-200">
      {audioUrl && <audio ref={previewAudioRef} src={audioUrl} onEnded={() => setIsPreviewPlaying(false)} />}

      {/* Recording Indicator & Live Timer */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative flex items-center justify-center w-7 h-7 bg-rose-500 text-white rounded-full shadow-xs">
          <Mic size={14} className="animate-pulse" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-600 rounded-full animate-ping" />
        </div>
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {formatTime(recordingTime)}
        </span>
      </div>

      {/* Live Audio Visualizer Canvas or Recorded Waveform */}
      <div className="flex-1 h-7 flex items-center justify-center overflow-hidden px-2">
        {recordingState !== 'stopped' ? (
          <canvas ref={canvasRef} width={120} height={28} className="w-full h-full" />
        ) : (
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            Voice note ready for playback & send
          </div>
        )}
      </div>

      {/* Actions Toolbar */}
      <div className="flex items-center gap-1.5 shrink-0">
        {recordingState === 'recording' && (
          <button
            onClick={handlePauseRecording}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Pause recording"
          >
            <Pause size={16} />
          </button>
        )}

        {recordingState === 'paused' && (
          <button
            onClick={handleResumeRecording}
            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-colors"
            title="Resume recording"
          >
            <Play size={16} />
          </button>
        )}

        {recordingState !== 'stopped' && (
          <button
            onClick={handleStopRecording}
            className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950 rounded-xl transition-colors"
            title="Stop & preview voice note"
          >
            <Square size={16} />
          </button>
        )}

        {recordingState === 'stopped' && (
          <button
            onClick={handleTogglePreview}
            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-colors"
            title={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
          >
            {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}

        {/* Trash / Cancel */}
        <button
          onClick={onCancel}
          className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950 rounded-xl transition-colors"
          title="Discard voice note"
        >
          <Trash2 size={16} />
        </button>

        {/* Send Voice Note Button */}
        <button
          onClick={handleSend}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs transition-transform active:scale-95 ml-1"
        >
          <Send size={13} />
          <span>Send</span>
        </button>
      </div>
    </div>
  )
}
