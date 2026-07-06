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
  /** Local API path for the downloaded media file: /api/media/<filename> */
  mediaUrl: string | null;
  mediaMimeType: string | null;
  /** WhatsApp message ID of the quoted/replied-to message */
  quotedWaMessageId: string | null;
}

export type TransportDisconnectReason =
  | 'logged_out'   // user removed the linked device — needs a new QR
  | 'bad_session'  // auth files corrupted — needs a new QR
  | 'timeout'      // QR was never scanned in the allowed window
  | 'network'      // all reconnect attempts exhausted
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
 */
export abstract class WhatsAppTransport extends EventEmitter {
  abstract readonly userId: string;

  /** Start the session (generate QR or restore from saved credentials). */
  abstract start(): Promise<void>;

  /** Cleanly shut down the session. */
  abstract stop(): Promise<void>;

  /** Send a text message to a JID. */
  abstract sendText(jid: string, text: string): Promise<void>;

  /**
   * Request a phone-number pairing code (alternative to QR).
   * phoneNumber must be digits only, no +, e.g. "15551234567".
   * Returns the 8-char code the user enters in WhatsApp → Linked Devices.
   */
  abstract requestLinkCode(phoneNumber: string): Promise<string>;

  abstract getStatus(): TransportStatus;

  // Typed emit helpers so subclasses never pass the wrong shape.
  protected emitQr(dataUrl: string): void { this.emit('qr', dataUrl); }
  protected emitConnected(phoneNumber: string): void { this.emit('connected', phoneNumber); }
  protected emitDisconnected(reason: TransportDisconnectReason): void { this.emit('disconnected', reason); }
  protected emitMessage(msg: NormalisedMessage): void { this.emit('message', msg); }
  protected emitHistoricalMessage(msg: NormalisedMessage): void { this.emit('historical_message', msg); }
  protected emitHistoricalBatch(msgs: NormalisedMessage[]): void { this.emit('historical_batch', msgs); }
}

export type TransportFactory = (userId: string) => WhatsAppTransport;
