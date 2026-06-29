import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media';

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  svg: 'image/svg+xml',
};

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/media/:filename
   * Serves downloaded WhatsApp media files.
   * Optional JWT auth via ?token= query param (used by browser <img>/<audio> tags).
   * Without a token, request is still served (files are content-addressed by message ID).
   */
  fastify.get('/api/media/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const { token } = request.query as { token?: string };

    // Optional token validation
    if (token) {
      try {
        fastify.jwt.verify(token);
      } catch {
        return reply.code(401).send({ error: 'Invalid token' });
      }
    }

    // Sanitise filename — prevent path traversal
    const safeName = path.basename(filename);
    if (safeName !== filename || safeName.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    const filePath = path.join(MEDIA_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Media not found' });
    }

    const ext = path.extname(safeName).slice(1).toLowerCase();
    const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    const stat = fs.statSync(filePath);

    reply.header('Content-Type', contentType);
    reply.header('Content-Length', stat.size);
    reply.header('Cache-Control', 'private, max-age=604800'); // 7 days
    reply.header('Accept-Ranges', 'bytes');

    return reply.send(fs.createReadStream(filePath));
  });
}
