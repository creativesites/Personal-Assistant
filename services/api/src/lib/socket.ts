import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config';
import { getMissedEvents } from './event-buffer';

let io: Server | null = null;

type JwtVerifyFn = (token: string) => { userId: string };

export function setupSocket(httpServer: HttpServer, jwtVerify?: JwtVerifyFn): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || process.env.WEB_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.on('authenticate', (token: string) => {
      try {
        let userId: string;
        if (jwtVerify) {
          const payload = jwtVerify(token);
          userId = payload.userId;
        } else {
          userId = token;
        }
        socket.data.userId = userId;
        socket.join(`user:${userId}`);
        socket.emit('authenticated', { userId });
      } catch {
        socket.emit('auth_error', { message: 'Invalid token' });
        socket.disconnect(true);
      }
    });

    socket.on('sync:request', async (payload: { lastSeenSeq?: number }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('sync:error', { message: 'Unauthenticated socket' });
        return;
      }

      const lastSeenSeq = typeof payload?.lastSeenSeq === 'number' ? payload.lastSeenSeq : 0;
      try {
        const { missed, latestSeq } = await getMissedEvents(userId, lastSeenSeq);
        socket.emit('sync:replay', { missed, latestSeq });
        socket.emit('sync:complete', { latestSeq, count: missed.length });
      } catch (err) {
        console.error(`[socket] sync:request failed for user ${userId}:`, err);
        socket.emit('sync:error', { message: 'Failed to fetch missed events' });
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
