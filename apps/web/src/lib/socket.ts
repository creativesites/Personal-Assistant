'use client'

import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

let socket: Socket | null = null
let currentToken: string | null = null

export function getSocket(token: string): Socket {
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
