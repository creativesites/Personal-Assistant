import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

class ApiError extends Error {
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

export const api = {
  async login(email: string, password: string) {
    return apiClient<{ token: string; user: { id: string; email: string; fullName: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
  },

  async getConversations() {
    return apiClient<ConversationSummary[]>('/api/conversations');
  },

  async getMessages(conversationId: string) {
    return apiClient<{ messages: Message[] }>(`/api/conversations/${conversationId}/messages`);
  },

  async getSuggestions(messageId: string) {
    return apiClient<ReplySuggestion[]>(`/api/messages/${messageId}/suggestions`);
  },

  async approveSuggestion(suggestionId: string) {
    return apiClient<{ ok: boolean }>(`/api/suggestions/${suggestionId}/approve`, { method: 'POST' });
  },

  async dismissSuggestion(suggestionId: string) {
    return apiClient<{ ok: boolean }>(`/api/suggestions/${suggestionId}/dismiss`, { method: 'POST' });
  },

  async getContacts() {
    return apiClient<Contact[]>('/api/contacts');
  },

  async getProactive() {
    return apiClient<ProactiveItem[]>('/api/proactive');
  },

  async updateProactive(id: string, status: 'approved' | 'dismissed' | 'snoozed') {
    return apiClient<{ ok: boolean }>(`/api/proactive/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};

// Types shared with web
export interface ConversationSummary {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  healthScore: number | null;
}

export interface Message {
  id: string;
  body: string;
  senderType: 'user' | 'contact';
  whatsappTimestamp: string;
  sentiment?: string;
  requiresResponse?: boolean;
}

export interface ReplySuggestion {
  id: string;
  body: string;
  tone: string;
  confidence: number;
}

export interface Contact {
  id: string;
  displayName: string;
  healthScore: number | null;
  importanceTier: number;
  summary: string | null;
}

export interface ProactiveItem {
  id: string;
  contactName: string;
  suggestionType: string;
  title: string;
  body: string;
  draftMessage: string | null;
  scheduledFor: string | null;
}
