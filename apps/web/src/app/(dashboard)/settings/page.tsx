'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

interface WhatsAppStatus {
  connected: boolean
  phone?: string
  sessionState?: string
}

export default function SettingsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (!token) return
    apiClient<WhatsAppStatus>('/api/whatsapp/status', { token })
      .then(setWaStatus)
      .catch(() => setWaStatus({ connected: false }))
  }, [token])

  const disconnect = async () => {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiClient('/api/whatsapp/connect', { method: 'DELETE', token })
      setWaStatus({ connected: false })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Account</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-900">{session.data?.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-900">{session.data?.user.name || '—'}</span>
              </div>
            </div>
          </div>

          <div className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">WhatsApp</p>
            {waStatus === null ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : waStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-sm text-gray-900">Connected</span>
                  {waStatus.phone && (
                    <span className="text-sm text-gray-500">· {waStatus.phone}</span>
                  )}
                </div>
                <button
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect WhatsApp'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-sm text-gray-500">Not connected</span>
                </div>
                <a
                  href="/onboarding"
                  className="inline-block text-sm text-indigo-600 hover:underline"
                >
                  Connect WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
