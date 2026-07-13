export interface Contact {
  id: string
  name: string
  phone?: string
  avatarUrl: string | null
  tags?: string[]
  leadScore?: number
  lifetimeValue?: number
  pipelineStage?: string
  customerSince?: string
  lastPurchase?: string
  avgOrderValue?: number
  preferredProducts?: string[]
  communicationStyle?: string
  location?: string
}

export interface ContactInsight {
  key: string
  value: string
  confidence: number
  supportingText: string | null
  createdAt: string
}

export interface HealthHistoryEntry {
  score: number
  previousScore: number | null
  changeReason: string | null
  factors: unknown
  recordedAt: string
}

export interface ProactiveSuggestion {
  id: string
  suggestionType: string
  title: string
  body: string
  draftMessage: string | null
  priority: number
}

export interface UpcomingEvent {
  id: string
  eventType: string
  title: string
  eventDate: string
  isRecurring: boolean
  confidence: number
}

export interface ContactPromise {
  text: string
  detectedAt: string
  messageAt: string
}

// Business Workspace Phase 2 §7 — Inbox AI Action card. Driven by the
// existing contact_products 'quoted' signal, not a new detector.
export interface DocumentSuggestion {
  products: { productId: string; name: string; quantity: number; unitPriceCents: number }[]
  currency: string
  estimatedTotalCents: number
}

export interface ContactDetail {
  id: string
  name: string
  email: string | null
  company: string | null
  jobTitle: string | null
  industry: string | null
  website: string | null
  notes: string | null
  customerStatus: string | null
  pipelineStage: string | null
  leadScore: number | null
  tags: string[]
  relationship: {
    type: string
    importanceTier: number
    healthScore: number
    healthTrend: string
    lastInteractionAt: string | null
    notes: string | null
  }
  profile: {
    personalitySummary: string | null
    communicationStyle: string | null
    emotionalPatterns: string | null
    knownTriggers: string | null
    currentLifeContext: string | null
    moodBaseline: string | null
    preferences: string | null
    goals: string | null
    painPoints: string | null
    buyingBehaviour: string | null
    relationshipStage: string | null
  } | null
  insights: ContactInsight[]
  healthHistory: HealthHistoryEntry[]
  proactiveSuggestions: ProactiveSuggestion[]
  upcomingEvents: UpcomingEvent[]
  stats: { totalMessages: number; sent: number; received: number }
  documentSuggestion: DocumentSuggestion | null
}

export interface Conversation {
  id: string
  contact: Contact
  relationshipType: string
  healthScore: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  aiPriority?: 'hot_lead' | 'ready_to_buy' | 'needs_followup' | 'loyal' | 'dissatisfied' | 'appointment' | 'waiting' | null
  sentiment?: 'happy' | 'neutral' | 'frustrated' | 'angry' | null
  slaMinutes?: number | null
  leadScore?: number
}

export interface Message {
  id: string
  senderType: 'user' | 'contact'
  messageType?: string
  body: string | null
  timestamp: string
  pendingSuggestions: number
  mediaUrl?: string | null
  mediaMimeType?: string | null
  transcription?: string | null
  quotedMessageId?: string | null
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  approvalMode?: 'manual' | 'approved' | 'autonomous'
}

export interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
  confidence?: number
}

export interface InternalNote {
  id: string
  text: string
  author: string
  createdAt: string
}

export interface TimelineEvent {
  id: string
  type: 'message' | 'purchase' | 'invoice' | 'note' | 'followup' | 'complaint' | 'appointment'
  label: string
  date: string
}

export interface BriefingInsight {
  type: 'longest_wait' | 'hot_lead' | 'upcoming_event' | 'dormant_vip' | 'health_drop' | 'frustrated_contact' | 'proactive_queue'
  urgency: 'critical' | 'high' | 'medium' | 'low'
  label: string
  detail: string
  contactName?: string
  contactId?: string
  conversationId?: string
  meta?: Record<string, unknown>
}

export interface BriefingData {
  insights: BriefingInsight[]
  // Legacy flat strings — backwards compat
  items: string[]
  waitingCount: number
  highIntentCount: number
  slaBreachCount: number
  vipCount: number
}

export interface ConvContext {
  contactName: string | null
  summary: string | null
  dominantSentiment: string
  intents: string[]
  topTopics: string[]
  buyingSignals: string[]
  nextAction: string
  requiresResponse: boolean
  urgency: 'high' | 'normal'
  moodBaseline: string | null
  communicationStyle: string | null
  personalitySummary: string | null
  insights: Array<{ key: string; value: string; confidence: number }>
  analysedAt: string | null
}
