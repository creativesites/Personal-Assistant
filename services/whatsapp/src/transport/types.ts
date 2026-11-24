import { EventEmitter } from 'events';
import type { MessageType } from '@zuri/types';

/**
 * A message normalised to a format independent of the underlying WhatsApp library.
 * Transports produce this; the rest of the service consumes it.
 */
export interface NormalisedMessage {
  waMessageId: string;
  /** The conversation JID — e.g. "15551234567@s.whatsapp.net" or group "...@g.us" */
  jid: string;
  fromMe: boolean;
  displayName: string | null;
  messageType: MessageType;
  body: string | null;
  timestampMs: number;
  /** Public URL (Supabase) or local API path (/api/media/<filename>) for the downloaded media file */
  mediaUrl: string | null;
  mediaMimeType: string | null;
  /** WhatsApp message ID of the quoted/replied-to message */
  quotedWaMessageId: string | null;
  /** Group chats only: push name of the participant who sent this message. Null for 1:1 chats. */
  groupSenderName: string | null;
  /** Group chats only: WhatsApp JID of the participant who sent this message. Null for 1:1 chats. */
  groupSenderJid: string | null;
  /** What's needed to download this message's media later (media messages only). */
  mediaMeta?: MediaMeta | null;
}

/**
 * Everything needed to download (and decrypt) a message's media at any later
 * time: the media sub-message as protobuf (mediaKey, directPath, mimetype…)
 * plus the message key, which a re-upload request for expired media needs.
 */
export interface MediaMeta {
  v: 1;
  /** e.g. 'imageMessage', 'audioMessage' */
  type: string;
  /** base64 proto.Message holding only the media sub-message */
  proto: string;
  key: { remoteJid: string | null; id: string | null; fromMe: boolean; participant: string | null };
  /** Bytes, when WhatsApp reported it. */
  size: number | null;
}

/** One chat from a WhatsApp history-sync batch (subset of proto Conversation). */
export interface HistoryChat {
  id: string;
  /** Saved address-book name for 1:1 chats, subject for groups. */
  name: string | null;
  /** The chat's @lid JID when `id` is the phone-number JID. */
  lidJid: string | null;
  /** The chat's phone-number JID when `id` is an @lid JID (newer protos). */
  pnJid: string | null;
  conversationTimestampMs: number | null;
  unreadCount: number;
  archived: boolean;
}

/** One contact hint from a history-sync batch (chat names, push names, business names). */
export interface HistoryContact {
  id: string;
  name: string | null;     // saved address-book name
  notify: string | null;   // the contact's own push name
  verifiedName: string | null;
  lid: string | null;
}

/** Everything one `messaging-history.set` event carried, normalised. */
export interface HistorySetPayload {
  chats: HistoryChat[];
  contacts: HistoryContact[];
  messages: NormalisedMessage[];
  syncType: number | null;
  /** WhatsApp's own 0-100 progress for the overall history transfer, when sent. */
  progress: number | null;
  isLatest: boolean | null;
}

export interface CatalogProductInput {
  name: string;
  description: string;
  price: number;
  currency: string;
  retailerId?: string;
}

export type TransportDisconnectReason =
  | 'logged_out'   // user removed the linked device — needs a new QR
  | 'bad_session'  // auth files corrupted — needs a new QR
  | 'timeout'      // QR was never scanned in the allowed window
  | 'network'      // all reconnect attempts exhausted
  | 'replaced'     // session replaced by another connection — do NOT reconnect automatically
  | 'unknown';

export type TransportStatus = 'idle' | 'connecting' | 'connected';

/**
 * Contract every WhatsApp transport adapter must fulfil.
 * SessionManager only talks to this interface.
 *
 * Events emitted:
 *   'qr'                 (dataUrl: string)                — QR code ready to display
 *   'connected'          (phoneNumber: string)            — session is live
 *   'disconnected'       (reason: TransportDisconnectReason) — session ended (terminal)
 *   'message'            (msg: NormalisedMessage)         — inbound message
 *   'historical_message' (msg: NormalisedMessage)         — historical message from initial sync
 *   'contact_hints'      (contacts: HistoryContact[])     — address-book names / LID pairings
 */
export abstract class WhatsAppTransport extends EventEmitter {
  abstract readonly userId: string;

  /** Start the session (generate QR or restore from saved credentials). */
  abstract start(): Promise<void>;

  /** Cleanly shut down the session. */
  abstract stop(): Promise<void>;

  /** Send a text message to a JID. */
  abstract sendText(
    jid: string,
    text: string,
    options?: { quotedWaMessageId?: string; quotedBody?: string }
  ): Promise<void>;

  /** Send a reaction emoji to a message. */
  abstract sendReaction(
    jid: string,
    emoji: string,
    targetWaMessageId: string,
    fromMe: boolean
  ): Promise<void>;

  /** Delete a message (revoke for everyone). */
  abstract deleteMessage(
    jid: string,
    waMessageId: string,
    fromMe: boolean
  ): Promise<void>;

  /** Fetch a contact's profile picture URL from WhatsApp. */
  abstract fetchProfilePictureUrl(jid: string): Promise<string | null>;

  /** Post a status update (text or media) to status@broadcast. */
  abstract postStatus(
    mediaType: 'text' | 'image' | 'video',
    content: string,
    options?: { caption?: string; backgroundColor?: string }
  ): Promise<void>;

  /** Send a typing or recording presence update signal to a JID. */
  abstract sendPresenceUpdate(
    presence: 'composing' | 'recording' | 'paused' | 'available',
    toJid: string
  ): Promise<void>;

  /** Send a document (e.g. a generated quotation/invoice PDF) to a JID. */
  abstract sendDocument(jid: string, filePath: string, mimetype: string, fileName: string, caption?: string): Promise<void>;

  /** List products in the connected WhatsApp Business catalog, if available. */
  abstract listCatalogProducts(limit?: number, cursor?: string): Promise<{ products: unknown[]; nextPageCursor?: string }>;

  /** Create a product in the connected WhatsApp Business catalog, if available. */
  abstract createCatalogProduct(product: CatalogProductInput): Promise<unknown>;

  /**
   * Request a phone-number pairing code (alternative to QR).
   * phoneNumber must be digits only, no +, e.g. "15551234567".
   * Returns the 8-char code the user enters in WhatsApp → Linked Devices.
   */
  abstract requestLinkCode(phoneNumber: string): Promise<string>;

  abstract getStatus(): TransportStatus;

  /** Re-fetch the address book (saved names, LID pairings); emits 'contact_hints'. */
  abstract resyncContacts(): Promise<void>;

  /** Download and decrypt a message's media, asking the phone to re-upload it if WhatsApp's copy expired. */
  abstract downloadMedia(meta: MediaMeta): Promise<Buffer>;

  /** Fetch recent messages for a JID from WA servers (for gap detection / self-healing). */
  abstract fetchRecentMessages(jid: string, limit: number): Promise<NormalisedMessage[]>;

  // Typed emit helpers so subclasses never pass the wrong shape.
  protected emitQr(dataUrl: string): void { this.emit('qr', dataUrl); }
  protected emitConnected(phoneNumber: string): void { this.emit('connected', phoneNumber); }
  protected emitDisconnected(reason: TransportDisconnectReason): void { this.emit('disconnected', reason); }
  protected emitMessage(msg: NormalisedMessage): void { this.emit('message', msg); }
  protected emitHistoricalMessage(msg: NormalisedMessage): void { this.emit('historical_message', msg); }
  protected emitHistorySet(payload: HistorySetPayload): void { this.emit('history_set', payload); }
  protected emitContactHints(contacts: HistoryContact[]): void { this.emit('contact_hints', contacts); }
  protected emitLinkCode(code: string): void { this.emit('link_code', code); }
}

export type TransportFactory = (userId: string, phoneNumber?: string, forceNewQR?: boolean) => WhatsAppTransport;
