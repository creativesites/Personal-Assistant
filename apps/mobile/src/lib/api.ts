import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<T>;
}

// Response shapes below mirror services/api exactly (see docs/mobile/BACKEND_API_MAP.md).
// The original scaffold assumed bare arrays and flat fields that the API never returned.
export const api = {
  async login(email: string, password: string) {
    return apiClient<{ token: string; user: { id: string; email: string; fullName: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
  },

  async getConversations(): Promise<ConversationSummary[]> {
    const data = await apiClient<{ conversations: ConversationSummary[] }>('/api/conversations?limit=100');
    return data.conversations ?? [];
  },

  async getMessages(conversationId: string) {
    return apiClient<{ messages: Message[]; contact: ConversationContact | null; hasMore: boolean }>(
      `/api/conversations/${conversationId}/messages`,
    );
  },

  async markRead(conversationId: string) {
    return apiClient<{ ok: boolean }>(`/api/conversations/${conversationId}/read`, { method: 'POST' });
  },

  async sendMessage(conversationId: string, text: string) {
    return apiClient<unknown>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async getSuggestions(messageId: string): Promise<ReplySuggestion[]> {
    const data = await apiClient<{ suggestions: ReplySuggestion[] }>(`/api/messages/${messageId}/suggestions`);
    return data.suggestions ?? [];
  },

  /** Approving a suggestion queues it for sending over WhatsApp. */
  async approveSuggestion(suggestionId: string, editedText?: string) {
    return apiClient<{ ok: boolean }>(`/api/suggestions/${suggestionId}/approve`, {
      method: 'POST',
      body: JSON.stringify(editedText ? { editedText } : {}),
    });
  },

  async dismissSuggestion(suggestionId: string) {
    return apiClient<{ ok: boolean }>(`/api/suggestions/${suggestionId}/dismiss`, { method: 'POST', body: '{}' });
  },

  async getContacts(): Promise<Contact[]> {
    const data = await apiClient<{ contacts: Contact[] }>('/api/contacts');
    return data.contacts ?? [];
  },

  async getProactive(): Promise<ProactiveItem[]> {
    const data = await apiClient<{ suggestions: ProactiveItem[] }>('/api/proactive');
    return data.suggestions ?? [];
  },

  /** Sends the nudge's draft over WhatsApp for real and marks it sent. */
  async sendProactive(id: string) {
    return apiClient<{ ok: boolean }>(`/api/proactive/${id}/send`, { method: 'POST', body: '{}' });
  },

  async updateProactive(id: string, status: 'approved' | 'dismissed' | 'snoozed') {
    return apiClient<{ ok: boolean }>(`/api/proactive/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};

export interface ConversationSummary {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isPinned: boolean;
  contact: { id: string; name: string; avatarUrl: string | null; phone: string | null; isGroup: boolean };
  relationshipType: string;
  healthScore: number | null;
  importanceTier: number;
  sentiment: string | null;
}

export interface ConversationContact {
  id: string;
  name: string;
  avatarUrl: string | null;
  isGroup: boolean;
  relationshipType: string;
  healthScore: number | null;
}

export interface Message {
  id: string;
  body: string | null;
  senderType: 'user' | 'contact';
  messageType: string;
  timestamp: string;
  senderDisplayName: string | null;
  analysis: { sentiment: string; requiresResponse: boolean } | null;
  pendingSuggestions: number;
}

export interface ReplySuggestion {
  id: string;
  text: string;
  tone: string | null;
  reasoning: string | null;
  needsOwner: boolean;
}

export interface Contact {
  id: string;
  name: string;
  company: string | null;
  jobTitle: string | null;
  lastMessageAt: string | null;
  relationship: {
    type: string;
    importanceTier: number;
    healthScore: number | null;
    healthTrend: string | null;
  };
  profile: { personalitySummary: string } | null;
}

export interface ProactiveItem {
  id: string;
  suggestionType: string;
  title: string;
  body: string;
  draftMessage: string | null;
  priority: number;
  suggestedForDate: string | null;
  contact: { id: string; name: string; avatarUrl: string | null; relationshipType: string };
}
