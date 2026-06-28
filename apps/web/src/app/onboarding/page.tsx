'use client'

import { useEffect, useRef, useState } from 'react'
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

export default function OnboardingPage() {
  const { data: sessionData, status: sessionStatus } = useZuriSession()
  const token = sessionData?.accessToken
  const router = useRouter()

  // Raw status from the last successful poll (null = not yet loaded)
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  // Last known QR data — persists so the image stays visible while the QR refreshes
  const [qrData, setQrData] = useState<string | null>(null)
  // Last known link code
  const [linkCodeData, setLinkCodeData] = useState<string | null>(null)
  // True while the POST /connect call is in flight
  const [isStarting, setIsStarting] = useState(false)
  // Error from the POST /connect call or a lost connection
  const [connectError, setConnectError] = useState<string | null>(null)
  // Tracks whether we've seen an active backend state this page session so we
  // can show an error (not silent idle) when the session drops unexpectedly
  const wasActiveRef = useRef(false)

  // ── Polling ────────────────────────────────────────────────────────────────
  // Starts as soon as we have a token; runs the whole time the page is open.
  // The UI is derived entirely from `waStatus` — not from button clicks.
  useEffect(() => {
    if (!token) return

    let cancelled = false

    const poll = async () => {
      try {
        const s = await apiClient<WAStatus>('/api/whatsapp/status', { token })
        if (cancelled) return

        setWaStatus(s)
        if (s.qrCode) setQrData(s.qrCode)
        if (s.linkCode) setLinkCodeData(s.linkCode)

        // Track that we've reached an active state so a drop looks like an error
        if (s.status === 'connecting' || s.status === 'qr_pending') {
          wasActiveRef.current = true
        }

        if (s.connected) {
          apiClient('/api/auth/onboarding-complete', { method: 'POST', token }).catch(() => {})
          router.push('/inbox')
          return
        }

        // Session dropped after we were already in an active state → surface as error
        if (s.status === 'disconnected' && wasActiveRef.current) {
          setConnectError('Connection was lost. Please try again.')
          wasActiveRef.current = false
        }
      } catch (err) {
        if (!cancelled) console.error('[onboarding poll]', err)
      }
    }

    poll() // run immediately on mount so we never wait 2 s for the first result
    const id = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [token, router])

  // ── Actions ────────────────────────────────────────────────────────────────
  const startConnection = async () => {
    if (!token) return
    setIsStarting(true)
    setConnectError(null)
    wasActiveRef.current = false

    try {
      await apiClient('/api/whatsapp/connect', { method: 'POST', token })
    } catch (err: any) {
      // 409 = session already active (restoreAll() beat us) — polling will surface the QR
      if (!(err instanceof ApiError && err.status === 409)) {
        setConnectError(err.message || 'Failed to start connection')
      }
    } finally {
      setIsStarting(false)
    }
    // Don't update waStatus here — polling will do it within 2 s
  }

  // ── Derived display state (priority order) ────────────────────────────────
  const s = waStatus
  const backendStatus = s?.status ?? null

  const isConnected     = s?.connected === true
  const isQrReady       = backendStatus === 'qr_pending' && !!qrData
  const isLinkCodeReady = backendStatus === 'link_code_pending' && !!linkCodeData
  const isConnecting    = isStarting || backendStatus === 'connecting' ||
                          (backendStatus === 'qr_pending' && !qrData)
  const hasError        = backendStatus === 'error' || !!connectError
  // Show idle (start button) once we have a real status and nothing is happening
  const isIdle          = s !== null && !isConnecting && !hasError && !isQrReady &&
                          !isLinkCodeReady && !isConnected
  // Show spinner while waiting for the very first poll response
  const isFirstLoad     = s === null && !connectError

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Connect WhatsApp</h1>
        <p className="text-sm text-gray-500 mb-8">
          Link your WhatsApp account so Zuri can start analysing your conversations
        </p>

        {/* ── First-load spinner ── */}
        {isFirstLoad && (
          <div className="flex justify-center py-6">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {/* ── Idle / start button ── */}
        {isIdle && (
          <div className="space-y-2">
            <button
              onClick={startConnection}
              disabled={!token || isStarting}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start connection
            </button>
            {sessionData?.syncFailed && (
              <p className="text-xs text-red-600 text-center">
                Backend API unreachable.{' '}
                <a href="/diagnostics" className="underline hover:text-red-700">Check diagnostics</a>
              </p>
            )}
          </div>
        )}

        {/* ── Connecting spinner ── */}
        {isConnecting && !isQrReady && !isLinkCodeReady && !isConnected && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-500">
              {isStarting ? 'Starting session…' : 'Waiting for QR code…'}
            </p>
            <p className="text-xs text-gray-400">This takes up to 30 seconds</p>
          </div>
        )}

        {/* ── QR code ── */}
        {isQrReady && !isConnected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 font-medium">Scan this QR code with WhatsApp</p>
            <div className="relative flex justify-center">
              <img
                src={qrData!}
                alt="WhatsApp QR Code"
                className="w-56 h-56 rounded-lg"
              />
              {/* Overlay while QR is regenerating (qrCode just became null) */}
              {backendStatus === 'qr_pending' && !s?.qrCode && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/75 rounded-lg">
                  <p className="text-xs text-gray-500">Refreshing QR…</p>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
            </p>
          </div>
        )}

        {/* ── Link code ── */}
        {isLinkCodeReady && !isConnected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 font-medium">Enter this code in WhatsApp</p>
            <div className="bg-gray-100 rounded-xl px-6 py-4">
              <p className="font-mono text-3xl font-bold text-gray-900 tracking-widest">
                {linkCodeData}
              </p>
            </div>
            <p className="text-xs text-gray-400">
              Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link with phone number
            </p>
          </div>
        )}

        {/* ── Connected ── */}
        {isConnected && (
          <div className="space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Connected!</p>
            <p className="text-sm text-gray-500">Redirecting to your inbox…</p>
          </div>
        )}

        {/* ── Error ── */}
        {hasError && !isConnected && !isQrReady && !isLinkCodeReady && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg">
              {connectError || 'WhatsApp connection failed. Please try again.'}
            </div>
            <button
              onClick={startConnection}
              disabled={isStarting}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isStarting ? 'Starting…' : 'Try again'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
