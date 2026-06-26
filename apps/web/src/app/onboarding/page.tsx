'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'

type Step = 'idle' | 'connecting' | 'qr' | 'link_code' | 'connected' | 'error'

export default function OnboardingPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [qrData, setQrData] = useState<string | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const socket = getSocket(token)

    socket.on('whatsapp:qr', (payload: string) => {
      try {
        const data = JSON.parse(payload)
        setQrData(data.qr || data)
        setStep('qr')
      } catch {
        setQrData(payload)
        setStep('qr')
      }
    })

    socket.on('whatsapp:link_code', (payload: string) => {
      try {
        const data = JSON.parse(payload)
        setLinkCode(data.code || data)
        setStep('link_code')
      } catch {
        setLinkCode(payload)
        setStep('link_code')
      }
    })

    socket.on('whatsapp:connected', async () => {
      setStep('connected')
      await apiClient('/api/auth/onboarding-complete', { method: 'POST', token }).catch(() => {})
      setTimeout(() => router.push('/inbox'), 1500)
    })

    socket.on('whatsapp:error', (payload: string) => {
      try {
        const data = JSON.parse(payload)
        setError(data.message || 'Connection failed')
      } catch {
        setError('Connection failed')
      }
      setStep('error')
    })

    return () => {
      socket.off('whatsapp:qr')
      socket.off('whatsapp:link_code')
      socket.off('whatsapp:connected')
      socket.off('whatsapp:error')
    }
  }, [token, router])

  const startConnection = async () => {
    if (!token) return
    setStep('connecting')
    setError(null)
    setQrData(null)
    setLinkCode(null)

    try {
      await apiClient('/api/whatsapp/connect', { method: 'POST', token })
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
          <button
            onClick={startConnection}
            disabled={!token}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Start connection
          </button>
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
