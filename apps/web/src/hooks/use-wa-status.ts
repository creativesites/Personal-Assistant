'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export type WAConnectionStatus =
  | 'unknown'
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'link_code_pending'
  | 'error'

export interface WAStatus {
  status: WAConnectionStatus
  connected: boolean
  phone: string | null
  lastConnectedAt: string | null
  refetchStatus: () => Promise<void>
}

const POLL_ACTIVE_MS  = 8_000   // while connecting/QR pending — check often
const POLL_STABLE_MS  = 30_000  // once connected or disconnected — easy on the server

const TRANSITIONAL: WAConnectionStatus[] = ['connecting', 'qr_pending', 'link_code_pending']

export function useWAStatus(token: string | null | undefined): WAStatus {
  const [status, setStatus] = useState<WAStatus>({
    status: 'unknown',
    connected: false,
    phone: null,
    lastConnectedAt: null,
    refetchStatus: async () => {},
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const poll = useCallback(async () => {
    if (!token || !mountedRef.current) return

    try {
      const r = await fetch(`${API_URL}/api/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!mountedRef.current) return

      if (!r.ok) {
        timerRef.current = setTimeout(poll, POLL_STABLE_MS)
        return
      }

      const data = await r.json()
      if (!mountedRef.current) return

      setStatus({
        status: (data.status as WAConnectionStatus) ?? 'unknown',
        connected: data.connected === true,
        phone: data.phone ?? null,
        lastConnectedAt: data.lastConnectedAt ?? null,
        refetchStatus: poll,
      })

      // Schedule next poll — shorter interval while transitional
      const next = TRANSITIONAL.includes(data.status) ? POLL_ACTIVE_MS : POLL_STABLE_MS
      timerRef.current = setTimeout(poll, next)
    } catch {
      if (!mountedRef.current) return
      timerRef.current = setTimeout(poll, POLL_STABLE_MS)
    }
  }, [token])

  useEffect(() => {
    mountedRef.current = true
    if (token) {
      poll()

      const socket = getSocket(token)
      if (socket) {
        const handleConnected = (payloadStr?: string) => {
          let phone: string | null = null;
          if (payloadStr) {
            try {
              const p = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
              phone = p.phoneNumber ?? null;
            } catch { /* ignore */ }
          }
          setStatus(prev => ({
            ...prev,
            status: 'connected',
            connected: true,
            phone: phone ?? prev.phone,
            lastConnectedAt: new Date().toISOString(),
          }))
          poll()
        }

        const handleDisconnected = () => {
          setStatus(prev => ({
            ...prev,
            status: 'disconnected',
            connected: false,
          }))
          poll()
        }

        socket.on('whatsapp:connected', handleConnected)
        socket.on('whatsapp:disconnected', handleDisconnected)

        return () => {
          socket.off('whatsapp:connected', handleConnected)
          socket.off('whatsapp:disconnected', handleDisconnected)
        }
      }
    }
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [token, poll])

  return status
}
