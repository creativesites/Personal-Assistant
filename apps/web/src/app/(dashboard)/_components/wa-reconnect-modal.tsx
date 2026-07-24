'use client'

import { useState, useEffect } from 'react'
import { Smartphone, RefreshCw, X, CheckCircle2, AlertCircle, Loader2, QrCode } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useWAStatus } from '@/hooks/use-wa-status'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface WAReconnectModalProps {
  open: boolean
  onClose: () => void
}

export function WAReconnectModal({ open, onClose }: WAReconnectModalProps) {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const wa = useWAStatus(token)

  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && token) {
      initiateConnection()
    } else {
      setQrCode(null)
      setError(null)
      setLoading(false)
    }
  }, [open, token])

  useEffect(() => {
    if (wa.status === 'connected') {
      const timer = setTimeout(() => {
        onClose()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [wa.status, onClose])

  async function initiateConnection() {
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/whatsapp/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Failed to initiate WhatsApp reconnection')
      }

      if (data.qrCode) {
        setQrCode(data.qrCode)
      } else {
        // Poll status until QR or connection is ready
        pollQR()
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to WhatsApp backend')
    } finally {
      setLoading(false)
    }
  }

  async function pollQR() {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.qrCode) {
        setQrCode(data.qrCode)
      }
    } catch {
      // ignore poll error
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Reconnect WhatsApp</h3>
            <p className="text-xs text-gray-400">Restore real-time message ingestion & AI drafts</p>
          </div>
        </div>

        {wa.status === 'connected' ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6 animate-bounce" />
            </div>
            <h4 className="text-sm font-bold text-emerald-400">WhatsApp Connected!</h4>
            <p className="text-xs text-gray-400">Session successfully linked. Syncing messages...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-950/60 border border-gray-800/80 min-h-[220px]">
              {loading ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <p className="text-xs font-medium">Initializing WhatsApp Session...</p>
                </div>
              ) : qrCode ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-white rounded-xl shadow-lg">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-44 h-44 object-contain" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold text-gray-200">Scan with WhatsApp on your phone</p>
                    <p className="text-[11px] text-gray-500">Settings → Linked Devices → Link a Device</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <QrCode className="w-10 h-10 text-gray-600 animate-pulse" />
                  <p className="text-xs font-medium text-gray-400">Requesting pairing QR code...</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={initiateConnection}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh QR</span>
              </button>
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
