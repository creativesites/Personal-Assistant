import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config';

let io: Server | null = null;

type JwtVerifyFn = (token: string) => { userId: string };

export function setupSocket(httpServer: HttpServer, jwtVerify?: JwtVerifyFn): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.on('authenticate', (token: string) => {
      try {
        if (jwtVerify) {
          const payload = jwtVerify(token);
          const userId = payload.userId;
          socket.join(`user:${userId}`);
          socket.emit('authenticated', { userId });
        } else {
          // Fallback: treat token as userId (dev only)
          socket.join(`user:${token}`);
          socket.emit('authenticated', { userId: token });
        }
      } catch {
        socket.emit('auth_error', { message: 'Invalid token' });
        socket.disconnect(true);
      }
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
