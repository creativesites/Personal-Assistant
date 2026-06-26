import type { MessageSenderType, MessageType } from './enums';

export interface IncomingMessageJob {
  userId: string;
  conversationId: string;
  messageId: string;
  contactId: string;
  senderType: MessageSenderType;
  messageType: MessageType;
  body?: string;
  transcription?: string;
  whatsappTimestamp: string;
}

export interface AnalyzeMessageJob {
  messageId: string;
  userId: string;
  contactId: string;
  conversationId: string;
}

export interface AnalyzeContactProfileJob {
  contactId: string;
  userId: string;
  triggerMessageId?: string;
}

export interface GenerateDailyProactiveJob {
  userId: string;
  date: string;
}

export interface SendReplyJob {
  userId: string;
  messageId: string;
  suggestedReplyId: string;
  recipientJid: string;
  text: string;
}

export interface GenerateContextSnapshotJob {
  contactId: string;
  userId: string;
  snapshotType: string;
}

export const QUEUE_NAMES = {
  MESSAGES_INCOMING: 'messages.incoming',
  ANALYSIS_MESSAGE: 'analysis.message',
  ANALYSIS_CONTACT_PROFILE: 'analysis.contact_profile',
  ANALYSIS_USER_PROFILE: 'analysis.user_profile',
  PROACTIVE_GENERATE_DAILY: 'proactive.generate_daily',
  CONTEXT_SNAPSHOT: 'context.snapshot',
  SEND_REPLY: 'send.reply',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
