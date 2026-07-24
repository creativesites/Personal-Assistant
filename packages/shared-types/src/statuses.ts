export interface WhatsAppStatus {
  id: string;
  userId: string;
  contactId: string | null;
  whatsappStatusId: string;
  mediaType: 'text' | 'image' | 'video';
  caption: string | null;
  mediaUrl: string | null;
  backgroundColor: string | null;
  font: number;
  viewsCount: number;
  isFromMe: boolean;
  aiInsight: string | null;
  expiresAt: string;
  createdAt: string;
  contact?: {
    id: string;
    name: string | null;
    phone: string;
    avatarUrl: string | null;
  };
}

export interface ContactStatusGroup {
  contactId: string | null;
  contactName: string;
  contactPhone: string;
  avatarUrl: string | null;
  isFromMe: boolean;
  hasUnviewed: boolean;
  statuses: WhatsAppStatus[];
}

export interface PostStatusInput {
  mediaType: 'text' | 'image' | 'video';
  caption?: string;
  mediaUrl?: string;
  backgroundColor?: string;
}
