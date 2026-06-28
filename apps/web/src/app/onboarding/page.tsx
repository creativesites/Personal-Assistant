'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'

interface WAStatus {
  connected: boolean
  status: string
  phone?: string | null
  qrCode?: string | null
  linkCode?: string | null
}

const QR_TTL_SECONDS = 175 // slightly under Redis TTL of 180s

const CONNECTION_STAGES = [
  'Authenticating account',
  'Starting secure session',
  'Generating QR code',
]

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <div className={`rounded-full border-2 border-transparent border-t-current animate-spin ${className}`} />
  )
}

export default function OnboardingPage() {
  const { data: sessionData } = useZuriSession()
  const token = sessionData?.accessToken
  const router = useRouter()

  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [linkCodeData, setLinkCodeData] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL_SECONDS)
  const [qrRefreshing, setQrRefreshing] = useState(false)

  const wasActiveRef = useRef(false)
  const lastQrRef = useRef<string | null>(null)
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearQrTimer = () => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current)
      qrTimerRef.current = null
    }
  }

  const startQrCountdown = useCallback(() => {
    clearQrTimer()
    setQrSecondsLeft(QR_TTL_SECONDS)
    setQrRefreshing(false)
    qrTimerRef.current = setInterval(() => {
      setQrSecondsLeft(prev => {
        if (prev <= 1) {
          setQrRefreshing(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => clearQrTimer(), [])

  // ── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false

    const poll = async () => {
      try {
        const s = await apiClient<WAStatus>('/api/whatsapp/status', { token })
        if (cancelled) return

        setWaStatus(s)

        if (s.qrCode && s.qrCode !== lastQrRef.current) {
          lastQrRef.current = s.qrCode
          setQrData(s.qrCode)
          startQrCountdown()
        }

        if (s.linkCode) setLinkCodeData(s.linkCode)

        if (s.status === 'connecting' || s.status === 'qr_pending') {
          wasActiveRef.current = true
        }

        if (s.connected) {
          clearQrTimer()
          apiClient('/api/auth/onboarding-complete', { method: 'POST', token }).catch(() => {})
          router.push('/inbox')
          return
        }

        if (s.status === 'disconnected' && wasActiveRef.current) {
          setConnectError('Connection was lost. Please try again.')
          setQrData(null)
          lastQrRef.current = null
          clearQrTimer()
          wasActiveRef.current = false
        }

        if (s.status === 'error') {
          setQrData(null)
          lastQrRef.current = null
          clearQrTimer()
        }
      } catch {
        // silently ignore poll errors
      }
    }

    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [token, router, startQrCountdown])

  const startConnection = async () => {
    if (!token) return
    setIsStarting(true)
    setConnectError(null)
    setQrData(null)
    lastQrRef.current = null
    wasActiveRef.current = false

    try {
      await apiClient('/api/whatsapp/connect', { method: 'POST', token })
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.status === 409)) {
        setConnectError(err instanceof Error ? err.message : 'Failed to start connection')
      }
    } finally {
      setIsStarting(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const backendStatus = waStatus?.status ?? null
  const isConnected      = waStatus?.connected === true
  const isQrReady        = backendStatus === 'qr_pending' && !!qrData
  const isLinkCodeReady  = backendStatus === 'link_code_pending' && !!linkCodeData
  const isConnectingPhase = isStarting
    || backendStatus === 'connecting'
    || (backendStatus === 'qr_pending' && !qrData)
  const hasError  = backendStatus === 'error' || !!connectError
  const isIdle    = waStatus !== null && !isConnectingPhase && !hasError
                    && !isQrReady && !isLinkCodeReady && !isConnected
  const isFirstLoad = waStatus === null && !connectError

  const activeStage = isStarting ? 0
    : backendStatus === 'connecting' ? 1
    : (backendStatus === 'qr_pending' && !qrData) ? 2
    : -1

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex flex-col">
      {/* Top bar */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="font-bold text-gray-900 text-lg tracking-tight">Zuri</span>
          <a href="/inbox" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Skip for now →
          </a>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-10 sm:py-16">

        {/* ── Progress steps ─────────────────────────────────────────────── */}
        <div className="w-full max-w-lg mb-10">
          <div className="flex items-center justify-center">
            {(['Account Created', 'Connect WhatsApp', "You're Ready"] as const).map((label, i) => (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div className={`h-0.5 w-10 sm:w-16 transition-colors ${
                    i === 1 && isConnected ? 'bg-indigo-500' : i < 1 ? 'bg-indigo-500' : 'bg-gray-200'
                  }`} />
                )}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    i === 0
                      ? 'bg-indigo-600 text-white'
                      : i === 1 && isConnected
                        ? 'bg-indigo-600 text-white'
                        : i === 1
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                          : isConnected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 text-gray-400'
                  }`}>
                    {i === 0 ? <CheckIcon className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    i === 0 ? 'text-gray-500'
                    : i === 1 ? 'text-indigo-600'
                    : isConnected ? 'text-indigo-600' : 'text-gray-300'
                  }`}>{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main card ──────────────────────────────────────────────────── */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Card header */}
          <div className="px-6 sm:px-8 pt-7 pb-5">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1.5">
              Connect your WhatsApp
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Securely connect the WhatsApp account you use for business. Zuri will begin learning
              your communication style once connected.
            </p>
          </div>

          {/* Trust row */}
          <div className="px-6 sm:px-8 py-3 bg-gray-50 border-y border-gray-100 flex flex-wrap gap-x-5 gap-y-1.5">
            {[
              ['🔒', 'End-to-end encrypted'],
              ['🔐', 'Credentials never stored'],
              ['📱', 'Uses your existing account'],
              ['⚡', 'Under 60 seconds'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-1.5">
                <span className="text-sm">{icon}</span>
                <span className="text-xs text-gray-500">{text}</span>
              </div>
            ))}
          </div>

          {/* Card body */}
          <div className="px-6 sm:px-8 py-8">

            {/* First load */}
            {isFirstLoad && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Spinner className="w-7 h-7 text-indigo-500" />
                <p className="text-sm text-gray-400">Checking connection status…</p>
              </div>
            )}

            {/* Idle */}
            {isIdle && (
              <div className="flex flex-col items-center gap-6 py-4 text-center">
                <div className="w-18 h-18 w-16 h-16 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl flex items-center justify-center text-3xl shadow-inner">
                  📱
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800 mb-1">No WhatsApp connected</p>
                  <p className="text-sm text-gray-500">
                    Connect the WhatsApp number you use for your business.
                  </p>
                </div>
                <button
                  onClick={startConnection}
                  disabled={!token}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-indigo-200"
                >
                  Connect WhatsApp
                </button>
              </div>
            )}

            {/* Connecting — stage checklist */}
            {isConnectingPhase && (
              <div className="flex flex-col items-center gap-8 py-4">
                <div className="w-full max-w-xs space-y-4">
                  {CONNECTION_STAGES.map((label, i) => {
                    const isDone   = activeStage > i || activeStage === -1
                    const isActive = activeStage === i
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone   ? 'bg-emerald-500' :
                          isActive ? 'bg-indigo-100' :
                                     'bg-gray-100'
                        }`}>
                          {isDone   && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                          {isActive && <Spinner className="w-3 h-3 text-indigo-500" />}
                          {!isDone && !isActive && (
                            <div className="w-2 h-2 rounded-full bg-gray-300" />
                          )}
                        </div>
                        <span className={`text-sm transition-colors ${
                          isDone   ? 'text-gray-400 line-through' :
                          isActive ? 'text-gray-800 font-medium' :
                                     'text-gray-300'
                        }`}>{label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-gray-500 font-medium">Usually takes 20–40 seconds</p>
                  <p className="text-xs text-gray-400">Don&apos;t close this page</p>
                </div>
              </div>
            )}

            {/* QR code */}
            {isQrReady && !isConnected && (
              <div className="flex flex-col sm:flex-row gap-8 items-center sm:items-start">
                {/* QR image + countdown */}
                <div className="flex flex-col items-center gap-3 flex-shrink-0">
                  <div className="relative w-52 h-52">
                    <img
                      src={qrData!}
                      alt="WhatsApp QR code"
                      className={`w-full h-full rounded-2xl border-2 border-gray-100 shadow-sm transition-opacity duration-300 ${
                        qrRefreshing ? 'opacity-20' : 'opacity-100'
                      }`}
                    />
                    {qrRefreshing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <Spinner className="w-7 h-7 text-indigo-500" />
                        <p className="text-xs text-gray-600 font-medium">Refreshing QR…</p>
                      </div>
                    )}
                    {/* Corner scan hint */}
                    {!qrRefreshing && (
                      <>
                        <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
                        <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
                        <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
                        <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br" />
                      </>
                    )}
                  </div>

                  {/* Timer */}
                  {!qrRefreshing && (
                    <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                      qrSecondsLeft < 30 ? 'text-orange-500' : 'text-gray-400'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        qrSecondsLeft < 30 ? 'bg-orange-400' : 'bg-green-400'
                      }`} />
                      Expires in {fmtTime(qrSecondsLeft)}
                    </div>
                  )}

                  {/* Live status */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="text-xs text-gray-400">Waiting for phone…</span>
                  </div>
                </div>

                {/* Instructions */}
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <p className="text-sm font-bold text-gray-800 mb-4 text-center sm:text-left">
                    How to scan
                  </p>
                  <ol className="space-y-3">
                    {[
                      'Open WhatsApp on your phone',
                      'Tap ⋮ (Android) or Settings (iPhone)',
                      'Tap Linked Devices',
                      'Tap Link a Device',
                      'Point your camera at the QR code',
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-600 leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Link code */}
            {isLinkCodeReady && !isConnected && (
              <div className="space-y-5 text-center">
                <div>
                  <p className="text-base font-semibold text-gray-800 mb-1">Enter this code in WhatsApp</p>
                  <p className="text-xs text-gray-400">
                    Open WhatsApp → Settings → Linked Devices → Link with phone number
                  </p>
                </div>
                <div className="inline-flex bg-gray-50 border border-gray-200 rounded-2xl px-8 py-5">
                  <p className="font-mono text-4xl font-bold text-gray-900 tracking-[0.3em]">
                    {linkCodeData}
                  </p>
                </div>
              </div>
            )}

            {/* Connected */}
            {isConnected && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="relative">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                    <CheckIcon className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckIcon className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">WhatsApp Connected!</p>
                  <p className="text-sm text-gray-500 mt-1">Redirecting you to the dashboard…</p>
                </div>
                <Spinner className="w-5 h-5 text-indigo-400 mt-1" />
              </div>
            )}

            {/* Error */}
            {hasError && !isConnected && !isQrReady && !isLinkCodeReady && !isConnectingPhase && (
              <div className="space-y-5">
                <div className="flex gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold">
                    !
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800">Connection failed</p>
                    <p className="text-xs text-red-600 mt-0.5 break-words">
                      {connectError || 'WhatsApp connection failed. Please try again.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={startConnection}
                  disabled={isStarting}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isStarting ? 'Retrying…' : 'Try again'}
                </button>
              </div>
            )}
          </div>

          {/* Card footer — only during QR */}
          {isQrReady && !isConnected && (
            <div className="px-6 sm:px-8 py-4 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
              <span className="text-amber-500 text-sm leading-none mt-0.5">💡</span>
              <p className="text-xs text-amber-700">
                <strong>Keep this tab open.</strong> The QR code is only valid while you&apos;re on this page.
                If it expires, a new one will appear automatically.
              </p>
            </div>
          )}
        </div>

        {/* Bottom link */}
        <p className="mt-6 text-xs text-gray-400 text-center">
          Having trouble?{' '}
          <a href="/diagnostics" className="text-indigo-500 hover:text-indigo-600 underline underline-offset-2">
            Run diagnostics
          </a>
        </p>
      </div>
    </div>
  )
}
