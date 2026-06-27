'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

type Step = 'idle' | 'connecting' | 'qr' | 'link_code' | 'connected' | 'error'

interface WAStatus {
  connected: boolean
  status: string
  phone?: string
  qrCode?: string | null
  qrExpiresAt?: string | null
  linkCode?: string | null
  linkCodeExpiresAt?: string | null
}

export default function OnboardingPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [qrData, setQrData] = useState<string | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPolling(), [])

  const startPolling = (tok: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const status = await apiClient<WAStatus>('/api/whatsapp/status', { token: tok })
        if (status.connected) {
          stopPolling()
          setStep('connected')
          await apiClient('/api/auth/onboarding-complete', { method: 'POST', token: tok }).catch(() => {})
          setTimeout(() => router.push('/inbox'), 1500)
        } else if (status.status === 'qr_pending' && status.qrCode) {
          setQrData(status.qrCode)
          setStep('qr')
        } else if (status.status === 'link_code_pending' && status.linkCode) {
          setLinkCode(status.linkCode)
          setStep('link_code')
        } else if (status.status === 'error') {
          stopPolling()
          setError('WhatsApp connection failed. Please try again.')
          setStep('error')
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000)
  }

  const startConnection = async () => {
    if (!token) return
    setStep('connecting')
    setError(null)
    setQrData(null)
    setLinkCode(null)

    try {
      await apiClient('/api/whatsapp/connect', { method: 'POST', token })
      startPolling(token)
    } catch (err: any) {
      setError(err.message || 'Failed to start connection')
      setStep('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Connect WhatsApp</h1>
        <p className="text-sm text-gray-500 mb-8">
          Link your WhatsApp account so Zuri can start analysing your conversations
        </p>

        {step === 'idle' && (
          <div className="space-y-2">
            <button
              onClick={startConnection}
              disabled={!token}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start connection
            </button>
            {session.data?.syncFailed && (
              <p className="text-xs text-red-600 text-center">
                Backend API unreachable — button disabled.{' '}
                <a href="/diagnostics" className="underline hover:text-red-700">Check diagnostics</a>
              </p>
            )}
            {!token && !session.data?.syncFailed && session.status === 'authenticated' && (
              <p className="text-xs text-gray-400 text-center">Connecting to backend…</p>
            )}
          </div>
        )}

        {step === 'connecting' && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Initialising WhatsApp session...</p>
          </div>
        )}

        {step === 'qr' && qrData && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 font-medium">Scan this QR code with WhatsApp</p>
            <div className="flex justify-center">
              {qrData.startsWith('data:') ? (
                <img src={qrData} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg" />
              ) : (
                <div className="w-56 h-56 bg-gray-100 rounded-lg flex items-center justify-center p-4 text-xs text-gray-500 break-all font-mono">
                  {qrData}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
            </p>
          </div>
        )}

        {step === 'link_code' && linkCode && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 font-medium">Enter this code in WhatsApp</p>
            <div className="bg-gray-100 rounded-xl px-6 py-4">
              <p className="font-mono text-3xl font-bold text-gray-900 tracking-widest">{linkCode}</p>
            </div>
            <p className="text-xs text-gray-400">
              Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link with phone number
            </p>
          </div>
        )}

        {step === 'connected' && (
          <div className="space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Connected!</p>
            <p className="text-sm text-gray-500">Redirecting to your inbox...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg">
              {error || 'Something went wrong'}
            </div>
            <button
              onClick={startConnection}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
