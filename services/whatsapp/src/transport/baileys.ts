import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  normalizeMessageContent,
  getContentType,
  Browsers,
  proto,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import P from 'pino';

// Baileys reports app-state (address book, chat settings) sync failures only
// at info level. Keep everything else silent but surface those lines.
const APP_STATE_LINE = /resyncing |restored state of|synced .* to v|failed to sync state|has more patches|failed to find key/;
const appStateLogger = P({ level: 'info' }, {
  write(line: string) {
    if (APP_STATE_LINE.test(line)) process.stdout.write(`[baileys:app-state] ${line.slice(0, 600)}\n`);
  },
});
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { MessageType } from '@zuri/types';
import {
  WhatsAppTransport,
  type NormalisedMessage,
  type HistorySetPayload,
  type HistoryContact,
  type CatalogProductInput,
  type TransportDisconnectReason,
  type TransportStatus,
  type MediaMeta,
} from './types';

const MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage']);
const silentLogger = P({ level: 'silent' });

/** The media sub-message + key, serialised so the media can be fetched later. */
function buildMediaMeta(msg: WAMessage, content: proto.IMessage | undefined): MediaMeta | null {
  if (!content) return null;
  const type = getContentType(content);
  if (!type || !MEDIA_TYPES.has(type)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (content as any)[type];
  if (!sub?.mediaKey || !(sub.directPath || sub.url)) return null;
  const encoded = proto.Message.encode({ [type]: sub } as proto.IMessage).finish();
  const size = Number(sub.fileLength ?? 0);
  return {
    v: 1,
    type,
    proto: Buffer.from(encoded).toString('base64'),
    key: {
      remoteJid: msg.key.remoteJid ?? null,
      id: msg.key.id ?? null,
      fromMe: msg.key.fromMe ?? false,
      participant: msg.key.participant ?? null,
    },
    size: Number.isFinite(size) && size > 0 ? size : null,
  };
}

function mediaMimeOf(content: proto.IMessage | undefined): string | null {
  if (!content) return null;
  const type = getContentType(content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return type && MEDIA_TYPES.has(type) ? ((content as any)[type]?.mimetype ?? null) : null;
}

/** Decrypt media from stored meta. With a socket, expired media is re-requested from the phone. */
export async function downloadMediaFromMeta(meta: MediaMeta, sock?: WASocket | null): Promise<Buffer> {
  const message = proto.Message.decode(Buffer.from(meta.proto, 'base64'));
  const waMsg = {
    key: {
      remoteJid: meta.key.remoteJid ?? undefined,
      id: meta.key.id ?? undefined,
      fromMe: meta.key.fromMe,
      participant: meta.key.participant ?? undefined,
    },
    message,
  } as WAMessage;
  const ctx = sock ? { logger: silentLogger, reuploadRequest: sock.updateMediaMessage } : undefined;
  return (await downloadMediaMessage(waMsg, 'buffer', {}, ctx)) as Buffer;
}

const QR_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * LID -> phone-number JID pairs WhatsApp sends in each history sync's top-level
 * `phoneNumberToLidMappings`. Baileys 6.7 decodes that list but never passes it
 * on, so we capture it from the decoder. A LID identifies one WhatsApp account
 * globally, so a pair is true regardless of which session decoded it; each
 * session only looks up JIDs that appear in its own batches.
 */
const LID_PN_CACHE_MAX = 200_000;
const lidPnCache = new Map<string, string>();
let historyDecodePatched = false;
function captureHistoryLidMappings(): void {
  if (historyDecodePatched) return;
  historyDecodePatched = true;
  const HS = proto.HistorySync as unknown as { decode: (...args: unknown[]) => proto.IHistorySync };
  const original = HS.decode.bind(HS);
  HS.decode = (...args: unknown[]) => {
    const decoded = original(...args);
    try {
      for (const m of decoded.phoneNumberToLidMappings ?? []) {
        if (m.lidJid && m.pnJid) lidPnCache.set(m.lidJid, m.pnJid);
      }
      while (lidPnCache.size > LID_PN_CACHE_MAX) {
        lidPnCache.delete(lidPnCache.keys().next().value as string);
      }
    } catch { /* never break history decoding */ }
    return decoded;
  };
}
captureHistoryLidMappings();

function toHistoryContact(c: { id?: string | null; name?: string | null; notify?: string | null; verifiedName?: string | null; lid?: string | null; jid?: string | null }): HistoryContact | null {
  if (!c.id) return null;
  return {
    id: c.id,
    name: c.name ?? null,
    notify: c.notify ?? null,
    verifiedName: c.verifiedName ?? null,
    // The address book entry's id is usually the phone JID; `lid` is its LID.
    // When the id is itself a LID, `jid` carries the phone JID instead.
    lid: c.lid ?? (c.id.endsWith('@lid') ? c.id : null),
  };
}
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS  = 60_000; // cap at 60 s — keeps trying forever
const DEFAULT_MEDIA_DIR = '/app/media';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/svg+xml': 'svg',
};

function mimeToExt(mime: string): string {
  return MIME_TO_EXT[mime] ?? MIME_TO_EXT[mime.split(';')[0].trim()] ?? 'bin';
}

class WriteQueue {
  private promise: Promise<void> = Promise.resolve();
  private pendingCount = 0;

  enqueue(fn: () => Promise<void> | void): Promise<void> {
    this.pendingCount++;
    const nextPromise = this.promise.then(async () => {
      try {
        await fn();
      } catch (err) {
        console.error('[write-queue] write failed:', err);
      } finally {
        this.pendingCount--;
      }
    });
    this.promise = nextPromise;
    return nextPromise;
  }

  async wait(): Promise<void> {
    await this.promise;
  }

  getPendingCount(): number {
    return this.pendingCount;
  }
}

export class BaileysTransport extends WhatsAppTransport {
  readonly userId: string;
  private sock: WASocket | null = null;
  private _status: TransportStatus = 'idle';
  private _stopping = false;
  private _reconnectCount = 0;
  private _badSessionCount = 0;
  private readonly writeQueue = new WriteQueue();
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _qrTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly authPath: string;
  private readonly mediaDir: string;
  private static cachedVersion: [number, number, number] | null = null;

  constructor(userId: string, private readonly sessionsDir: string, private readonly pairingPhone?: string, private readonly forceNewQR = false) {
    super();
    this.userId = userId;
    this.authPath = path.join(sessionsDir, userId);
    this.mediaDir = process.env.MEDIA_DIR ?? DEFAULT_MEDIA_DIR;
    // Ensure media directory exists
    try {
      if (!fsSync.existsSync(this.mediaDir)) {
        fsSync.mkdirSync(this.mediaDir, { recursive: true });
      }
    } catch (err) {
      console.error(`[baileys:${this.userId}] could not create media dir:`, err);
    }
  }

  getStatus(): TransportStatus {
    return this._status;
  }

  async start(): Promise<void> {
    this._stopping = false;
    this._status = 'connecting';
    // Clear stale auth once at session start — not on every internal reconnect.
    // forceNewQR: user-triggered fresh connect. pairingPhone: creds.registered blocks requestPairingCode.
    if (this.forceNewQR || this.pairingPhone) {
      await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => {});
    }
    await this._boot();
  }

  private async getBaileysVersion(): Promise<[number, number, number]> {
    if (BaileysTransport.cachedVersion) {
      return BaileysTransport.cachedVersion;
    }
    try {
      const result = await fetchLatestBaileysVersion();
      BaileysTransport.cachedVersion = result.version;
      return result.version;
    } catch (err) {
      console.warn(`[baileys:${this.userId}] failed to fetch latest version, using fallback:`, err);
      return [2, 3000, 1015920080];
    }
  }

  async stop(): Promise<void> {
    this._stopping = true;
    this._clearQrTimer();
    this._clearReconnectTimer();

    // Wait for any pending writes to finish
    await this.writeQueue.wait();

    if (this.sock) {
      try { this.sock.ws.close(); } catch { /* ignore */ }
      this.sock = null;
    }
    this._status = 'idle';
  }

  async sendText(
    jid: string,
    text: string,
    options?: { quotedWaMessageId?: string; quotedBody?: string }
  ): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    if (options?.quotedWaMessageId) {
      const quoteObj = {
        key: {
          remoteJid: jid,
          fromMe: false,
          id: options.quotedWaMessageId,
        },
        message: {
          conversation: options.quotedBody || '',
        },
      };
      await this.sock.sendMessage(jid, { text }, { quoted: quoteObj as any });
    } else {
      await this.sock.sendMessage(jid, { text });
    }
  }

  async sendReaction(
    jid: string,
    emoji: string,
    targetWaMessageId: string,
    fromMe: boolean
  ): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    await this.sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: {
          remoteJid: jid,
          fromMe,
          id: targetWaMessageId,
        },
      },
    });
  }

  async deleteMessage(
    jid: string,
    waMessageId: string,
    fromMe: boolean
  ): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    await this.sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe,
        id: waMessageId,
      },
    });
  }

  async fetchProfilePictureUrl(jid: string): Promise<string | null> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    try {
      const url = await this.sock.profilePictureUrl(jid, 'image');
      return url || null;
    } catch {
      return null;
    }
  }

  async postStatus(
    mediaType: 'text' | 'image' | 'video',
    content: string,
    options?: { caption?: string; backgroundColor?: string }
  ): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);

    if (mediaType === 'text') {
      await this.sock.sendMessage('status@broadcast', {
        text: content,
        backgroundColor: options?.backgroundColor || '#1f2937',
        font: 1,
      } as any);
    } else if (mediaType === 'image') {
      if (content.startsWith('http://') || content.startsWith('https://')) {
        await this.sock.sendMessage('status@broadcast', {
          image: { url: content },
          caption: options?.caption || '',
        });
      } else {
        const buffer = await fs.readFile(content);
        await this.sock.sendMessage('status@broadcast', {
          image: buffer,
          caption: options?.caption || '',
        });
      }
    } else if (mediaType === 'video') {
      if (content.startsWith('http://') || content.startsWith('https://')) {
        await this.sock.sendMessage('status@broadcast', {
          video: { url: content },
          caption: options?.caption || '',
        });
      } else {
        const buffer = await fs.readFile(content);
        await this.sock.sendMessage('status@broadcast', {
          video: buffer,
          caption: options?.caption || '',
        });
      }
    }
  }

  // Business Workspace document delivery — see docs/BUSINESS_WORKSPACE_PLAN.md §5.
  async sendDocument(
    jid: string,
    filePath: string,
    mimetype: string,
    fileName: string,
    caption?: string,
  ): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    const buffer = await fs.readFile(filePath);
    await this.sock.sendMessage(jid, { document: buffer, mimetype, fileName, caption });
  }

  async listCatalogProducts(limit = 20, cursor?: string): Promise<{ products: unknown[]; nextPageCursor?: string }> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    const sock = this.sock as unknown as {
      getCatalog?: (opts: { limit?: number; cursor?: string }) => Promise<{ products: unknown[]; nextPageCursor?: string }>;
    };
    if (typeof sock.getCatalog !== 'function') {
      throw new Error('WhatsApp catalog is not available for this session');
    }
    return await sock.getCatalog({ limit, cursor });
  }

  async createCatalogProduct(product: CatalogProductInput): Promise<unknown> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    const sock = this.sock as unknown as {
      productCreate?: (create: {
        name: string;
        description: string;
        price: number;
        currency: string;
        retailerId?: string;
        originCountryCode: string | undefined;
        images: unknown[];
      }) => Promise<unknown>;
    };
    if (typeof sock.productCreate !== 'function') {
      throw new Error('WhatsApp catalog is not available for this session');
    }
    return await sock.productCreate({
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      retailerId: product.retailerId,
      originCountryCode: undefined,
      images: [],
    });
  }

  async requestLinkCode(phoneNumber: string): Promise<string> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    const digits = phoneNumber.replace(/\D/g, '');
    if (!digits) throw new Error('Invalid phone number');
    return await this.sock.requestPairingCode(digits);
  }

  private async requestPairingCodeWithRetry(phone: string, maxAttempts = 3): Promise<string> {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    console.log(`[baileys:${this.userId}] requesting pairing code for number: ${digits} (${digits.length} digits)`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!this.sock) throw new Error('Socket not ready');
        let rawCode = await this.sock.requestPairingCode(digits);
        let code = rawCode;
        if (code) {
          const clean = code.replace(/[^A-Za-z0-9]/g, '');
          if (clean.length === 8) {
            code = `${clean.slice(0, 4)}-${clean.slice(4)}`;
          }
        }
        console.log(`[baileys:${this.userId}] pairing code generated: ${code} (attempt ${attempt})`);
        this.emitLinkCode(code);
        return code;
      } catch (err) {
        console.error(`[baileys:${this.userId}] requestPairingCode failed (attempt ${attempt}, number: ${digits}):`, err);
        if (attempt === maxAttempts) throw err;
        await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
      }
    }
    throw new Error('Failed to generate pairing code');
  }

  private async _boot(): Promise<void> {
    const version = await this.getBaileysVersion();

    // _boot() runs on EVERY internal reconnect (restartRequired, network
    // drops), so it must never delete auth state. Stale auth is cleared once
    // in start() for user-initiated connects. Purging here previously wiped
    // freshly-paired credentials on the mandatory post-pairing restart
    // (QR pairing never sets creds.registered), so pairing appeared to
    // succeed on the phone but the server lost the session.
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    // A device is paired once WhatsApp has issued account details. Covers
    // both QR (never sets `registered`) and phone-code pairing.
    const isPaired = Boolean(state.creds.registered || state.creds.account);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: appStateLogger,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: true,
    });

    this.sock = sock;

    // Queue credential updates to prevent write race conditions
    sock.ev.on('creds.update', () => {
      if (sock !== this.sock) return;
      this.writeQueue.enqueue(async () => {
        // Never let a missing directory silently drop credential writes.
        await fs.mkdir(this.authPath, { recursive: true });
        await saveCreds();
      });
    });

    // For phone-code pairing: request a code only while the device is still
    // unpaired. After pairing succeeds WhatsApp forces a restart; requesting
    // a code on that reconnect overwrites creds.me and gets the socket
    // closed (the "Connection Closed" / status=error loop).
    if (this.pairingPhone && !isPaired) {
      setTimeout(async () => {
        try {
          if (sock !== this.sock) return;
          await this.requestPairingCodeWithRetry(this.pairingPhone!);
        } catch (err) {
          console.error(`[baileys:${this.userId}] pairing code retry exhausted:`, err);
          this.emitDisconnected('bad_session');
        }
      }, 3000); // 3-second delay for initial WS handshake
    }

    sock.ev.on('connection.update', async (update) => {
      if (sock !== this.sock) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!this.pairingPhone) {
          this._resetQrTimer();
          try {
            const dataUrl = await QRCode.toDataURL(qr);
            this.emitQr(dataUrl);
          } catch (err) {
            console.error(`[baileys:${this.userId}] QR encode error:`, err);
          }
        }
      }

      if (connection === 'open') {
        this._clearQrTimer();
        this._clearReconnectTimer();
        this._reconnectCount = 0;
        this._badSessionCount = 0;
        this._status = 'connected';
        const raw = sock.user?.id ?? '';
        const phone = raw.split(':')[0].split('@')[0];
        this.emitConnected(phone);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          this._clearQrTimer();
          this._status = 'idle';
          await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
          this.emitDisconnected('logged_out');
          return;
        }

        if (statusCode === DisconnectReason.connectionReplaced) {
          this._clearQrTimer();
          this._clearReconnectTimer();
          this._status = 'idle';
          console.log(`[baileys:${this.userId}] connection replaced by another client. Stopping reconnect.`);
          this.emitDisconnected('replaced');
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          console.log(`[baileys:${this.userId}] server requested restart — reconnecting immediately`);
          this._reconnectTimer = setTimeout(() => {
            if (!this._stopping) this._boot().catch(console.error);
          }, 500);
          return;
        }

        if (statusCode === DisconnectReason.badSession) {
          this._badSessionCount++;
          console.warn(`[baileys:${this.userId}] bad_session received (attempt ${this._badSessionCount}/3)`);
          if (this._badSessionCount > 3) {
            this._clearQrTimer();
            this._status = 'idle';
            await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
            this.emitDisconnected('bad_session');
            return;
          }
          // Fall through to reconnect as network drop
        }

        if (this._stopping) return;

        // Network / transient drop — retry with exponential backoff, no cap on attempts
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this._reconnectCount), RECONNECT_MAX_MS);
        this._reconnectCount++;
        this._status = 'connecting';
        console.log(`[baileys:${this.userId}] network drop (status ${statusCode}) — reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._reconnectCount})`);
        this._reconnectTimer = setTimeout(() => {
          if (!this._stopping) this._boot().catch(console.error);
        }, delay);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (sock !== this.sock) return;
      if (type !== 'notify') return;
      const hints: HistoryContact[] = [];
      for (const msg of messages) {
        const key = msg.key as typeof msg.key & { senderPn?: string; participantPn?: string };
        if (key.remoteJid?.endsWith('@lid') && key.senderPn?.endsWith('@s.whatsapp.net')) {
          hints.push({ id: key.senderPn, name: null, notify: null, verifiedName: null, lid: key.remoteJid });
        }
        if (key.participant?.endsWith('@lid') && key.participantPn?.endsWith('@s.whatsapp.net')) {
          hints.push({ id: key.participantPn, name: null, notify: null, verifiedName: null, lid: key.participant });
        }
      }
      if (hints.length) this.emitContactHints(hints);
      for (const msg of messages) {
        try {
          const normalised = await this._normalise(msg);
          if (normalised) this.emitMessage(normalised);
        } catch (err) {
          console.error(`[baileys:${this.userId}] normalise error:`, err);
        }
      }
    });

    // Address book (app-state sync, right after a link or on resyncContacts()):
    // saved names plus each contact's LID pairing. Also push-name changes.
    const onContacts = (list: Array<Parameters<typeof toHistoryContact>[0]>) => {
      if (sock !== this.sock) return;
      const hints = list.flatMap((c) => {
        const h = toHistoryContact(c);
        if (!h) return [];
        // id is a LID but the entry also names the phone JID: key it by phone.
        const pn = (c as { jid?: string | null }).jid;
        if (h.id.endsWith('@lid') && pn?.endsWith('@s.whatsapp.net')) return [{ ...h, id: pn, lid: h.id }];
        return [h];
      });
      if (hints.length) this.emitContactHints(hints);
    };
    sock.ev.on('contacts.upsert', (list) => onContacts(list));
    sock.ev.on('contacts.update', (list) => onContacts(list as Array<Parameters<typeof toHistoryContact>[0]>));

    sock.ev.on('presence.update', ({ id, presences }) => {
      if (sock !== this.sock) return;
      const participantJid = Object.keys(presences)[0];
      if (!participantJid) return;
      const data = presences[participantJid];
      this.emit('presence_update', {
        jid: id,
        participantJid,
        presence: data.lastKnownPresence,
        lastSeen: data.lastSeen,
      });
    });

    sock.ev.on('messages.update', async (updates) => {
      if (sock !== this.sock) return;
      for (const update of updates) {
        if (update.update.status) {
          this.emit('message_status_update', {
            waMessageId: update.key.id,
            jid: update.key.remoteJid,
            status: update.update.status,
          });
        }
      }
    });

    // History sync — WhatsApp streams several batches right after a link (and
    // on-demand batches later). Emit each one whole: chats, contacts (saved
    // names, push names, LID pairings) and messages. Batches with zero
    // messages matter — the PUSH_NAME batch carries every contact's name and
    // was previously dropped. The session manager hands each batch to the
    // HistorySyncPipeline, which serialises them per user.
    sock.ev.on('messaging-history.set', async (event) => {
      if (sock !== this.sock) return;
      const { chats = [], contacts = [], messages = [] } = event;
      const syncType = (event as { syncType?: number }).syncType ?? null;
      const progress = (event as { progress?: number | null }).progress ?? null;
      const isLatest = (event as { isLatest?: boolean }).isLatest ?? null;

      const normalisedMessages: NormalisedMessage[] = [];
      for (const msg of messages) {
        try {
          const normalised = await this._normaliseHistorical(msg);
          if (normalised) normalisedMessages.push(normalised);
        } catch (err) {
          console.error(`[baileys:${this.userId}] historical normalise error:`, err);
        }
      }

      const toMs = (ts: unknown): number | null => {
        const n = Number(ts ?? 0);
        return n > 0 ? n * 1000 : null;
      };

      const payload: HistorySetPayload = {
        chats: chats.filter((c) => !!c.id).map((c) => {
          const raw = c as typeof c & { lidJid?: string | null; pnJid?: string | null };
          return {
            id: c.id!,
            name: c.name ?? null,
            lidJid: raw.lidJid ?? null,
            pnJid: raw.pnJid ?? null,
            conversationTimestampMs: toMs(c.conversationTimestamp),
            unreadCount: Number(c.unreadCount ?? 0) || 0,
            archived: !!c.archived,
          };
        }),
        contacts: contacts.filter((c) => !!c.id).map((c) => {
          const raw = c as typeof c & { lid?: string | null };
          return {
            id: c.id,
            name: c.name ?? null,
            notify: c.notify ?? null,
            verifiedName: c.verifiedName ?? null,
            lid: raw.lid ?? null,
          };
        }),
        messages: normalisedMessages,
        syncType,
        progress: typeof progress === 'number' ? progress : null,
        isLatest,
      };

      // Attach LID pairs captured from this sync's phoneNumberToLidMappings for
      // every @lid JID in the batch, as contact hints the pipeline learns from.
      const lidsInBatch = new Set<string>();
      for (const c of payload.chats) if (c.id.endsWith('@lid')) lidsInBatch.add(c.id);
      for (const c of payload.contacts) if (c.id.endsWith('@lid')) lidsInBatch.add(c.id);
      for (const m of normalisedMessages) {
        if (m.jid.endsWith('@lid')) lidsInBatch.add(m.jid);
        if (m.groupSenderJid?.endsWith('@lid')) lidsInBatch.add(m.groupSenderJid);
      }
      let mapped = 0;
      for (const lid of lidsInBatch) {
        const pn = lidPnCache.get(lid);
        if (!pn) continue;
        payload.contacts.push({ id: pn, name: null, notify: null, verifiedName: null, lid });
        mapped++;
      }

      console.log(
        `[baileys:${this.userId}] history batch: lidPairs=${mapped}/${lidsInBatch.size} syncType=${syncType} progress=${payload.progress ?? '-'} ` +
        `chats=${payload.chats.length} contacts=${payload.contacts.length} messages=${normalisedMessages.length}/${messages.length}`,
      );
      this.emitHistorySet(payload);
    });
  }

  /**
   * Replay the whole WhatsApp address book (saved names + LID pairings) by
   * re-fetching the contacts app-state collection from its snapshot. Same as
   * what happens right after a link; fires contacts.upsert for every entry.
   */
  async resyncContacts(): Promise<void> {
    const sock = this.sock;
    if (!sock) throw new Error('WhatsApp session is not connected');
    let seen = 0;
    const count = (list: unknown[]) => { seen += list.length; };
    sock.ev.on('contacts.upsert', count);
    try {
      await sock.authState.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } });
      await sock.resyncAppState(['critical_unblock_low'], true);
      // Buffered events flush right after the call resolves.
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      sock.ev.off('contacts.upsert', count);
    }
    console.log(`[baileys] ${this.userId} address-book resync: ${seen} contact entries`);
  }

  async downloadMedia(meta: MediaMeta): Promise<Buffer> {
    return downloadMediaFromMeta(meta, this.sock);
  }

  private async _normalise(msg: WAMessage): Promise<NormalisedMessage | null> {
    const jid = msg.key.remoteJid;
    if (!jid) return null;

    // Unwrap disappearing / view-once / document-with-caption envelopes.
    const content = normalizeMessageContent(msg.message);
    if (!content) return null;

    // Skip pure protocol messages (delivery receipts etc.)
    if (content.protocolMessage || content.senderKeyDistributionMessage) return null;
    // Skip reactions — they attach to messages, not form their own chat bubbles
    if (content.reactionMessage) return null;

    const timestampMs = Number(msg.messageTimestamp ?? 0) * 1000;
    const isGroupMsg = jid.endsWith('@g.us');
    const base = {
      waMessageId: msg.key.id ?? '',
      jid,
      fromMe: msg.key.fromMe ?? false,
      displayName: msg.pushName ?? null,
      timestampMs,
      groupSenderName: isGroupMsg && !msg.key.fromMe ? (msg.pushName ?? null) : null,
      groupSenderJid: isGroupMsg && !msg.key.fromMe ? (msg.key.participant ?? null) : null,
    };

    // ── Location ──────────────────────────────────────────────────────────────
    if (content.locationMessage) {
      const loc = content.locationMessage;
      return {
        ...base,
        messageType: MessageType.LOCATION,
        body: JSON.stringify({
          lat: loc.degreesLatitude,
          lng: loc.degreesLongitude,
          name: loc.name ?? null,
          address: loc.address ?? null,
        }),
        mediaUrl: null,
        mediaMimeType: null,
        quotedWaMessageId: null,
      };
    }

    // ── Contact card ──────────────────────────────────────────────────────────
    if (content.contactMessage || content.contactsArrayMessage) {
      const name =
        content.contactMessage?.displayName ??
        content.contactsArrayMessage?.contacts?.[0]?.displayName ?? null;
      return {
        ...base,
        messageType: MessageType.CONTACT_CARD,
        body: name,
        mediaUrl: null,
        mediaMimeType: null,
        quotedWaMessageId: null,
      };
    }

    // ── Text ─────────────────────────────────────────────────────────────────
    const textBody = content.conversation ?? content.extendedTextMessage?.text ?? null;
    if (textBody !== null && !content.imageMessage && !content.videoMessage &&
        !content.audioMessage && !content.documentMessage && !content.stickerMessage) {
      const quotedWaMessageId =
        content.extendedTextMessage?.contextInfo?.stanzaId ?? null;
      return {
        ...base,
        messageType: MessageType.TEXT,
        body: textBody,
        mediaUrl: null,
        mediaMimeType: null,
        quotedWaMessageId: quotedWaMessageId ?? null,
      };
    }

    // ── Media messages ────────────────────────────────────────────────────────
    const messageType = this._detectType(content);
    const captionBody =
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      content.documentMessage?.caption ??
      content.documentMessage?.fileName ??
      null;

    // Quoted message ID from any media type's context info
    const quotedWaMessageId =
      (content.imageMessage as any)?.contextInfo?.stanzaId ??
      (content.videoMessage as any)?.contextInfo?.stanzaId ??
      (content.audioMessage as any)?.contextInfo?.stanzaId ??
      (content.documentMessage as any)?.contextInfo?.stanzaId ??
      (content.stickerMessage as any)?.contextInfo?.stanzaId ??
      null;

    // Mime type from the media sub-message
    const mediaMsg: any =
      content.imageMessage ??
      content.videoMessage ??
      content.audioMessage ??
      content.documentMessage ??
      content.stickerMessage ??
      content.ptvMessage ??
      null;

    const mediaMimeType: string | null = mediaMsg?.mimetype ?? null;
    // Media itself is fetched after the message is stored (MediaStore), so
    // it can be keyed by the message row and served privately by the API.
    const mediaMeta = buildMediaMeta(msg, content);
    const mediaUrl: string | null = null;

    return {
      ...base,
      messageType,
      body: captionBody,
      mediaUrl,
      mediaMimeType,
      mediaMeta,
      quotedWaMessageId: quotedWaMessageId ?? null,
    };
  }

  // Historical messages: same as _normalise but no media download (content often unavailable)
  private async _normaliseHistorical(msg: WAMessage): Promise<NormalisedMessage | null> {
    const jid = msg.key.remoteJid;
    if (!jid) return null;
    const content = normalizeMessageContent(msg.message);
    if (!content) return null;
    if (content.protocolMessage || content.senderKeyDistributionMessage) return null;
    if (content.reactionMessage) return null;

    const timestampMs = Number(msg.messageTimestamp ?? 0) * 1000;
    const isGroupMsg = jid.endsWith('@g.us');
    const base = {
      waMessageId: msg.key.id ?? '',
      jid,
      fromMe: msg.key.fromMe ?? false,
      displayName: msg.pushName ?? null,
      timestampMs,
      groupSenderName: isGroupMsg && !msg.key.fromMe ? (msg.pushName ?? null) : null,
      groupSenderJid: isGroupMsg && !msg.key.fromMe ? (msg.key.participant ?? null) : null,
    };

    if (content.locationMessage) {
      const loc = content.locationMessage;
      return { ...base, messageType: MessageType.LOCATION,
        body: JSON.stringify({ lat: loc.degreesLatitude, lng: loc.degreesLongitude }),
        mediaUrl: null, mediaMimeType: null, quotedWaMessageId: null };
    }
    if (content.contactMessage || content.contactsArrayMessage) {
      const name = content.contactMessage?.displayName ?? null;
      return { ...base, messageType: MessageType.CONTACT_CARD,
        body: name, mediaUrl: null, mediaMimeType: null, quotedWaMessageId: null };
    }
    const textBody = content.conversation ?? content.extendedTextMessage?.text ?? null;
    if (textBody !== null) {
      const quotedWaMessageId = content.extendedTextMessage?.contextInfo?.stanzaId ?? null;
      return { ...base, messageType: MessageType.TEXT,
        body: textBody, mediaUrl: null, mediaMimeType: null, quotedWaMessageId: quotedWaMessageId ?? null };
    }
    // Non-text historical messages — keep what's needed to fetch the media on demand
    const messageType = this._detectType(content);
    const captionBody = (content.imageMessage?.caption ?? content.videoMessage?.caption
      ?? content.documentMessage?.caption ?? content.documentMessage?.fileName ?? null);
    return { ...base, messageType, body: captionBody,
      mediaUrl: null, mediaMimeType: mediaMimeOf(content), mediaMeta: buildMediaMeta(msg, content),
      quotedWaMessageId: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _detectType(content: Record<string, any>): MessageType {
    if (content.conversation || content.extendedTextMessage) return MessageType.TEXT;
    if (content.imageMessage) return MessageType.IMAGE;
    if (content.audioMessage) return MessageType.AUDIO;
    if (content.videoMessage || content.ptvMessage) return MessageType.VIDEO;
    if (content.documentMessage) return MessageType.DOCUMENT;
    if (content.stickerMessage) return MessageType.STICKER;
    if (content.contactMessage || content.contactsArrayMessage) return MessageType.CONTACT_CARD;
    if (content.locationMessage) return MessageType.LOCATION;
    if (content.protocolMessage?.type === 0) return MessageType.DELETED;
    return MessageType.TEXT;
  }

  private _mapReason(statusCode: number | undefined): TransportDisconnectReason {
    switch (statusCode) {
      case DisconnectReason.loggedOut: return 'logged_out';
      case DisconnectReason.badSession: return 'bad_session';
      case DisconnectReason.connectionReplaced: return 'replaced';
      default: return 'network';
    }
  }

  private _resetQrTimer(): void {
    this._clearQrTimer();
    this._qrTimer = setTimeout(async () => {
      console.log(`[baileys:${this.userId}] QR timeout — no scan after ${QR_TIMEOUT_MS / 1000}s`);
      await this.stop();
      this.emitDisconnected('timeout');
    }, QR_TIMEOUT_MS);
  }

  private _clearQrTimer(): void {
    if (this._qrTimer) {
      clearTimeout(this._qrTimer);
      this._qrTimer = null;
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async sendPresenceUpdate(
    presence: 'composing' | 'recording' | 'paused' | 'available',
    toJid: string
  ): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sock.sendPresenceUpdate(presence, toJid);
    } catch (err) {
      console.warn(`[baileys:${this.userId}] sendPresenceUpdate error:`, err);
    }
  }

  async fetchRecentMessages(jid: string, limit: number, cursor?: any): Promise<NormalisedMessage[]> {
    if (!this.sock) throw new Error('Transport not connected');
    console.log(`[baileys:${this.userId}] Fetching up to ${limit} messages from WA for JID ${jid}...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.sock as any).fetchMessagesFromWA(jid, limit, cursor);
    if (!result || result.length === 0) return [];
    
    const normalised: NormalisedMessage[] = [];
    for (const msg of result) {
      try {
        const norm = await this._normaliseHistorical(msg);
        if (norm) normalised.push(norm);
      } catch (err) {
        console.error(`[baileys:${this.userId}] Error normalising fetched message:`, err);
      }
    }
    return normalised;
  }
}
