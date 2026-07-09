import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import P from 'pino';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { MessageType } from '@zuri/types';
import {
  WhatsAppTransport,
  type NormalisedMessage,
  type TransportDisconnectReason,
  type TransportStatus,
} from './types';

const QR_TIMEOUT_MS = 3 * 60 * 1000;
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

export class BaileysTransport extends WhatsAppTransport {
  readonly userId: string;
  private sock: WASocket | null = null;
  private _status: TransportStatus = 'idle';
  private _stopping = false;
  private _reconnectCount = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _qrTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly authPath: string;
  private readonly mediaDir: string;

  constructor(userId: string, private readonly sessionsDir: string, private readonly pairingPhone?: string) {
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
    await this._boot();
  }

  async stop(): Promise<void> {
    this._stopping = true;
    this._clearQrTimer();
    this._clearReconnectTimer();
    if (this.sock) {
      try { this.sock.ws.close(); } catch { /* ignore */ }
      this.sock = null;
    }
    this._status = 'idle';
  }

  async sendText(jid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    await this.sock.sendMessage(jid, { text });
  }

  async requestLinkCode(phoneNumber: string): Promise<string> {
    if (!this.sock) throw new Error(`BaileysTransport: no active socket for user ${this.userId}`);
    const digits = phoneNumber.replace(/\D/g, '');
    if (!digits) throw new Error('Invalid phone number');
    return await this.sock.requestPairingCode(digits);
  }

  private async requestPairingCodeWithRetry(phone: string, maxAttempts = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!this.sock) throw new Error('Socket not ready');
        const digits = phone.replace(/\D/g, '');
        const code = await this.sock.requestPairingCode(digits);
        console.log(`[baileys:${this.userId}] pairing code generated (attempt ${attempt})`);
        this.emitLinkCode(code);
        return code;
      } catch (err) {
        console.error(`[baileys:${this.userId}] requestPairingCode failed (attempt ${attempt}):`, err);
        if (attempt === maxAttempts) throw err;
        await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
      }
    }
    throw new Error('Failed to generate pairing code');
  }

  private async _boot(): Promise<void> {
    // For phone-code pairing, always start fresh — stale auth files have
    // creds.registered = true which blocks requestPairingCode entirely.
    if (this.pairingPhone) {
      await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => {});
    }

    let version: [number, number, number];
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
    } catch {
      version = [2, 3000, 1015920080];
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: 'silent' }),
      browser: ['Zuri', 'Chrome', '120.0.0'],
    });

    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    // For phone-code pairing: call requestPairingCode with retry after a short handshake delay.
    if (this.pairingPhone) {
      setTimeout(async () => {
        try {
          await this.requestPairingCodeWithRetry(this.pairingPhone!);
        } catch (err) {
          console.error(`[baileys:${this.userId}] pairing code retry exhausted:`, err);
          this.emitDisconnected('bad_session');
        }
      }, 1500); // small delay for initial handshake
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this._resetQrTimer();
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          this.emitQr(dataUrl);
        } catch (err) {
          console.error(`[baileys:${this.userId}] QR encode error:`, err);
        }
      }

      if (connection === 'open') {
        this._clearQrTimer();
        this._clearReconnectTimer();
        this._reconnectCount = 0;
        this._status = 'connected';
        const raw = sock.user?.id ?? '';
        const phone = raw.split(':')[0].split('@')[0];
        this.emitConnected(phone);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = this._mapReason(statusCode);

        // Terminal conditions — need a new QR scan
        if (reason === 'logged_out') {
          this._clearQrTimer();
          this._status = 'idle';
          // Clear stale auth so the next connect attempt starts fresh (shows QR / accepts phone code)
          await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
          this.emitDisconnected('logged_out');
          return;
        }
        if (reason === 'bad_session') {
          this._clearQrTimer();
          this._status = 'idle';
          await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
          this.emitDisconnected('bad_session');
          return;
        }

        if (this._stopping) return;

        // Network / transient drop — retry with exponential backoff, no cap on attempts
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this._reconnectCount), RECONNECT_MAX_MS);
        this._reconnectCount++;
        this._status = 'connecting';
        console.log(`[baileys:${this.userId}] network drop — reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._reconnectCount})`);
        this._reconnectTimer = setTimeout(() => {
          if (!this._stopping) this._boot().catch(console.error);
        }, delay);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          const normalised = await this._normalise(msg);
          if (normalised) this.emitMessage(normalised);
        } catch (err) {
          console.error(`[baileys:${this.userId}] normalise error:`, err);
        }
      }
    });

    // Historical messages delivered on first connect — normalise then emit as a single batch
    // so the session manager can process them sequentially (avoid DB pool exhaustion).
    sock.ev.on('messaging-history.set', async ({ messages }) => {
      if (!messages || messages.length === 0) return;
      console.log(`[baileys:${this.userId}] historical sync: ${messages.length} raw messages`);
      const batch: import('./types').NormalisedMessage[] = [];
      for (const msg of messages) {
        try {
          const normalised = await this._normaliseHistorical(msg);
          if (normalised) batch.push(normalised);
        } catch (err) {
          console.error(`[baileys:${this.userId}] historical normalise error:`, err);
        }
      }
      console.log(`[baileys:${this.userId}] emitting historical batch: ${batch.length} messages`);
      this.emitHistoricalBatch(batch);
    });
  }

  private async _normalise(msg: WAMessage): Promise<NormalisedMessage | null> {
    const jid = msg.key.remoteJid;
    if (!jid) return null;

    const content = msg.message;
    if (!content) return null;

    // Skip pure protocol messages (delivery receipts etc.)
    if (content.protocolMessage || content.senderKeyDistributionMessage) return null;
    // Skip reactions — they attach to messages, not form their own chat bubbles
    if (content.reactionMessage) return null;

    const timestampMs = Number(msg.messageTimestamp ?? 0) * 1000;
    const base = {
      waMessageId: msg.key.id ?? '',
      jid,
      fromMe: msg.key.fromMe ?? false,
      displayName: msg.pushName ?? null,
      timestampMs,
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
      null;

    const mediaMimeType: string | null = mediaMsg?.mimetype ?? null;

    let mediaUrl: string | null = null;

    if (mediaMsg) {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const ext = mimeToExt(mediaMimeType ?? '');
        // Sanitise message ID for use as filename
        const safeId = (msg.key.id ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `\( {safeId}. \){ext}`;
        const filePath = path.join(this.mediaDir, fileName);
        await fs.writeFile(filePath, buffer as Buffer);
        mediaUrl = `/api/media/${fileName}`;
      } catch (err) {
        console.error(`[baileys:${this.userId}] media download failed for ${msg.key.id}:`, err);
      }
    }

    return {
      ...base,
      messageType,
      body: captionBody,
      mediaUrl,
      mediaMimeType,
      quotedWaMessageId: quotedWaMessageId ?? null,
    };
  }

  // Historical messages: same as _normalise but no media download (content often unavailable)
  private async _normaliseHistorical(msg: WAMessage): Promise<NormalisedMessage | null> {
    const jid = msg.key.remoteJid;
    if (!jid) return null;
    const content = msg.message;
    if (!content) return null;
    if (content.protocolMessage || content.senderKeyDistributionMessage) return null;
    if (content.reactionMessage) return null;

    const timestampMs = Number(msg.messageTimestamp ?? 0) * 1000;
    const base = {
      waMessageId: msg.key.id ?? '',
      jid,
      fromMe: msg.key.fromMe ?? false,
      displayName: msg.pushName ?? null,
      timestampMs,
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
    // Non-text historical messages — record type without downloading media
    const messageType = this._detectType(content);
    const captionBody = (content.imageMessage?.caption ?? content.videoMessage?.caption
      ?? content.documentMessage?.caption ?? null);
    return { ...base, messageType, body: captionBody,
      mediaUrl: null, mediaMimeType: null, quotedWaMessageId: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _detectType(content: Record<string, any>): MessageType {
    if (content.conversation || content.extendedTextMessage) return MessageType.TEXT;
    if (content.imageMessage) return MessageType.IMAGE;
    if (content.audioMessage) return MessageType.AUDIO;
    if (content.videoMessage) return MessageType.VIDEO;
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
        }
