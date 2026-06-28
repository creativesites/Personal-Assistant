import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import P from 'pino';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MessageType } from '@zuri/types';
import {
  WhatsAppTransport,
  type NormalisedMessage,
  type TransportDisconnectReason,
  type TransportStatus,
} from './types';

const QR_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const MAX_RECONNECTS = 5;
const RECONNECT_DELAY_MS = 3000;

export class BaileysTransport extends WhatsAppTransport {
  readonly userId: string;
  private sock: WASocket | null = null;
  private _status: TransportStatus = 'idle';
  private _stopping = false;
  private _reconnectCount = 0;
  private _qrTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly authPath: string;

  constructor(userId: string, private readonly sessionsDir: string) {
    super();
    this.userId = userId;
    this.authPath = path.join(sessionsDir, userId);
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

  private async _boot(): Promise<void> {
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
        this._reconnectCount = 0;
        this._status = 'connected';
        const raw = sock.user?.id ?? '';
        const phone = raw.split(':')[0].split('@')[0];
        this.emitConnected(phone);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = this._mapReason(statusCode);

        if (reason === 'logged_out' || reason === 'bad_session') {
          this._clearQrTimer();
          this._status = 'idle';
          if (reason === 'bad_session') {
            await fs.rm(this.authPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
          }
          this.emitDisconnected(reason);
          return;
        }

        if (this._stopping) return;

        if (this._reconnectCount < MAX_RECONNECTS) {
          this._reconnectCount++;
          console.log(`[baileys:${this.userId}] reconnecting (${this._reconnectCount}/${MAX_RECONNECTS})...`);
          setTimeout(() => { if (!this._stopping) this._boot().catch(console.error); }, RECONNECT_DELAY_MS);
        } else {
          this._clearQrTimer();
          this._status = 'idle';
          this.emitDisconnected('network');
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        const normalised = this._normalise(msg);
        if (normalised) this.emitMessage(normalised);
      }
    });
  }

  private _normalise(msg: WAMessage): NormalisedMessage | null {
    const jid = msg.key.remoteJid;
    if (!jid) return null;

    const content = msg.message;
    if (!content) return null;

    // Skip protocol / delivery receipt messages
    if (
      content.protocolMessage ||
      content.senderKeyDistributionMessage ||
      content.reactionMessage
    ) return null;

    const body =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      content.documentMessage?.caption ??
      null;

    const timestampMs = Number(msg.messageTimestamp ?? 0) * 1000;

    return {
      waMessageId: msg.key.id ?? '',
      jid,
      fromMe: msg.key.fromMe ?? false,
      displayName: msg.pushName ?? null,
      messageType: this._detectType(content),
      body,
      timestampMs,
    };
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
}
