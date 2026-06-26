import { io, Socket } from 'socket.io-client';
import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await storage.getToken();
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token },
  });

  socket.on('connect', () => {
    if (token) socket!.emit('authenticate', { token });
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
