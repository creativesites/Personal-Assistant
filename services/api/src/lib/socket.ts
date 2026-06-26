import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: Server | null = null;

export function setupSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    // Clients must authenticate after connecting to join their user room
    socket.on('authenticate', (token: string) => {
      // Phase 4 will verify the JWT here and extract userId
      // For Phase 2 testing, token IS the userId
      const userId = token;
      socket.join(`user:${userId}`);
      socket.emit('authenticated', { userId });
    });

    socket.on('disconnect', () => {
      // rooms are cleaned up automatically
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialised');
  return io;
}
