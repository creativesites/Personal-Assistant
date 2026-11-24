import * as fs from 'fs/promises';
import * as path from 'path';
import type { Pool } from 'pg';
import type { MediaMeta, WhatsAppTransport } from '../transport/types';
import { downloadMediaFromMeta } from '../transport/baileys';

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media';
/** Live media at or under this size is downloaded as soon as it arrives. */
export const EAGER_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
const MAX_CONCURRENT_DOWNLOADS = 4;

export class MediaUnavailableError extends Error {}

/** Where a message's media lives on the volume shared with the API. Keep in sync with services/api/src/lib/message-media.ts. */
export function mediaPathFor(userId: string, messageId: string): string {
  return path.join(MEDIA_DIR, userId, messageId);
}

/**
 * Downloads WhatsApp media into the shared media volume, keyed by message row.
 * The API serves the files (private, per-user); this side only fetches them.
 */
export class MediaStore {
  private readonly inflight = new Map<string, Promise<string>>();
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly db: Pool,
    private readonly getTransport: (userId: string) => WhatsAppTransport | undefined,
  ) {}

  /** Ensure the media file exists; returns its path. Concurrent calls share one download. */
  fetch(userId: string, messageId: string): Promise<string> {
    const key = `${userId}:${messageId}`;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.doFetch(userId, messageId).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  /** Fire-and-forget fetch for freshly received media. */
  prefetch(userId: string, messageId: string, meta: MediaMeta): void {
    if (meta.size !== null && meta.size > EAGER_MEDIA_MAX_BYTES) return;
    this.fetch(userId, messageId).catch((err) => {
      console.warn(`[media] prefetch failed message=${messageId}: ${(err as Error).message}`);
    });
  }

  private async doFetch(userId: string, messageId: string): Promise<string> {
    const file = mediaPathFor(userId, messageId);
    if (await exists(file)) return file;

    const { rows: [row] } = await this.db.query<{ media_meta: MediaMeta | null }>(
      `SELECT m.media_meta FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND c.user_id = $2`,
      [messageId, userId],
    );
    if (!row) throw new MediaUnavailableError('message not found');
    if (!row.media_meta) throw new MediaUnavailableError('no media keys stored for this message');

    await this.acquire();
    try {
      if (await exists(file)) return file;
      const transport = this.getTransport(userId);
      const buffer = transport
        ? await transport.downloadMedia(row.media_meta)
        : await downloadMediaFromMeta(row.media_meta);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, buffer);
      await fs.rename(tmp, file);
      return file;
    } catch (err) {
      if (err instanceof MediaUnavailableError) throw err;
      throw new MediaUnavailableError(`download failed: ${(err as Error).message}`);
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT_DOWNLOADS) { this.active++; return; }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }
}

async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true; } catch { return false; }
}
