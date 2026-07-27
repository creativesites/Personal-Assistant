import { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone, RefreshCw, X, CheckCircle2, AlertCircle, Loader2, QrCode, Key, ArrowRight } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useWAStatus } from '@/hooks/use-wa-status'
import { getSocket } from '@/lib/socket'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface WAReconnectModalProps {
  open: boolean
  onClose: () => void
}

export function WAReconnectModal({ open, onClose }: WAReconnectModalProps) {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const wa = useWAStatus(token)

  const [connectMode, setConnectMode] = useState<'qr' | 'phone'>('qr')
  const [loading, setLoading] = useState(false)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pollStatus = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.qrCode) setQrCode(data.qrCode)
      if (data.linkCode) {
        setLinkCode(data.linkCode)
        setIsGeneratingCode(false)
      }
    } catch {
      // ignore
    }
  }, [token])

  // Initial trigger on modal open or mode switch
  useEffect(() => {
    if (open && token) {
      if (connectMode === 'qr') {
        initiateConnection()
      } else {
        pollStatus()
      }
    } else {
      setQrCode(null)
      setLinkCode(null)
      setError(null)
      setLoading(false)
      setIsGeneratingCode(false)
    }
  }, [open, token, connectMode, pollStatus])

  // Continuous background status polling & Socket.io listeners while modal is open
  useEffect(() => {
    if (!open || !token) return

    pollStatus()
    const interval = setInterval(pollStatus, 1500)

    const socket = getSocket(token)
    if (socket) {
      const handleLinkCode = (code: string) => {
        if (code) {
          setLinkCode(code)
          setIsGeneratingCode(false)
        }
      }
      const handleQr = (dataUrl: string) => {
        if (dataUrl) setQrCode(dataUrl)
      }

      socket.on('whatsapp:link_code', handleLinkCode)
      socket.on('whatsapp:qr', handleQr)

      return () => {
        clearInterval(interval)
        socket.off('whatsapp:link_code', handleLinkCode)
        socket.off('whatsapp:qr', handleQr)
      }
    }

    return () => clearInterval(interval)
  }, [open, token, pollStatus])

  useEffect(() => {
    if (wa.status === 'connected') {
      const timer = setTimeout(() => {
        onClose()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [wa.status, onClose])

  async function initiateConnection(phone?: string) {
    if (!token) return
    setLoading(true)
    setError(null)
    setQrCode(null)
    setLinkCode(null)
    if (phone) setIsGeneratingCode(true)

    try {
      const res = await fetch(`${API_URL}/api/whatsapp/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: phone ? JSON.stringify({ phoneNumber: phone.replace(/\D/g, '').replace(/^0+/, '') }) : undefined,
      })

      const data = await res.json()
      if (!res.ok) {
        setIsGeneratingCode(false)
        throw new Error(data.message || 'Failed to initiate WhatsApp reconnection')
      }

      if (data.qrCode) {
        setQrCode(data.qrCode)
      } else if (data.linkCode) {
        setLinkCode(data.linkCode)
        setIsGeneratingCode(false)
      } else {
        pollStatus()
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to WhatsApp backend')
      setIsGeneratingCode(false)
    } finally {
      setLoading(false)
    }
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    const digits = phoneNumber.replace(/\D/g, '').replace(/^0+/, '')
    if (!digits || digits.length < 10) {
      setError('Please enter a valid phone number with country code (e.g. +263771234567)')
      return
    }
    initiateConnection(digits)
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
            <h3 className="text-base font-bold text-white">Connect WhatsApp</h3>
            <p className="text-xs text-gray-400">Scan QR or enter pairing code from your phone</p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 p-1 bg-gray-950 rounded-xl border border-gray-800 mb-5">
          <button
            type="button"
            onClick={() => {
              setConnectMode('qr')
              setLinkCode(null)
              setIsGeneratingCode(false)
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              connectMode === 'qr' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => setConnectMode('phone')}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              connectMode === 'phone' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Phone Code</span>
          </button>
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

            {connectMode === 'qr' ? (
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
            ) : (
              <div className="space-y-4">
                {linkCode ? (
                  <div className="p-6 bg-slate-950 rounded-2xl border border-indigo-500/30 text-center space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pairing Code Ready</span>
                    </div>
                    <div className="font-mono text-3xl font-black text-amber-400 tracking-widest py-3 bg-slate-900 rounded-xl border border-slate-800 selection:bg-amber-400 selection:text-slate-950">
                      {linkCode}
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      On your phone open <b>WhatsApp</b> → <b>Settings</b> → <b>Linked Devices</b> → <b>Link with phone number instead</b> and enter the code above.
                    </p>
                  </div>
                ) : isGeneratingCode || loading ? (
                  <div className="p-6 bg-slate-950 rounded-2xl border border-amber-500/30 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
                    <h4 className="text-sm font-bold text-amber-400">Generating Pairing Code...</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Connecting to WhatsApp for <b>+{phoneNumber.replace(/\D/g, '')}</b>. Your 8-digit pairing code will appear here in just a few seconds...
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handlePhoneSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Your Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +263771234567"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">Include country code without leading 0 (e.g. +263 or 27)</p>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || isGeneratingCode}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading || isGeneratingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      <span>Get 8-Digit Pairing Code</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              {connectMode === 'qr' && (
                <button
                  onClick={() => initiateConnection()}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh QR</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold transition-colors"
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
