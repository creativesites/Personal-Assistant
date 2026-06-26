export enum RelationshipType {
  FAMILY = 'family',
  ROMANTIC_PARTNER = 'romantic_partner',
  CLOSE_FRIEND = 'close_friend',
  FRIEND = 'friend',
  ACQUAINTANCE = 'acquaintance',
  COLLEAGUE = 'colleague',
  MENTOR = 'mentor',
  CLIENT = 'client',
  VENDOR = 'vendor',
  OTHER = 'other',
}

export enum ImportanceTier {
  CRITICAL = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
  MINIMAL = 5,
}

export enum HealthTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
}

export enum MessageSenderType {
  USER = 'user',
  CONTACT = 'contact',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT_CARD = 'contact_card',
  REACTION = 'reaction',
  DELETED = 'deleted',
  SYSTEM = 'system',
}

export enum SentimentType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
  MIXED = 'mixed',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ReplyStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SENT = 'sent',
  DISMISSED = 'dismissed',
  EDITED_AND_SENT = 'edited_and_sent',
}

export enum SuggestionType {
  CHECK_IN = 'check_in',
  BIRTHDAY_MESSAGE = 'birthday_message',
  FOLLOW_UP = 'follow_up',
  CONGRATULATE = 'congratulate',
  CONDOLENCE = 'condolence',
  RECONNECT = 'reconnect',
  RESPOND_TO_EVENT = 'respond_to_event',
  RELATIONSHIP_MAINTENANCE = 'relationship_maintenance',
}

export enum ProactiveStatus {
  PENDING = 'pending',
  SNOOZED = 'snoozed',
  APPROVED = 'approved',
  DISMISSED = 'dismissed',
  SENT = 'sent',
}

export enum WhatsAppInstanceStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  QR_PENDING = 'qr_pending',
  ERROR = 'error',
}

export enum SubscriptionPlan {
  FREE = 'free',
  MOBILE = 'mobile',
  STARTER = 'starter',
  PRO = 'pro',
}

export enum EventType {
  BIRTHDAY = 'birthday',
  ANNIVERSARY = 'anniversary',
  JOB_CHANGE = 'job_change',
  LIFE_EVENT = 'life_event',
  TRAVEL = 'travel',
  APPOINTMENT = 'appointment',
  DEADLINE = 'deadline',
  CELEBRATION = 'celebration',
  LOSS = 'loss',
  OTHER = 'other',
}
