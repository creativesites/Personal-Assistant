'use client'

import { io, type Socket } from 'socket.io-client'

const RAW_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
// If the env is a relative proxy path (e.g. "/api/proxy"), socket.io can't use
// it — it would default to the page's own origin which has no socket.io server.
// Fall back to direct API URL only when an absolute URL is available.
const SOCKET_URL = RAW_URL.startsWith('http') ? RAW_URL : null

let socket: Socket | null = null
let currentToken: string | null = null

export function getSocket(token: string): Socket | null {
  if (!SOCKET_URL) return null
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false })

    socket.on('connect', () => {
      if (currentToken) {
        socket!.emit('authenticate', currentToken)
      }
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

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
    currentToken = null
  }
}

