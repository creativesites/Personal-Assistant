'use client'

import { io, type Socket } from 'socket.io-client'

const RAW_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
const SOCKET_URL = RAW_URL.startsWith('http') ? RAW_URL : null

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'syncing'

export interface SocketStatusState {
  status: SocketStatus
  lastSeenSeq: number
  replayedCount: number
}

let socket: Socket | null = null
let currentToken: string | null = null
let lastSeenSeq = 0
let currentStatus: SocketStatus = 'disconnected'
let replayedCount = 0

const statusListeners = new Set<(state: SocketStatusState) => void>()

function loadStoredSeq(): number {
  if (typeof window === 'undefined') return 0
  try {
    const val = localStorage.getItem('zuri_socket_last_seq')
    return val ? parseInt(val, 10) || 0 : 0
  } catch {
    return 0
  }
}

function updateLastSeq(seq: number) {
  if (seq > lastSeenSeq) {
    lastSeenSeq = seq
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zuri_socket_last_seq', seq.toString())
      } catch {}
    }
  }
}

function setStatus(status: SocketStatus, replayed: number = 0) {
  currentStatus = status
  replayedCount = replayed
  const state: SocketStatusState = {
    status: currentStatus,
    lastSeenSeq,
    replayedCount,
  }
  statusListeners.forEach(listener => listener(state))
}

export function getSocketStatusState(): SocketStatusState {
  return {
    status: currentStatus,
    lastSeenSeq,
    replayedCount,
  }
}

export function subscribeSocketStatus(fn: (state: SocketStatusState) => void): () => void {
  statusListeners.add(fn)
  fn(getSocketStatusState())
  return () => {
    statusListeners.delete(fn)
  }
}

export function getSocket(token: string): Socket | null {
  if (!SOCKET_URL) return null

  if (!lastSeenSeq) {
    lastSeenSeq = loadStoredSeq()
  }

  if (!socket) {
    setStatus('connecting')
    socket = io(SOCKET_URL, { autoConnect: false, reconnectionAttempts: 10, reconnectionDelay: 1000 })

    socket.on('connect', () => {
      setStatus('connecting')
      if (currentToken) {
        socket!.emit('authenticate', currentToken)
      }
    })

    socket.on('authenticated', () => {
      setStatus('syncing')
      socket!.emit('sync:request', { lastSeenSeq })
    })

    socket.on('sync:replay', (data: { missed?: any[]; latestSeq?: number }) => {
      const missed = data?.missed || []
      const latestSeq = data?.latestSeq || lastSeenSeq

      missed.forEach((item: any) => {
        if (item && item.event) {
          if (item.seq) updateLastSeq(item.seq)
          // Re-emit missed event to client listeners
          socket!.emit(item.event, typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload))
        }
      })

      if (latestSeq) updateLastSeq(latestSeq)
      setStatus('connected', missed.length)
    })

    socket.on('sync:complete', (data: { latestSeq?: number; count?: number }) => {
      if (data?.latestSeq) updateLastSeq(data.latestSeq)
      setStatus('connected', data?.count || 0)
    })

    socket.io.on('reconnect_attempt', () => {
      setStatus('reconnecting')
    })

    socket.on('disconnect', () => {
      setStatus('disconnected')
    })

    socket.on('connect_error', () => {
      setStatus('disconnected')
    })
  }

  if (currentToken !== token) {
    currentToken = token
    if (socket.connected) {
      socket.emit('authenticate', token)
    }
  }

  if (!socket.connected) {
    socket.connect()
  }

  return socket
}

export function updateSocketSeq(seq: number): void {
  updateLastSeq(seq)
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
    currentToken = null
    setStatus('disconnected')
  }
}
