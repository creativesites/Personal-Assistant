'use client'

import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false })
  }
  if (!socket.connected) {
    socket.auth = { token }
    socket.connect()
    socket.emit('authenticate', token)
  }
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
